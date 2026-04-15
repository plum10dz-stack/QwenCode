<script setup>
import { reactive, computed } from 'vue'
import ModalShell from './ModalShell.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSettingsStore } from '@/stores/settings'
import { useModalSave } from '@/composables/useModalSave.js'
import { useNotify } from '@/composables/useNotify.js'
import { fmtNum } from '@/utils/helpers'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { saving, handleSave } = useModalSave(emit)
const { notify } = useNotify()
const isEdit   = computed(() => !!modal.editId)
const todayISO = new Date().toISOString().split('T')[0]

const form = reactive({
  amount: 0, supplier_id: modal.prefill?.supplier_id || '',
  order_id: modal.prefill?.order_id || '', notes: '', date: todayISO,
  ...(modal.editData || {})
})

const supplierOptions = computed(() => db.suppliers.map(s => ({ value: s.id, label: s.name, sub: s.phone || '' })))
const orderOptions    = computed(() => {
  const pos = form.supplier_id ? db.purchaseOrders.filter(o => o.supplier_id === form.supplier_id) : db.purchaseOrders
  return pos.map(o => {
    const total = (o.lines || []).reduce((s,l) => s + (l.qty||0)*(l.price||0), 0)
    const paid  = db.poPaymentTotal(o.id)
    return { value: o.id, label: o.po_number, sub: `Total: ${fmtNum(total)} · Paid: ${fmtNum(paid)} · Due: ${fmtNum(total - paid)}` }
  })
})

const poTotalAmt  = computed(() => {
  const po = db.purchaseOrders.find(p => p.id === form.order_id)
  return po ? (po.lines||[]).reduce((s,l) => s + (l.qty||0)*(l.price||0), 0) : 0
})
const alreadyPaid = computed(() => form.order_id
  ? db.poPaymentTotal(form.order_id) - (isEdit.value ? (modal.editData?.amount || 0) : 0) : 0)
const remaining   = computed(() => poTotalAmt.value - alreadyPaid.value)

async function save() {
  if (!form.amount || form.amount <= 0) return notify.warn('Amount must be greater than 0')
  await handleSave(
    () => db.savePPayment({ ...form }, modal.editId),
    isEdit.value ? 'Payment updated' : `Payment of ${fmtNum(form.amount)} DZD recorded`
  )
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Purchase Payment' : 'New Purchase Payment'"
    :edit-mode="isEdit" :saving="saving" @close="emit('close')" @save="save">
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="input-wrap"><label>Date</label><input type="date" class="input" v-model="form.date"/></div>
        <div class="input-wrap"><label>Amount (DZD) *</label><input type="number" class="input" v-model.number="form.amount" min="0"/></div>
        <div class="input-wrap">
          <label>Supplier</label>
          <SearchableSelect :options="supplierOptions" v-model="form.supplier_id"
            placeholder="Supplier…" :search-mode="settings.searchMode" clearable/>
        </div>
        <div class="input-wrap">
          <label>Purchase Order</label>
          <SearchableSelect :options="orderOptions" v-model="form.order_id"
            placeholder="Select PO…" :search-mode="settings.searchMode" clearable/>
        </div>
        <div class="input-wrap col-span-2">
          <label>Notes</label>
          <textarea class="input" v-model="form.notes" rows="2"/>
        </div>
      </div>
      <div v-if="form.order_id" class="alert-row">
        <div class="space-y-1 w-full">
          <div class="flex justify-between" style="font-size:12px;color:var(--text2)">
            <span>PO Total</span><b class="font-mono">{{ fmtNum(poTotalAmt) }} DZD</b>
          </div>
          <div class="flex justify-between" style="font-size:12px;color:var(--accent3)">
            <span>Already Paid</span><b class="font-mono">{{ fmtNum(alreadyPaid) }} DZD</b>
          </div>
          <div class="flex justify-between" style="font-size:12px"
            :style="remaining < 0 ? 'color:var(--danger)' : 'color:var(--warn)'">
            <span>Remaining</span><b class="font-mono">{{ fmtNum(remaining) }} DZD</b>
          </div>
        </div>
      </div>
    </div>
  </ModalShell>
</template>
