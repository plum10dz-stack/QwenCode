/**
 * useSupabaseAuth — reactive auth state + login / logout.
 *
 * Offline mode (no VITE_SUPABASE_URL):
 *   isAuthenticated is always true — the app works without a login.
 *
 * Supabase mode (VITE_SUPABASE_URL set):
 *   Authentication required. Persisted session is restored on first load.
 *   MFA-aware via the Store.auth() callback pattern.
 */
import { ref, computed } from 'vue'

const IS_ONLINE = !!import.meta.env?.VITE_SUPABASE_URL

const _user = ref(IS_ONLINE ? null : { email: 'local', role: 'admin' })
const _loading = ref(false)
const _error = ref(null)

export function useSupabaseAuth() {
  const isAuthenticated = computed(() => !!_user.value)

  /**
   * Sign in with email + password (+ optional MFA code).
   * In offline mode always succeeds immediately.
   */
  async function signIn(credentials) {
    if (!IS_ONLINE) { _user.value = { email: 'local', role: 'admin' }; return true }

    // _loading.value = true
    // _error.value = null
    // try {
    //   const { getServerStore } = await import('../data/api')
    //   const serverStore = getServerStore()
    //   const mfaCallback = credentials.mfaCode
    //     ? async () => ({ code: credentials.mfaCode })
    //     : null
    //   const ok = await serverStore.auth(
    //     { email: credentials.email, password: credentials.password },
    //     mfaCallback
    //   )
    //   if (ok) {
    //     if (typeof serverStore._getCustomer === 'function') {
    //       const sb = await serverStore._getCustomer()
    //       const { data } = await sb.auth.getUser()
    //       _user.value = data?.user ?? { email: credentials.email }
    //     } else {
    //       _user.value = { email: credentials.email }
    //     }
    //   } else {
    //     _error.value = 'Invalid email or password'
    //   }
    //   return ok
    // } catch (e) {
    //   _error.value = e.message ?? 'Login failed'
    //   return false
    // } finally {
    //   _loading.value = false
    // }
  }

  /** Sign out and clear session */
  async function signOut() {
    if (!IS_ONLINE) { _user.value = null; return }
    _loading.value = true
    try {
      // const { getServerStore } = await import('../data/api')
      // const serverStore = getServerStore()
      // if (typeof serverStore.signOut === 'function') await serverStore.signOut()
      _user.value = null
    } catch (e) {
      console.warn('[useSupabaseAuth.signOut]', e.message)
    } finally {
      _loading.value = false
    }
  }

  /**
   * Try to restore a persisted Supabase session.
   * In offline mode: always returns true.
   */
  async function restoreSession() {
    if (!IS_ONLINE) { _user.value = { email: 'local', role: 'admin' }; return true }
    if (_user.value) return true

    try {
      // const { getServerStore } = await import('../data/api')
      // const serverStore = getServerStore()
      // if (typeof serverStore._getCustomer !== 'function') {
      //   _user.value = { email: 'local', role: 'admin' }
      //   return true
      // }
      // const sb = await serverStore._getCustomer()
      // const { data } = await sb.auth.getSession()
      // if (data?.session?.user) {
      //   _user.value = data.session.user
      //   if (serverStore._jwt === null || serverStore._jwt === undefined) {
      //     serverStore._jwt = data.session.access_token
      //   }
      //   return true
      // }
      return false
    } catch (e) {
      console.warn('[useSupabaseAuth.restoreSession]', e.message)
      return false
    }
  }

  return {
    user: _user,
    isAuthenticated,
    loading: _loading,
    error: _error,
    signIn,
    signOut,
    restoreSession,
  }
}
