<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useSettingsStore } from '@/stores/settings'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { fmtNum, fmtDate } from '@/utils/helpers'
import { exportCSV, exportJSON, exportExcel, exportHTML } from '@/utils/export'

const db = useDbStore(), settings = useSettingsStore()

// ── Filters ────────────────────────────────────────────────────────────────────
const f = ref({
  customerId: '', endCustomerId: '', paymentStatus: '',
  orderDateFrom: '', orderDateTo: '',
  deliveryDateFrom: '', deliveryDateTo: '',
  totalMin: '', totalMax: '',
  linesMin: '', linesMax: '',
  paidMin: '', paidMax: '',
})

const customerOptions = computed(() => [
  { value:'', label:'All Customers' },
  ...db.customers.map(c=>({value:c.id,label:c.full_name,sub:c.phone||''}))
])
const ecOptions = computed(() => [
  { value:'', label:'All End Customers' },
  ...db.endCustomers.map(c=>({value:c.id,label:c.full_name,sub:c.city||''}))
])

// ── Computed rows with all filters ─────────────────────────────────────────────
const rows = computed(() => {
  return db.salesOrders
    .map(so => {
      const paid      = db.soPaymentTotal(so.id)
      const remaining = (so.total||0) - paid
      let ps
      if (paid <= 0)           ps = 'unpaid'
      else if (paid >= so.total) ps = 'paid'
      else                     ps = 'partial'
      return { ...so, _paid: paid, _remaining: remaining, _payStatus: ps }
    })
    .filter(so => {
      const v = f.value
      if (v.customerId       && so.customer_id !== v.customerId)           return false
      if (v.endCustomerId  && so.end_customer_id !== v.endCustomerId) return false
      if (v.paymentStatus  && so._payStatus !== v.paymentStatus)      return false
      if (v.orderDateFrom  && so.created_at < v.orderDateFrom)        return false
      if (v.orderDateTo    && so.created_at > v.orderDateTo + 'T23:59') return false
      if (v.deliveryDateFrom && so.delivery_date < v.deliveryDateFrom) return false
      if (v.deliveryDateTo   && so.delivery_date > v.deliveryDateTo)   return false
      if (v.totalMin !== '' && (so.total||0) < Number(v.totalMin)) return false
      if (v.totalMax !== '' && (so.total||0) > Number(v.totalMax)) return false
      const nl = (so.lines||[]).length
      if (v.linesMin !== '' && nl < Number(v.linesMin)) return false
      if (v.linesMax !== '' && nl > Number(v.linesMax)) return false
      if (v.paidMin !== '' && so._paid < Number(v.paidMin)) return false
      if (v.paidMax !== '' && so._paid > Number(v.paidMax)) return false
      return true
    })
    .sort((a,b) => b.created_at?.localeCompare(a.created_at||''))
})

const totals = computed(() => ({
  orders:    rows.value.length,
  totalAmt:  rows.value.reduce((s,r)=>s+(r.total||0),0),
  paidAmt:   rows.value.reduce((s,r)=>s+r._paid,0),
  remaining: rows.value.reduce((s,r)=>s+r._remaining,0),
}))

const soBadge = s=>({draft:'b-gray',confirmed:'b-blue',processing:'b-cyan',shipped:'b-purple',delivered:'b-green',cancelled:'b-red'}[s]||'b-gray')
const payBadge = s=>({paid:'b-green',partial:'b-yellow',unpaid:'b-red'}[s]||'b-gray')
const payLabel = s=>({paid:'Paid',partial:'Partial',unpaid:'Unpaid'}[s]||s)

function clearFilters() {
  Object.keys(f.value).forEach(k => f.value[k] = '')
}
function doExport(fmt) {
  if (fmt==='csv')  exportCSV(rows.value,'customer-situation.csv')
  if (fmt==='json') exportJSON(rows.value,'customer-situation.json')
  if (fmt==='xlsx') exportExcel(rows.value,'customer-situation.xlsx','Customer Situation')
  if (fmt==='html') exportHTML(rows.value,'customer-situation.html','Customer Situation Report')
}
</script>

<template>
  <div>
    <!-- Filter panel -->
    <div class="card p-5 mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-display font-semibold">Filters</h3>
        <button class="btn btn-ghost btn-sm" @click="clearFilters">Clear All</button>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <!-- Customer / End Customer -->
        <div class="input-wrap">
          <label>Customer</label>
          <SearchableSelect :options="customerOptions" v-model="f.customerId" :search-mode="settings.searchMode"/>
        </div>
        <div class="input-wrap">
          <label>End Customer</label>
          <SearchableSelect :options="ecOptions" v-model="f.endCustomerId" :search-mode="settings.searchMode"/>
        </div>
        <div class="input-wrap">
          <label>Payment Status</label>
          <select class="input" v-model="f.paymentStatus">
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partially Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        <!-- Order date range -->
        <div class="input-wrap">
          <label>Order Date From</label>
          <input type="date" class="input" v-model="f.orderDateFrom"/>
        </div>
        <div class="input-wrap">
          <label>Order Date To</label>
          <input type="date" class="input" v-model="f.orderDateTo"/>
        </div>
        <!-- Delivery date range -->
        <div class="input-wrap">
          <label>Delivery Date From</label>
          <input type="date" class="input" v-model="f.deliveryDateFrom"/>
        </div>
        <div class="input-wrap">
          <label>Delivery Date To</label>
          <input type="date" class="input" v-model="f.deliveryDateTo"/>
        </div>
        <!-- Total range -->
        <div class="input-wrap">
          <label>Total Min (DZD)</label>
          <input type="number" class="input" v-model="f.totalMin" placeholder="0"/>
        </div>
        <div class="input-wrap">
          <label>Total Max (DZD)</label>
          <input type="number" class="input" v-model="f.totalMax" placeholder="∞"/>
        </div>
        <!-- Lines range -->
        <div class="input-wrap">
          <label>Lines Min</label>
          <input type="number" class="input" v-model="f.linesMin" placeholder="0" min="0"/>
        </div>
        <div class="input-wrap">
          <label>Lines Max</label>
          <input type="number" class="input" v-model="f.linesMax" placeholder="∞" min="0"/>
        </div>
        <!-- Paid range -->
        <div class="input-wrap">
          <label>Total Paid Min (DZD)</label>
          <input type="number" class="input" v-model="f.paidMin" placeholder="0"/>
        </div>
        <div class="input-wrap">
          <label>Total Paid Max (DZD)</label>
          <input type="number" class="input" v-model="f.paidMax" placeholder="∞"/>
        </div>
      </div>
    </div>

    <!-- Summary KPIs -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="card p-4"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px" class="font-mono">Orders</div><div class="font-display font-bold" style="font-size:26px">{{ totals.orders }}</div></div>
      <div class="card p-4"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px" class="font-mono">Total Amount</div><div class="font-display font-bold" style="font-size:26px;color:var(--accent3)">{{ fmtNum(totals.totalAmt) }}</div><div style="font-size:11px;color:var(--text3)">DZD</div></div>
      <div class="card p-4"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px" class="font-mono">Total Paid</div><div class="font-display font-bold" style="font-size:26px;color:var(--accent2)">{{ fmtNum(totals.paidAmt) }}</div><div style="font-size:11px;color:var(--text3)">DZD</div></div>
      <div class="card p-4"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px" class="font-mono">Remaining</div><div class="font-display font-bold" style="font-size:26px;color:var(--warn)">{{ fmtNum(totals.remaining) }}</div><div style="font-size:11px;color:var(--text3)">DZD</div></div>
    </div>

    <!-- Export bar -->
    <div class="flex gap-2 mb-4">
      <button class="btn btn-ghost btn-sm" @click="doExport('csv')">CSV</button>
      <button class="btn btn-ghost btn-sm" @click="doExport('json')">JSON</button>
      <button class="btn btn-ghost btn-sm" @click="doExport('xlsx')">Excel</button>
      <button class="btn btn-ghost btn-sm" @click="doExport('html')">HTML</button>
      <span style="font-size:12px;color:var(--text2);padding:6px 4px">{{ rows.length }} results</span>
    </div>

    <!-- Results table -->
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>SO#</th><th>Customer</th><th>End Customer</th><th>Order Date</th>
            <th>Delivery</th><th>Lines</th><th>Total</th><th>Paid</th><th>Remaining</th>
            <th>Order Status</th><th>Payment</th>
          </tr></thead>
          <tbody>
            <tr v-if="!rows.length"><td colspan="11" style="text-align:center;color:var(--text3);padding:32px">No results matching current filters.</td></tr>
            <tr v-for="so in rows" :key="so.id">
              <td class="font-mono" style="color:var(--accent)">{{ so.so_number }}</td>
              <td style="font-weight:500">{{ db.getCustomer(so.customer_id)?.full_name||'—' }}</td>
              <td style="color:var(--text2)">{{ db.getEndCustomer(so.end_customer_id)?.full_name||'—' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ so.created_at?.split('T')[0]||'—' }}</td>
              <td style="color:var(--text2)">{{ so.delivery_date||'—' }}</td>
              <td class="font-mono">{{ so.lines?.length||0 }}</td>
              <td class="font-mono font-bold" style="color:var(--accent3)">{{ fmtNum(so.total||0) }}</td>
              <td class="font-mono" style="color:var(--accent3)">{{ fmtNum(so._paid) }}</td>
              <td class="font-mono" :style="so._remaining>0?'color:var(--warn)':'color:var(--text3)'">{{ fmtNum(so._remaining) }}</td>
              <td><span class="badge" :class="soBadge(so.status)">{{ so.status }}</span></td>
              <td><span class="badge" :class="payBadge(so._payStatus)">{{ payLabel(so._payStatus) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
