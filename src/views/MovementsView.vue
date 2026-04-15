<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { usePagination } from '@/composables/usePagination'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { fmtDate } from '@/utils/helpers'

const db = useDbStore(); const modal = useModalStore(); const settings = useSettingsStore()
const search = ref(''); const typeFilter = ref('')

const typeBadge  = t => t==='in' ? 'b-green' : t==='out' ? 'b-red' : 'b-blue'
const typeColor  = t => t==='in' ? 'var(--accent3)' : t==='out' ? 'var(--danger)' : 'var(--info)'
const typePrefix = t => t==='in' ? '+' : t==='out' ? '−' : ''

const allRows = computed(() => [...db.movements].reverse())
const textFiltered = useTableSearch(allRows, [
  m => db.getProduct(m.product_id)?.name || '',
  m => db.getProduct(m.product_id)?.sku  || '',
  'reason', 'ref', 'type'
], search)

const filtered = computed(() => {
  let rows = textFiltered.value
  if (typeFilter.value) rows = rows.filter(m => m.type === typeFilter.value)
  return rows
})
const { page, totalPages, paginated, prev, next } = usePagination(filtered, 20)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <input class="input" style="width:220px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
        <select class="input" style="width:140px" v-model="typeFilter">
          <option value="">All Types</option>
          <option value="in">Stock In</option><option value="out">Stock Out</option><option value="adjustment">Adjustment</option>
        </select>
      </div>
      <button class="btn btn-primary" @click="modal.open('adjust')">+ New Movement</button>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Date</th><th>Product</th><th>SKU</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reason</th><th>Reference</th></tr></thead>
          <tbody>
            <tr v-if="!paginated.length"><td colspan="9" style="text-align:center;color:var(--text3);padding:32px">No movements recorded.</td></tr>
            <tr v-for="m in paginated" :key="m.id">
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ fmtDate(m.created_at) }}</td>
              <td style="font-weight:500">{{ db.getProduct(m.product_id)?.name || 'Deleted' }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ db.getProduct(m.product_id)?.sku || '—' }}</td>
              <td><span class="badge" :class="typeBadge(m.type)">{{ m.type }}</span></td>
              <td class="font-mono font-bold" :style="`color:${typeColor(m.type)}`">{{ typePrefix(m.type) }}{{ m.qty }}</td>
              <td class="font-mono" style="color:var(--text2)">{{ m.before }}</td>
              <td class="font-mono">{{ m.after }}</td>
              <td style="color:var(--text2)">{{ m.reason }}</td>
              <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ m.ref || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t" style="border-color:var(--border)">
        <span style="font-size:12px;color:var(--text2)">{{ filtered.length }} records</span>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="page<=1" @click="prev">← Prev</button>
          <span style="font-size:12px;color:var(--text2);padding:5px 10px">{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="page>=totalPages" @click="next">Next →</button>
        </div>
      </div>
    </div>
  </div>
</template>
