/**
 * useModalSave — shared async save pattern for all modals.
 *
 * Wraps an async save function with:
 *  - loading state (passed to ModalShell :saving prop)
 *  - success / error toast notifications
 *  - automatic modal close on success
 *
 * @example
 * const { saving, handleSave } = useModalSave(emit)
 * async function save() {
 *   await handleSave(
 *     () => db.saveProduct({ ...form }, modal.editId),
 *     'Product saved successfully'
 *   )
 * }
 */
import { useAsync }  from './useAsync.js'
import { useNotify } from './useNotify.js'

export function useModalSave(emit) {
  const { loading: saving, run } = useAsync()
  const { notify } = useNotify()

  /**
   * @param {() => Promise<any>} saveFn   - the async save action
   * @param {string}             successMsg
   * @param {string}             [failPrefix]
   */
  async function handleSave(saveFn, successMsg = 'Saved', failPrefix = 'Save failed') {
    try {
      await run(saveFn)
      notify.success(successMsg)
      emit('close')
    } catch (err) {
      notify.error(`${failPrefix}: ${err.message || err}`)
    }
  }

  return { saving, handleSave }
}
