<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'
import { fmtDate } from '@/utils/helpers'

const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { notify } = useNotify()
const { confirm } = useConfirm()
const search = ref(''), statusFilter = ref('')
const allRows = computed(() => db.endCustomers)
const textFiltered = useTableSearch(allRows, ['full_name','email','phone','city','tax_id'], search)
const filtered = computed(() => {
  if (statusFilter.value === 'active')   return textFiltered.value.filter(c => c.is_active)
  if (statusFilter.value === 'inactive') return textFiltered.value.filter(c => !c.is_active)
  return textFiltered.value
})
async function tryDelete(id) {
  if (!await confirm('Delete this end customer?')) return
  try { await db.deleteEndCustomer(id); notify.success('End customer deleted') }
  catch (e) { notify.error(e.message) }
}
</script>
<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div class="flex gap-3">
        <input class="input" style="width:240px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
        <select class="input" style="width:140px" v-model="statusFilter">
          <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <button class="btn btn-primary" @click="modal.open('end_customer')">+ New End Customer</button>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>City</th><th>Tax ID</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="8" style="text-align:center;color:var(--text3);padding:28px">No end customers. <span style="color:var(--accent);cursor:pointer" @click="modal.open('end_customer')">Add one</span></td></tr>
            <tr v-for="c in filtered" :key="c.id">
              <td style="font-weight:500">{{ c.full_name }}</td>
              <td class="font-mono" style="font-size:12px;color:var(--text2)">{{ c.phone||'—' }}</td>
              <td style="color:var(--text2)">{{ c.email||'—' }}</td>
              <td>{{ c.city||'—' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ c.tax_id||'—' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ fmtDate(c.created_at) }}</td>
              <td><span class="badge" :class="c.is_active?'b-green':'b-gray'">{{ c.is_active?'active':'inactive' }}</span></td>
              <td><div class="flex gap-1">
                <button class="btn btn-ghost btn-sm" @click="modal.open('end_customer',c)">Edit</button>
                <button class="btn btn-danger btn-sm" @click="tryDelete(c.id)">Del</button>
              </div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
