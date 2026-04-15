import { onMounted, onUnmounted } from 'vue'

export function useClickOutside(elementRef, callback) {
  function handler(e) {
    if (elementRef.value && !elementRef.value.contains(e.target)) callback()
  }
  onMounted(()  => document.addEventListener('mousedown', handler))
  onUnmounted(() => document.removeEventListener('mousedown', handler))
}
