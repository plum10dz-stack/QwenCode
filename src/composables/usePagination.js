import { ref, computed, watch } from 'vue'

export function usePagination(source, pageSize = 15) {
  const page = ref(1)

  const totalPages = computed(() => Math.ceil(source.value.length / pageSize) || 1)
  const paginated  = computed(() => source.value.slice((page.value - 1) * pageSize, page.value * pageSize))

  // Reset to page 1 whenever source length changes (filter applied)
  watch(() => source.value.length, () => { page.value = 1 })

  function prev() { if (page.value > 1) page.value-- }
  function next() { if (page.value < totalPages.value) page.value++ }

  return { page, totalPages, paginated, prev, next }
}
