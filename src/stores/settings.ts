import { defineStore } from 'pinia'

const KEY = 'stockos-settings'
const DEFAULTS = { searchMode: 'contains', defaultTva: 19, productSearchMode: 'simple' }

export const useSettingsStore = defineStore('settings', {
  state: () => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } }
    catch { return { ...DEFAULTS } }
  },
  getters: {
    searchModes: () => [
      { value: 'contains', label: 'Contains', desc: 'Matches anywhere in text.', example: '"lap" → "Laptop"' },
      { value: 'fuzzy', label: 'Fuzzy', desc: 'Characters in order, gaps ok.', example: '"lptp" → "Laptop"' },
      { value: 'startswith', label: 'Starts With', desc: 'Matches from beginning only.', example: '"lap" → "Laptop" NOT "Overlap"' },
    ],
    productSearchModes: () => [
      { value: 'simple', label: 'Simple Inline', desc: 'SearchableSelect dropdown inside the line row.' },
      { value: 'advanced', label: 'Advanced Popup', desc: 'Full-screen product picker table with filters.' },
    ]
  },
  actions: {
    setSearchMode(mode: any) { this.searchMode = mode; this.persist() },
    setDefaultTva(val: any) { this.defaultTva = Number(val); this.persist() },
    setProductSearchMode(mode: any) { this.productSearchMode = mode; this.persist() },
    persist() { localStorage.setItem(KEY, JSON.stringify({ searchMode: this.searchMode, defaultTva: this.defaultTva, productSearchMode: this.productSearchMode })) }
  }
})
