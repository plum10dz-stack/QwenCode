<script setup>
import { reactive, computed } from 'vue'
import ModalShell from './ModalShell.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSettingsStore } from '@/stores/settings'
import { useModalSave } from '@/composables/useModalSave.js'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { saving, handleSave } = useModalSave(emit)

const isEdit = computed(() => !!modal.editId)
const title  = computed(() => isEdit.value ? 'Edit Product' : 'New Product')
const sub    = computed(() => isEdit.value ? `SKU: ${form.sku}` : 'Fill in product details')

const form = reactive({
  name: '', sku: '', category: '', unit: 'pcs', supplier_id: '',
  buy_price: 0, sell_price: 0, low_stock: 5, initial_stock: 0,
  location: '', description: '', active: true,
  ...(modal.editData || {})
})

const catOptions      = computed(() => db.categories.map(c => ({ value: c.name, label: c.name, sub: `${c.abr}${c.ref ? ' · '+c.ref : ''}` })))
const unitOptions     = ['pcs','kg','g','L','mL','box','pack','roll','m','pair'].map(u => ({ value:u, label:u }))
const supplierOptions = computed(() => db.suppliers.map(s => ({ value: s.id, label: s.name, sub: s.phone || s.email || '' })))

async function save() {
  if (!form.name.trim()) return
  await handleSave(
    () => db.saveProduct({ ...form }, modal.editId),
    isEdit.value ? 'Product updated' : 'Product created'
  )
}
</script>

<template>
  <ModalShell :title="title" :sub="sub" :edit-mode="isEdit" :saving="saving" @close="emit('close')" @save="save">
    <div class="grid grid-cols-2 gap-4">
      <div class="input-wrap col-span-2">
        <label>Product Name *</label>
        <input class="input" v-model="form.name" placeholder="e.g. Laptop Pro X1" />
      </div>
      <div class="input-wrap"><label>SKU</label><input class="input" v-model="form.sku" placeholder="Auto-generated if empty"/></div>
      <div class="input-wrap"><label>Category</label><SearchableSelect :options="catOptions" v-model="form.category" placeholder="Select…" :search-mode="settings.searchMode"/></div>
      <div class="input-wrap"><label>Unit</label><SearchableSelect :options="unitOptions" v-model="form.unit" :search-mode="settings.searchMode"/></div>
      <div class="input-wrap"><label>Supplier</label><SearchableSelect :options="supplierOptions" v-model="form.supplier_id" placeholder="None" :search-mode="settings.searchMode" clearable/></div>
      <div class="input-wrap"><label>Buy Price (DZD)</label><input type="number" class="input" v-model.number="form.buy_price" min="0"/></div>
      <div class="input-wrap"><label>Sell Price (DZD)</label><input type="number" class="input" v-model.number="form.sell_price" min="0"/></div>
      <div class="input-wrap"><label>Low Stock Alert</label><input type="number" class="input" v-model.number="form.low_stock" min="0"/></div>
      <div class="input-wrap"><label>Initial Stock</label><input type="number" class="input" v-model.number="form.initial_stock" min="0" :disabled="isEdit"/></div>
      <div class="input-wrap"><label>Location / Bin</label><input class="input" v-model="form.location" placeholder="e.g. A-03-2"/></div>
      <div class="input-wrap col-span-2"><label>Description</label><textarea class="input" v-model="form.description"/></div>
    </div>
    <div class="flex items-center gap-3 mt-4">
      <div class="toggle" :class="{ on: form.active }" @click="form.active = !form.active"/>
      <span style="color:var(--text2);font-size:13px">Product Active</span>
    </div>
  </ModalShell>
</template>
