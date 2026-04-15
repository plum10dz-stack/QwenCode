import { computed } from 'vue'
import { applySearch } from '@/utils/search'
import { useSettingsStore } from '@/stores/settings'

/**
 * Returns a reactive filtered array using the global search mode setting.
 * @param {Ref<Array>} rows  – the source array ref
 * @param {string[]}   fields – field names to search across (or functions (row)=>string)
 * @param {Ref<string>} query – the search query ref
 */
export function useTableSearch(rows, fields, query) {
  const settings = useSettingsStore()
  return computed(() => {
    const q = query.value?.trim()
    if (!q) return rows.value
    return rows.value.filter(row =>
      fields.some(f => {
        const val = typeof f === 'function' ? f(row) : row[f]
        if (val == null) return false
        return applySearch(String(val), q, settings.searchMode).match
      })
    )
  })
}
