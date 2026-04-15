<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { fmtNum } from '@/utils/helpers'

const props  = defineProps({ modelValue: { default: '' } })
const emit   = defineEmits(['update:modelValue', 'selected', 'close'])
const db     = useDbStore()
const settings = useSettingsStore()
const search = ref('')

const allProducts = computed(() => db.products.filter(p => p.active))
const filtered    = useTableSearch(allProducts, ['name','sku','category','location'], search)

function pick(p) {
  emit('update:modelValue', p.id)
  emit('selected', p.id)
  emit('close')
}
const stockColor = p => p.stock === 0 ? 'var(--danger)' : p.stock <= p.low_stock ? 'var(--warn)' : 'var(--accent3)'
</script>

<template>
  <div class="modal-bg" @click.self="emit('close')">
    <div class="modal" style="width:780px;max-height:88vh">
      <div class="flex items-center justify-between p-5 border-b" style="border-color:var(--border)">
        <div>
          <h2 class="font-display font-bold text-lg">Product Picker</h2>
          <p style="font-size:12px;color:var(--text2)">Click a row to select · {{ filtered.length }} products</p>
        </div>
        <button class="btn btn-ghost btn-sm" @click="emit('close')">✕</button>
      </div>
      <div class="p-4 border-b" style="border-color:var(--border)">
        <input class="input" :placeholder="`Search (${settings.searchMode})…`" v-model="search" autofocus/>
      </div>
      <div class="tbl-wrap" style="max-height:52vh">
        <table>
          <thead><tr>
            <th>Name</th><th>SKU</th><th>Category</th>
            <th>Stock</th><th>Buy Price</th><th>Sell Price</th><th>Location</th>
          </tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">No products found.</td></tr>
            <tr v-for="p in filtered" :key="p.id" style="cursor:pointer" @click="pick(p)">
              <td>
                <div style="font-weight:500">{{ p.name }}</div>
                <div v-if="p.description" style="font-size:11px;color:var(--text3)">{{ p.description.substring(0,35) }}</div>
              </td>
              <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ p.sku }}</td>
              <td><span v-if="p.category" class="chip">{{ p.category }}</span></td>
              <td><span class="font-mono font-bold" :style="`color:${stockColor(p)}`">{{ p.stock }}</span><span style="color:var(--text3);font-size:11px"> {{ p.unit }}</span></td>
              <td class="font-mono" style="font-size:12px;color:var(--text2)">{{ fmtNum(p.buy_price) }}</td>
              <td class="font-mono" style="font-size:12px;color:var(--accent3)">{{ fmtNum(p.sell_price) }}</td>
              <td><span v-if="p.location" class="chip font-mono">{{ p.location }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
