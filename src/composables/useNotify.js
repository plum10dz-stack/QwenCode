/**
 * useNotify — lightweight toast notification system.
 *
 * Uses a module-level event bus so notifications work from
 * any composable, store action, or component without props.
 *
 * @example
 * // Send a notification
 * const { notify } = useNotify()
 * notify.success('Product saved')
 * notify.error('Failed to save: ' + err.message)
 * notify.info('Sync complete')
 *
 * // Render notifications (in App.vue)
 * const { toasts, dismiss } = useNotify()
 */
import { reactive } from 'vue'

let _nextId = 1

// Shared reactive list — lives at module scope so all callers share one list
const toasts = reactive([])

function push(type, message, duration = 4000) {
  const id = _nextId++
  toasts.push({ id, type, message })
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

function dismiss(id) {
  const i = toasts.findIndex(t => t.id === id)
  if (i > -1) toasts.splice(i, 1)
}

const notify = {
  success: (msg, ms) => push('success', msg, ms),
  error:   (msg, ms) => push('error',   msg, ms ?? 6000),
  info:    (msg, ms) => push('info',    msg, ms),
  warn:    (msg, ms) => push('warn',    msg, ms),
}

export function useNotify() {
  return { toasts, dismiss, notify }
}
