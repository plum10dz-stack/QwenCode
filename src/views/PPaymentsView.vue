<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { fmtNum, fmtDate } from '@/utils/helpers'

import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'

const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { notify } = useNotify()
const { confirm } = useConfirm()
const search = ref('')
const allRows = computed(() => [...db.pPayments].reverse())
const filtered = useTableSearch(allRows, [
  r => db.getSupplier(r.supplier_id)?.name || '',
  r => db.purchaseOrders.find(o => o.id === r.order_id)?.po_number || '',
  'notes'
], search)

const poTotal = po => po ? (po.lines||[]).reduce((s,l) => s+(l.qty||0)*(l.price||0), 0) : 0
const payStatus = p => {
  const po = db.purchaseOrders.find(o => o.id === p.order_id); if (!po) return null
  const paid = db.poPaymentTotal(po.id); const tot = poTotal(po)
  if (paid >= tot) return { label:'Paid', cls:'b-green' }
  if (paid > 0)    return { label:'Partial', cls:'b-yellow' }
  return { label:'Unpaid', cls:'b-red' }
}
</script>
<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <input class="input" style="width:260px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
      <button class="btn btn-primary" @click="modal.open('p_payment')">+ New Payment</button>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>PO</th><th>Amount</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="7" style="text-align:center;color:var(--text3);padding:28px">No payments yet.</td></tr>
            <tr v-for="p in filtered" :key="p.id">
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ fmtDate(p.date_created) }}</td>
              <td>{{ db.getSupplier(p.supplier_id)?.name || '—' }}</td>
              <td class="font-mono" style="color:var(--accent)">{{ db.purchaseOrders.find(o=>o.id===p.order_id)?.po_number || '—' }}</td>
              <td class="font-mono font-bold" style="color:var(--accent3)">{{ fmtNum(p.amount) }} DZD</td>
              <td><span v-if="payStatus(p)" class="badge" :class="payStatus(p).cls">{{ payStatus(p).label }}</span></td>
              <td style="color:var(--text2)">{{ p.notes || '—' }}</td>
              <td><div class="flex gap-1">
                <button class="btn btn-ghost btn-sm" @click="modal.open('p_payment', p)">Edit</button>
                <button class="btn btn-danger btn-sm" @click="async()=>{ if(await confirm('Delete payment?')){ try{await db.deletePPayment(p.id);notify.success('Payment deleted')}catch(e){notify.error(e.message)} } }">Del</button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-4 py-3 border-t flex items-center justify-between" style="border-color:var(--border)">
        <span style="font-size:12px;color:var(--text2)">{{ filtered.length }} payments</span>
        <b class="font-mono" style="color:var(--accent3)">{{ fmtNum(filtered.reduce((s,p)=>s+p.amount,0)) }} DZD total</b>
      </div>
    </div>
  </div>
</template>
