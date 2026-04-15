import { defineStore } from 'pinia'


export const useModalStore = defineStore('modal', {
  state: () => ({
    visible: false,
    type: '',       // 'product' | 'supplier' | 'customer' | 'so' | 'po' | 'adjust' | 'category' | 'settings'
    editId: null,
    editData: null,
    prefill: {}     // partial data to pre-populate (e.g. product_id for adjust)
  }),
  actions: {
    open(type: string, editData: any = null, prefill = {}) {
      this.type = type
      this.editId = editData?.id || null
      this.editData = editData ? { ...editData } : null
      this.prefill = prefill
      this.visible = true
    },
    close() { this.visible = false },
    afterClose() { this.type = ''; this.editId = null; this.editData = null; this.prefill = {} }
  }
})
