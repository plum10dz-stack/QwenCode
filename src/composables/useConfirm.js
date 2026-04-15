/**
 * useConfirm — async wrapper around window.confirm.
 *
 * In development this uses the native browser dialog.
 * Swap the implementation for a custom modal in the future
 * without changing any call-site.
 *
 * @example
 * const { confirm } = useConfirm()
 * if (await confirm('Delete this record?')) { ... }
 */
export function useConfirm() {
  /**
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  function confirm(message) {
    return Promise.resolve(window.confirm(message))
  }
  return { confirm }
}
