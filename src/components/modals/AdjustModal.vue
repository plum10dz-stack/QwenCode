<script setup>
import { reactive, computed } from 'vue'
import ModalShell from './ModalShell.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSettingsStore } from '@/stores/settings'
import { useModalSave } from '@/composables/useModalSave.js'
import { useNotify } from '@/composables/useNotify.js'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { saving, handleSave } = useModalSave(emit)
const { notify } = useNotify()

const REASONS = {
  in:         ['Purchase','Return from customer','Initial stock','Transfer in','Production'],
  out:        ['Sale','Damaged','Expired','Transfer out','Consumed','Theft'],
  adjustment: ['Stock count','Correction','System adjustment'],
}

const form = reactive({
  product_id: modal.prefill?.product_id || '',
  type: 'in', qty: 0, reason: 'Purchase', ref: ''
})

const productOptions = computed(() =>
  db.products.map(p => ({ value: p.id, label: p.name, sub: `${p.sku} · Stock: ${p.stock} ${p.unit}` }))
)
const typeOptions    = [
  { value: 'in',         label: 'Stock In (+)' },
  { value: 'out',        label: 'Stock Out (−)' },
  { value: 'adjustment', label: 'Adjustment (set)' },
]
const reasonOptions  = computed(() => (REASONS[form.type] || REASONS.in).map(r => ({ value: r, label: r })))
const currentProduct = computed(() => db.getProduct(form.product_id))

function onTypeChange() { form.reason = REASONS[form.type]?.[0] || '' }

async function save() {
  if (!form.product_id) return notify.warn('Select a product first')
  if (form.qty <= 0)    return notify.warn('Quantity must be greater than 0')
  await handleSave(
    () => db.adjustStock({ ...form }),
    `Stock ${form.type === 'in' ? 'added' : form.type === 'out' ? 'removed' : 'adjusted'} — ${form.qty} ${currentProduct.value?.unit || 'units'}`
  )
}
</script>

<template>
  <ModalShell title="Stock Movement" sub="Record a stock in, out, or adjustment"
    :saving="saving" @close="emit('close')" @save="save">
    <div class="space-y-4">
      <div class="input-wrap">
        <label>Product *</label>
        <SearchableSelect :options="productOptions" v-model="form.product_id"
          placeholder="Select product…" :search-mode="settings.searchMode"/>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="input-wrap">
          <label>Movement Type</label>
          <SearchableSelect :options="typeOptions" v-model="form.type"
            :search-mode="settings.searchMode" @update:modelValue="onTypeChange"/>
        </div>
        <div class="input-wrap">
          <label>{{ form.type === 'adjustment' ? 'New Quantity' : 'Quantity' }}</label>
          <input type="number" class="input" v-model.number="form.qty" min="0"/>
        </div>
        <div class="input-wrap">
          <label>Reason</label>
          <SearchableSelect :options="reasonOptions" v-model="form.reason"
            :search-mode="settings.searchMode"/>
        </div>
        <div class="input-wrap">
          <label>Reference / Note</label>
          <input class="input" v-model="form.ref" placeholder="PO-001, Invoice…"/>
        </div>
      </div>
      <div v-if="currentProduct" class="alert-row">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--accent);flex-shrink:0">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <path d="M12 8v4m0 4h.01" stroke-linecap="round" stroke-width="2"/>
        </svg>
        <span style="font-size:12px;color:var(--text2)">
          Current stock: <b style="color:var(--text)">{{ currentProduct.stock }} {{ currentProduct.unit }}</b>
        </span>
      </div>
    </div>
  </ModalShell>
</template>
