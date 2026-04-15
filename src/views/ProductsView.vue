<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSort } from '@/composables/useSort'
import { usePagination } from '@/composables/usePagination'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { fmtNum } from '@/utils/helpers'

const db       = useDbStore()
const modal    = useModalStore()
const settings = useSettingsStore()
const { notify } = useNotify()
const { confirm } = useConfirm()

const search      = ref('')
const catFilter   = ref('')
const stockFilter = ref('')

const { setSort, sortIcon, applySortToArray } = useSort('name')

// Apply global searchMode to the text search field
const textFiltered = useTableSearch(
  computed(() => db.products),
  ['name', 'sku', 'category', 'location', 'description'],
  search
)

const catOptions = computed(() => [
  { value: '', label: 'All Categories' },
  ...db.categories.map(c => ({ value: c.name, label: c.name, sub: c.abr }))
])

const filtered = computed(() => {
  let rows = textFiltered.value
  if (catFilter.value)              rows = rows.filter(p => p.category === catFilter.value)
  if (stockFilter.value === 'low')  rows = rows.filter(p => p.stock > 0 && p.stock <= p.low_stock)
  if (stockFilter.value === 'out')  rows = rows.filter(p => p.stock === 0)
  if (stockFilter.value === 'ok')   rows = rows.filter(p => p.stock > p.low_stock)
  return applySortToArray(rows)
})

const { page, totalPages, paginated, prev, next } = usePagination(filtered)

const stockColor    = p => p.stock === 0 ? 'var(--danger)' : p.stock <= p.low_stock ? 'var(--warn)' : 'var(--accent3)'
const stockBarColor = p => stockColor(p)
const stockBarPct   = p => Math.min(p.stock / ((p.low_stock * 4) || 20) * 100, 100)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <input class="input" style="width:230px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
        <!-- Category: SearchableSelect (not a fixed list) -->
        <div style="width:180px">
          <SearchableSelect :options="catOptions" v-model="catFilter" :search-mode="settings.searchMode"/>
        </div>
        <!-- Stock: fixed list → plain select -->
        <select class="input" style="width:135px" v-model="stockFilter">
          <option value="">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
          <option value="ok">In Stock</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" @click="db.exportCSV('products')">CSV</button>
        <button class="btn btn-primary" @click="modal.open('product')">+ New Product</button>
      </div>
    </div>
    <div class="card p-0 overflow-hidden">
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th @click="setSort('name')">Name {{ sortIcon('name') }}</th>
            <th>SKU</th><th>Category</th>
            <th @click="setSort('stock')">Stock {{ sortIcon('stock') }}</th>
            <th>Level</th>
            <th @click="setSort('buy_price')">Buy {{ sortIcon('buy_price') }}</th>
            <th @click="setSort('sell_price')">Sell {{ sortIcon('sell_price') }}</th>
            <th>Location</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            <tr v-if="!paginated.length">
              <td colspan="10" style="text-align:center;color:var(--text3);padding:32px">
                No products. <span style="color:var(--accent);cursor:pointer" @click="modal.open('product')">Add one</span>
              </td>
            </tr>
            <tr v-for="p in paginated" :key="p.id">
              <td>
                <div style="font-weight:500">{{ p.name }}</div>
                <div v-if="p.description" style="font-size:11px;color:var(--text3)">{{ p.description.substring(0,40) }}</div>
              </td>
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ p.sku }}</td>
              <td>
                <span v-if="p.category" class="chip">
                  {{ db.getCategoryByName(p.category)?.abr || p.category }}
                </span>
                <span v-else style="color:var(--text3)">—</span>
              </td>
              <td>
                <span class="font-mono font-bold" :style="`color:${stockColor(p)}`">{{ p.stock }}</span>
                <span style="color:var(--text3);font-size:11px"> {{ p.unit }}</span>
              </td>
              <td style="min-width:90px">
                <div class="stock-bar" style="width:90px">
                  <div class="stock-bar-fill" :style="`width:${stockBarPct(p)}%;background:${stockBarColor(p)}`"/>
                </div>
              </td>
              <td class="font-mono" style="font-size:12px">{{ fmtNum(p.buy_price) }}</td>
              <td class="font-mono" style="font-size:12px;color:var(--accent3)">{{ fmtNum(p.sell_price) }}</td>
              <td><span v-if="p.location" class="chip font-mono">{{ p.location }}</span><span v-else style="color:var(--text3)">—</span></td>
              <td><span class="badge" :class="p.active ? 'b-green' : 'b-gray'">{{ p.active ? 'active' : 'inactive' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <button class="btn btn-success btn-sm" @click="modal.open('adjust', null, { product_id: p.id })">±</button>
                  <button class="btn btn-ghost btn-sm" @click="modal.open('product', p)">Edit</button>
                  <button class="btn btn-danger btn-sm" @click="async () => { if (await confirm('Delete product?')) { try { await db.deleteProduct(p.id); notify.success('Product deleted') } catch(e) { notify.error(e.message) } } }">Del</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-4 py-3 border-t" style="border-color:var(--border)">
        <span style="font-size:12px;color:var(--text2)">
          {{ filtered.length }} products ·
          Value: <b style="color:var(--accent3)">{{ fmtNum(filtered.reduce((s,p) => s + p.stock * p.buy_price, 0)) }} DZD</b>
        </span>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" :disabled="page <= 1" @click="prev">← Prev</button>
          <span style="font-size:12px;color:var(--text2);padding:5px 10px">{{ page }} / {{ totalPages }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="page >= totalPages" @click="next">Next →</button>
        </div>
      </div>
    </div>
  </div>
</template>
