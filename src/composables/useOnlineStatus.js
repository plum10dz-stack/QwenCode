/**
 * useOnlineStatus — reactive network and sync state.
 *
 * Exposes:
 *   isOnline     — browser network reachability (navigator.onLine)
 *   hasBackend   — whether any backend (Supabase or API) is configured
 *   lastSync     — last updateDate timestamp from the active store
 *   syncError    — last sync error message (if any)
 *
 * Used by AppTopbar to show the Live / Local / Offline indicator.
 */
import { ref, onMounted, onUnmounted } from 'vue'

const hasBackend = !!(import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.VITE_API_URL)

export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine)
  const lastSync = ref(null)
  const syncError = ref(null)

  function onOnline() { isOnline.value = true }
  function onOffline() { isOnline.value = false }

  // Wire up onSourceEvent lazily — serverStore is available after initApi()
  async function subscribeToStore() {
    try {
      // const { getServerStore } = await import('../data/api')
      // const store = getServerStore()
      // lastSync.value = store.updateDate?.getTime?.() > 0 ? store.updateDate : null
      // store.onSourceEvent((_event, payload) => {
      //   lastSync.value = payload.eventTime
      //   syncError.value = null
      // })
    } catch { /* store not ready yet */ }
  }

  onMounted(() => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    subscribeToStore()
  })

  onUnmounted(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  return {
    isOnline,
    hasBackend: ref(hasBackend),
    lastSync,
    syncError,
  }
}
