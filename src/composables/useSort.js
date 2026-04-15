import { ref, computed } from 'vue'

export function useSort(initialKey = '', initialDir = 'asc') {
  const sortKey = ref(initialKey)
  const sortDir = ref(initialDir)

  function setSort(key) {
    if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = key; sortDir.value = 'asc' }
  }

  function sortIcon(key) {
    if (sortKey.value !== key) return ''
    return sortDir.value === 'asc' ? '↑' : '↓'
  }

  function applySortToArray(arr) {
    if (!sortKey.value) return arr
    return [...arr].sort((a, b) => {
      let v1 = a[sortKey.value], v2 = b[sortKey.value]
      if (typeof v1 === 'string') { v1 = v1.toLowerCase(); v2 = (v2 || '').toLowerCase() }
      if (v1 === undefined || v1 === null) return 1
      if (v2 === undefined || v2 === null) return -1
      const cmp = v1 > v2 ? 1 : v1 < v2 ? -1 : 0
      return sortDir.value === 'asc' ? cmp : -cmp
    })
  }

  return { sortKey, sortDir, setSort, sortIcon, applySortToArray }
}
