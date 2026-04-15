/**
 * SupabaseStore — implements the Store interface using Supabase.
 *
 * All server calls go through the single edge function:
 *   POST /functions/v1/api   { fn: "<handler>", ...params }
 *
 * Handlers:
 *   fn:"sync"       { since }
 *   fn:"new-id"     { table }
 *   fn:"row-save"   { table, row }
 *   fn:"row-delete" { table, id }
 *
 * LocalStore = IndexedDBStore (offline cache + source for Memory hydration)
 * Realtime   = Supabase Postgres Changes (live push → onSourceEvent)
 */

import { Store } from '../core/Store.js'
import { IndexedDBStore } from '../../data/stores/IndexedDBStore.js'
import { uuid, now } from '@/utils/helpers.js'

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? ''
const API_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : ''

/** camelCase → snake_case table name map */
const DB_TABLE = {
  categories: 'categories',
  suppliers: 'suppliers',
  customers: 'customers',
  endCustomers: 'end_customers',
  products: 'products',
  movements: 'movements',
  purchaseOrders: 'purchase_orders',
  salesOrders: 'sales_orders',
  sPayments: 's_payments',
  pPayments: 'p_payments',
}

export class SupabaseStore extends Store {
  /** @param {IndexedDBStore} localStore */
  constructor(localStore) {
    super()
    this._local = localStore
    this._online = !!SUPABASE_URL
    this._jwt = null      // populated after auth()
    this._supabase = null      // lazy Supabase JS customer
    this._channel = null      // Realtime channel
  }

  get LocalStore() { return this._local }

  // ── Single API call ────────────────────────────────────────────────────────
  /**
   * POST to the unified edge function.
   * @param {string} fn   - handler name
   * @param {object} params - merged into the request body alongside "fn"
   */
  async _call(fn, params = {}) {
    if (!this._online) throw new Error('Supabase not configured')
    if (!this._jwt) throw new Error('Not authenticated')

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._jwt}`,
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({ fn, ...params }),
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
    return payload
  }

  // ── Lazy Supabase JS customer ────────────────────────────────────────────────
  async _getCustomer() {
    if (this._supabase) return this._supabase
    // Use the installed npm package (avoids CDN cold-start lag)
    const { createCustomer } = await import('@supabase/supabase-js')
    this._supabase = createCustomer(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
    return this._supabase
  }

  // ── Store interface ─────────────────────────────────────────────────────────

  async getNewId(tableName) {
    if (!this._online || !this._jwt) return uuid()
    try {
      const { id } = await this._call('new-id', { table: tableName })
      return id
    } catch { return uuid() }
  }

  async newRow(tableName) {
    return { id: await this.getNewId(tableName), created_at: now() }
  }

  /**
   * Authenticate via Supabase Auth.
   * callback({ factorId }) → { code } for MFA flows.
   */
  async auth(user, callback) {
    if (!this._online) return true
    try {
      const sb = await this._getCustomer()
      const { data, error } = await sb.auth.signInWithPassword({
        email: user.email, password: user.password,
      })
      if (error) throw error

      if (!data.session && callback) {
        const totp = (data.factors ?? []).find(f => f.factor_type === 'totp')
        if (totp) {
          const { data: ch } = await sb.auth.mfa.challenge({ factorId: totp.id })
          const { code } = await callback({ factorId: totp.id })
          await sb.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code })
          const { data: s } = await sb.auth.getSession()
          this._jwt = s.session?.access_token ?? null
        }
      } else {
        this._jwt = data.session?.access_token ?? null
      }

      return !!this._jwt
    } catch (e) {
      console.warn('[SupabaseStore.auth]', e.message)
      return false
    }
  }

  async init() {
    await this._local.init()
    if (!this._online) return

    // Restore persisted session
    try {
      const sb = await this._getCustomer()
      const { data } = await sb.auth.getSession()
      this._jwt = data?.session?.access_token ?? null
      sb.auth.onAuthStateChange((_ev, session) => {
        this._jwt = session?.access_token ?? null
      })
    } catch (e) {
      console.warn('[SupabaseStore.init] session restore:', e.message)
      return
    }

    if (!this._jwt) return

    // Pull delta from the server via fn:"sync"
    try {
      const since = this.updateDate.toISOString()
      const delta = await this._call('sync', { since })
      for (const [tableName, change] of Object.entries(delta.tables ?? {})) {
        await this._local.applyDelta(tableName, change)
        if (change.eventTime) this.updateDate = new Date(change.eventTime)
      }
    } catch (e) {
      console.warn('[SupabaseStore.init] sync failed, using cache:', e.message)
    }

    this._subscribeRealtime()
  }

  // ── Realtime ────────────────────────────────────────────────────────────────
  async _subscribeRealtime() {
    if (!this._online || !this._jwt) return
    const sb = await this._getCustomer()
    const ch = sb.channel('stockos-realtime')

    for (const dbTable of Object.values(DB_TABLE)) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: dbTable },
        payload => this._handleRealtimeEvent(dbTable, payload)
      )
    }

    ch.subscribe(status => {
      if (status === 'SUBSCRIBED')
        console.info('[SupabaseStore] Realtime connected')
    })
    this._channel = ch
  }

  _handleRealtimeEvent(dbTable, payload) {
    const frontTable = Object.entries(DB_TABLE).find(([, v]) => v === dbTable)?.[0] ?? dbTable
    const eventTime = new Date()
    this.updateDate = eventTime

    if (payload.eventType === 'DELETE') {
      this._local.applyDelta(frontTable, { deletes: [{ id: payload.old.id }], updates: [] })
      this._emit('delete', { tableName: frontTable, deletes: [{ id: payload.old.id }], updates: [], eventTime })
    } else {
      this._local.applyDelta(frontTable, { deletes: [], updates: [payload.new] })
      this._emit('update', { tableName: frontTable, deletes: [], updates: [payload.new], eventTime })
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────
  async getAll(tableName) {
    // Serve from local cache — fresh data comes through sync/Realtime
    return this._local.getAll(tableName)
  }

  /**
   * Force a fresh full load of one table from the server,
   * bypassing the local cache. Updates IndexedDB after fetch.
   * Emits update events so Memory re-hydrates.
   */
  async refreshTable(tableName) {
    if (!this._online || !this._jwt) return
    try {
      const { rows } = await this._call('get-rows', { table: tableName })
      await this._local.applyDelta(tableName, { deletes: [], updates: rows })
      this._emit('update', {
        tableName,
        deletes: [],
        updates: rows,
        eventTime: new Date(),
      })
    } catch (e) {
      console.warn(`[SupabaseStore.refreshTable] ${tableName}:`, e.message)
    }
  }

  /** Sign out: revoke session server-side + clear local JWT */
  async signOut() {
    if (this._online && this._jwt) {
      await this._call('sign-out').catch(() => { })
    }
    try {
      const sb = await this._getCustomer()
      await sb.auth.signOut()
    } catch { /* ignore */ }
    this._jwt = null
    if (this._channel) {
      const sb = await this._getCustomer()
      await sb.removeChannel(this._channel).catch(() => { })
      this._channel = null
    }
  }

  async saveRow(tableName, row) {
    if (!this._online || !this._jwt)
      return this._local.saveRow(tableName, row)
    try {
      const { row: saved } = await this._call('row-save', { table: tableName, row })
      await this._local.saveRow(tableName, saved)
      return saved
    } catch (e) {
      console.warn('[SupabaseStore.saveRow]', e.message)
      throw e
    }
  }

  async deleteRow(tableName, id) {
    if (!this._online || !this._jwt)
      return this._local.deleteRow(tableName, id)
    try {
      await this._call('row-delete', { table: tableName, id })
      await this._local.deleteRow(tableName, id)
    } catch (e) {
      console.warn('[SupabaseStore.deleteRow]', e.message)
      throw e
    }
  }
}
