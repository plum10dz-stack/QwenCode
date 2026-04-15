/**
 * useAsync — wraps an async function with reactive loading + error state.
 *
 * @example
 * const { loading, error, run } = useAsync()
 * await run(() => db.saveProduct(form))
 * if (error.value) console.error(error.value)
 */
import { ref } from 'vue'

export function useAsync() {
  const loading = ref(false)
  const error   = ref(null)

  /**
   * Execute an async function, managing loading/error state automatically.
   * @param {() => Promise<any>} fn
   * @returns {Promise<any>} resolved value, or undefined on error
   */
  async function run(fn) {
    loading.value = true
    error.value   = null
    try {
      return await fn()
    } catch (e) {
      error.value = e?.message || String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return { loading, error, run }
}
