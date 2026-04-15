<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSort } from '@/composables/useSort'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'
import { fmtDate } from '@/utils/helpers'
import { useRouter } from 'vue-router'

const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore(), router = useRouter()
const { notify } = useNotify()
const { confirm } = useConfirm()

const search       = ref('')
const statusFilter = ref('')
const { setSort, sortIcon, applySortToArray } = useSort('full_name')

const textFiltered = useTableSearch(
  computed(() => db.customers),
  ['full_name', 'email', 'phone', 'city', 'tax_id', 'notes'],
  search
)

const filtered = computed(() => {
  let rows = textFiltered.value
  if (statusFilter.value === 'active')   rows = rows.filter(c => c.is_active)
  if (statusFilter.value === 'inactive') rows = rows.filter(c => !c.is_active)
  return applySortToArray(rows)
})

const customerOrders = id => db.salesOrders.filter(o => o.customer_id === id).length
function goToOrders(customerId) { router.push({ path: '/sales-orders', query: { customer: customerId } }) }
async function tryDelete(id) {
  if (!await confirm('Delete this customer?')) return
  try { await db.deleteCustomer(id); notify.success('Customer deleted') }
  catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <input class="input" style="width:240px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
        <select class="input" style="width:140px" v-model="statusFilter">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" @click="db.exportCSV('customers')">CSV</button>
        <button class="btn btn-primary" @click="modal.open('customer')">+ New Customer</button>
      </div>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th @click="setSort('full_name')">Name {{ sortIcon('full_name') }}</th>
            <th>Phone</th><th>Email</th><th>City</th><th>Tax ID</th>
            <th @click="setSort('created_at')">Created {{ sortIcon('created_at') }}</th>
            <th>Orders</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            <tr v-if="!filtered.length">
              <td colspan="9" style="text-align:center;color:var(--text3);padding:32px">
                No customers. <span style="color:var(--accent);cursor:pointer" @click="modal.open('customer')">Add one</span>
              </td>
            </tr>
            <tr v-for="c in filtered" :key="c.id">
              <td><div style="font-weight:500">{{ c.full_name }}</div><div v-if="c.notes" style="font-size:11px;color:var(--text3)">{{ c.notes.substring(0,40) }}</div></td>
              <td class="font-mono" style="font-size:12px;color:var(--text2)">{{ c.phone || '—' }}</td>
              <td style="color:var(--text2)">{{ c.email || '—' }}</td>
              <td>{{ c.city || '—' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ c.tax_id || '—' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ fmtDate(c.created_at) }}</td>
              <td><span class="badge b-blue" style="cursor:pointer" @click="goToOrders(c.id)">{{ db.salesOrders.filter(o=>o.customer_id===c.id).length }}</span></td>
              <td><span class="badge" :class="c.is_active ? 'b-green' : 'b-gray'">{{ c.is_active ? 'active' : 'inactive' }}</span></td>
              <td><div class="flex gap-1">
                <button class="btn btn-ghost btn-sm" @click="modal.open('customer', c)">Edit</button>
                <button class="btn btn-danger btn-sm" @click="tryDelete(c.id)">Del</button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center px-4 py-3 border-t" style="border-color:var(--border)">
        <span style="font-size:12px;color:var(--text2)">{{ filtered.length }} customers</span>
      </div>
    </div>
  </div>
</template>
