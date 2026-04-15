<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'
import { fmtNum, fmtDate } from '@/utils/helpers'
import { exportCSV, exportJSON, exportExcel, exportHTML, shareWhatsApp, shareEmail, orderSummaryText } from '@/utils/export'

const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { notify } = useNotify()
const { confirm } = useConfirm()
const search = ref(''), statusFilter = ref('')
const poBadge = s=>({draft:'b-gray',sent:'b-blue',confirmed:'b-cyan',received:'b-green',cancelled:'b-red'}[s]||'b-gray')
const poTotal = po => (po.lines||[]).reduce((s,l)=>s+(l.qty||0)*(l.price||0),0)

const allRows = computed(() => [...db.purchaseOrders].reverse())
const textFiltered = useTableSearch(allRows, [
  'po_number','por','notes','status',
  r => db.getSupplier(r.supplier_id)?.name||''
], search)
const filtered = computed(() => {
  if (statusFilter.value) return textFiltered.value.filter(p=>p.status===statusFilter.value)
  return textFiltered.value
})

async function tryDelete(id) {
  const po = db.purchaseOrders.find(p => p.id === id); if (!po) return
  if (!await confirm(`Delete PO ${po.po_number}?`)) return
  try { await db.deletePO(id); notify.success('Purchase order deleted') }
  catch (e) { notify.error(e.message) }
}
async function confirmReceive(id) {
  const po = db.purchaseOrders.find(p => p.id === id); if (!po) return
  if (!await confirm(`Receive ${po.po_number}? Stock will be added for all lines.`)) return
  try { await db.receivePO(id); notify.success(`PO ${po.po_number} received — stock updated`) }
  catch (e) { notify.error(e.message) }
}
function payBadge(poId, total) {
  const paid = db.poPaymentTotal(poId)
  if (!total) return null
  if (paid >= total) return { label:'Paid', cls:'b-green' }
  if (paid > 0)      return { label:'Partial', cls:'b-yellow' }
  return { label:'Unpaid', cls:'b-red' }
}
function doExport(fmt) {
  if (fmt==='csv')  exportCSV(filtered.value,'purchase-orders.csv')
  if (fmt==='json') exportJSON(filtered.value,'purchase-orders.json')
  if (fmt==='xlsx') exportExcel(filtered.value,'purchase-orders.xlsx','Purchase Orders')
  if (fmt==='html') exportHTML(filtered.value,'purchase-orders.html','Purchase Orders')
}
function sharePO(po, channel) {
  const text = `PO: ${po.po_number}${po.por?' (POR: '+po.por+')':''}\nSupplier: ${db.getSupplier(po.supplier_id)?.name||'—'}\nTotal: ${fmtNum(poTotal(po))} DZD`
  if (channel==='wa')    shareWhatsApp(text)
  if (channel==='email') shareEmail(`Purchase Order ${po.po_number}`, text)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div class="flex gap-3">
        <input class="input" style="width:220px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
        <select class="input" style="width:145px" v-model="statusFilter">
          <option value="">All Status</option>
          <option v-for="s in ['draft','sent','confirmed','received','cancelled']" :key="s">{{ s }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" @click="doExport('csv')">CSV</button>
        <button class="btn btn-ghost btn-sm" @click="doExport('json')">JSON</button>
        <button class="btn btn-ghost btn-sm" @click="doExport('xlsx')">Excel</button>
        <button class="btn btn-ghost btn-sm" @click="doExport('html')">HTML</button>
        <button class="btn btn-primary" @click="modal.open('po')">+ New PO</button>
      </div>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>PO#</th><th>POR</th><th>Supplier</th><th>Lines</th><th>Total</th><th>Paid</th><th>Expected</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="10" style="text-align:center;color:var(--text3);padding:28px">No purchase orders.</td></tr>
            <tr v-for="po in filtered" :key="po.id">
              <td class="font-mono" style="color:var(--accent)">{{ po.po_number }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ po.por||'—' }}</td>
              <td style="font-weight:500">{{ db.getSupplier(po.supplier_id)?.name||'—' }}</td>
              <td class="font-mono">{{ po.lines?.length||0 }}</td>
              <td class="font-mono">{{ fmtNum(poTotal(po)) }} DZD</td>
              <td class="font-mono" style="color:var(--accent3)">{{ fmtNum(db.poPaymentTotal(po.id)) }} DZD</td>
              <td style="color:var(--text2)">{{ po.expected_date||'—' }}</td>
              <td><span class="badge" :class="poBadge(po.status)">{{ po.status }}</span></td>
              <td><span v-if="payBadge(po.id,poTotal(po))" class="badge" :class="payBadge(po.id,poTotal(po)).cls">{{ payBadge(po.id,poTotal(po)).label }}</span></td>
              <td>
                <div class="flex gap-1 flex-wrap">
                  <button v-if="!['received','cancelled'].includes(po.status)" class="btn btn-success btn-sm" @click="confirmReceive(po.id)">✓ Recv</button>
                  <button class="btn btn-ghost btn-sm" @click="modal.open('p_payment',null,{supplier_id:po.supplier_id,order_id:po.id})" title="Add Payment">💰</button>
                  <button class="btn btn-ghost btn-sm" @click="sharePO(po,'wa')" title="WhatsApp">📱</button>
                  <button class="btn btn-ghost btn-sm" @click="sharePO(po,'email')" title="Email">✉</button>
                  <button class="btn btn-ghost btn-sm" @click="modal.open('po',po)">Edit</button>
                  <button class="btn btn-danger btn-sm" @click="tryDelete(po.id)">Del</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
