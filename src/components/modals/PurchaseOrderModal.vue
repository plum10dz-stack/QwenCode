<script setup>
import { reactive, computed, ref, nextTick } from 'vue'
import ModalShell from './ModalShell.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import ProductPickerModal from './ProductPickerModal.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSettingsStore } from '@/stores/settings'
import { useAsync } from '@/composables/useAsync.js'
import { useNotify } from '@/composables/useNotify.js'
import { uuid, poSeq, fmtNum } from '@/utils/helpers'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { loading: saving, run } = useAsync()
const { notify } = useNotify()
const isEdit = computed(() => !!modal.editId)
const todayISO = new Date().toISOString().split('T')[0]
const orderId   = modal.editId || uuid()
const savedInDb = ref(!!modal.editId)
const pickerLine = ref(null)

const form = reactive({
  id: orderId, po_number: poSeq(), por: '', supplier_id: '',
  expected_date: todayISO, status: 'draft', notes: '', lines: [],
  ...(modal.editData ? { ...modal.editData, lines: modal.editData.lines?.map(l=>({...l}))||[] } : {})
})

const supplierRef     = ref(null)
const expectedDateRef = ref(null)
const notesRef        = ref(null)
const productRefs     = ref([])
const qtyRefs         = ref([])
const priceRefs       = ref([])
const setProductRef = (el,i) => { if(el) productRefs.value[i]=el }
const setQtyRef     = (el,i) => { if(el) qtyRefs.value[i]=el }
const setPriceRef   = (el,i) => { if(el) priceRefs.value[i]=el }

// Auto-focus supplier on mount
nextTick(() => { if (!isEdit.value) supplierRef.value?.openDropdown() })

const supplierOptions = computed(() => db.suppliers.map(s => ({ value:s.id, label:s.name, sub:s.phone||'' })))
const productOptions  = computed(() => db.products.filter(p=>p.active).map(p => ({
  value: p.id, label: p.name,
  sub: `SKU:${p.sku}  Buy:${fmtNum(p.buy_price)}  Stock:${p.stock}${p.unit}`
})))
const poStatusOpts  = ['draft','sent','confirmed','received','cancelled'].map(s=>({value:s,label:s}))
const total         = computed(() => form.lines.reduce((s,l) => s+(l.qty||0)*(l.price||0), 0))
const paidTotal     = computed(() => db.poPaymentTotal(form.id))
const remaining     = computed(() => total.value - paidTotal.value)

function persistHeader() {
  if (!form.supplier_id) return
  db.upsertPO({ ...form, lines: form.lines.map(l=>({...l})) })
  savedInDb.value = true
}
function onSupplierSelected()    { persistHeader(); nextTick(() => expectedDateRef.value?.focus()) }
function onExpectedDateEnter()   { notesRef.value?.focus() }
function onNotesEnter(e) { if (!e.shiftKey) { e.preventDefault(); addLineAndFocus() } }

function addLine() { form.lines.push({ _id:uuid(), product_id:'', qty:1, price:0, confirmed:false }) }
function addLineAndFocus() {
  addLine()
  nextTick(() => {
    const i = form.lines.length - 1
    if (settings.productSearchMode === 'advanced') pickerLine.value = i
    else productRefs.value[i]?.openDropdown()
  })
}
function removeLine(i) { form.lines.splice(i,1); persistHeader() }
function editLine(i)   { form.lines[i].confirmed = false }

function onProductSelected(line, i, pid) {
  if (pid) line.product_id = pid
  const p = db.getProduct(line.product_id)
  if (p) line.price = p.buy_price
  nextTick(() => qtyRefs.value[i]?.focus())
}
function openAdvancedPicker(i) { pickerLine.value = i }
function onPickerSelected(pid) {
  const i = pickerLine.value; pickerLine.value = null
  if (i == null) return
  onProductSelected(form.lines[i], i, pid)
}
function onQtyEnter(i)   { priceRefs.value[i]?.focus() }
function onPriceEnter(i) {
  const line = form.lines[i]
  if (!line.product_id || !line.qty) return
  confirmLine(i)
}
function confirmLine(i) {
  const line = form.lines[i]
  if (!line.product_id || line.qty <= 0) return
  line.confirmed = true; persistHeader()
  nextTick(() => addLineAndFocus())
}
function save() {
  if (!form.supplier_id) return notify.warn('Select a supplier')
  run(() => db.upsertPO({ ...form, lines: form.lines.map(l=>({...l})) }))
    .then(() => { notify.success(isEdit.value ? 'PO updated' : 'Purchase order created'); emit('close') })
    .catch(e => notify.error('Save failed: ' + e.message))
}

const headerComplete = computed(() => !!form.supplier_id)
const confirmedCount = computed(() => form.lines.filter(l=>l.confirmed).length)
</script>

<template>
  <ProductPickerModal v-if="pickerLine !== null" @selected="onPickerSelected" @close="pickerLine=null"/>

  <ModalShell :title="isEdit?'Edit Purchase Order':'New Purchase Order'"
    :edit-mode="isEdit" size="lg" :saving="saving" @close="emit('close')" @save="save">

    <!-- Progress bar -->
    <div class="flex items-center gap-2 mb-5 px-1">
      <div class="flex items-center gap-1.5">
        <div style="width:7px;height:7px;border-radius:50%" :style="headerComplete?'background:var(--accent3)':'background:var(--border2)'"/>
        <span style="font-size:11px" :style="headerComplete?'color:var(--accent3)':'color:var(--text3)'">Header</span>
      </div>
      <div style="flex:1;height:1px;background:var(--border)"/>
      <div class="flex items-center gap-1.5">
        <div style="width:7px;height:7px;border-radius:50%" :style="savedInDb?'background:var(--accent3)':'background:var(--border2)'"/>
        <span style="font-size:11px" :style="savedInDb?'color:var(--accent3)':'color:var(--text3)'">{{ savedInDb?'Auto-saved':'Unsaved' }}</span>
      </div>
      <div style="flex:1;height:1px;background:var(--border)"/>
      <span style="font-size:11px;color:var(--text3)">{{ confirmedCount }}/{{ form.lines.length }} lines</span>
    </div>

    <!-- Header -->
    <div class="grid grid-cols-2 gap-4 mb-5">
      <div class="input-wrap">
        <label>PO Number <span style="font-size:10px;color:var(--text3)">(auto)</span></label>
        <input class="input" :value="form.po_number" readonly style="opacity:.6;cursor:not-allowed"/>
      </div>
      <div class="input-wrap">
        <label>Supplier *</label>
        <SearchableSelect ref="supplierRef" :options="supplierOptions" v-model="form.supplier_id"
          placeholder="Select supplier…" :search-mode="settings.searchMode" @selected="onSupplierSelected"/>
      </div>
      <div class="input-wrap">
        <label>POR (Purchase Order Reference)</label>
        <input class="input" v-model="form.por" placeholder="Customer's PO reference…" @blur="persistHeader"/>
      </div>
      <div class="input-wrap">
        <label>Status</label>
        <SearchableSelect :options="poStatusOpts" v-model="form.status"
          :search-mode="settings.searchMode" @selected="persistHeader"/>
      </div>
      <div class="input-wrap">
        <label>Expected Date</label>
        <input type="date" class="input" ref="expectedDateRef" v-model="form.expected_date"
          @change="persistHeader" @keydown.enter.prevent="onExpectedDateEnter"/>
      </div>
      <div class="input-wrap">
        <label>Notes <span style="font-size:10px;color:var(--text3)">Enter = add line · Shift+Enter = newline</span></label>
        <textarea class="input" ref="notesRef" v-model="form.notes" rows="1"
          @keydown.enter="onNotesEnter" @blur="persistHeader"/>
      </div>
    </div>

    <!-- Lines -->
    <div class="flex items-center justify-between mb-2">
      <span style="font-size:12px;color:var(--text2)">Line Items</span>
      <button class="btn btn-ghost btn-sm" @click="addLineAndFocus">+ Add Line</button>
    </div>
    <div class="space-y-2">
      <div v-for="(line,i) in form.lines" :key="line._id||i"
        style="border-radius:8px;padding:10px 12px"
        :style="line.confirmed?'background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.18)':'background:var(--surface2);border:1px solid var(--border2)'">
        <div class="flex items-end gap-2">
          <div style="flex:3;min-width:0">
            <div style="font-size:11px;color:var(--text2);margin-bottom:5px" class="flex items-center gap-2">
              Product
              <span v-if="line.confirmed" class="badge b-green" style="font-size:9px;padding:1px 5px">✓ locked</span>
            </div>
            <div v-if="settings.productSearchMode==='advanced' && !line.confirmed">
              <button class="btn btn-ghost btn-sm w-full" style="justify-content:flex-start;color:var(--text2)" @click="openAdvancedPicker(i)">
                <span v-if="line.product_id" style="color:var(--text)">{{ db.getProduct(line.product_id)?.name }}</span>
                <span v-else>Choose product…</span>
              </button>
            </div>
            <SearchableSelect v-else :ref="el=>setProductRef(el,i)" :options="productOptions"
              v-model="line.product_id" placeholder="Product…" :search-mode="settings.searchMode"
              :disabled="line.confirmed" @selected="onProductSelected(line,i)"/>
          </div>
          <div class="input-wrap" style="flex:1;min-width:70px">
            <label>Qty</label>
            <input type="number" class="input" :ref="el=>setQtyRef(el,i)"
              v-model.number="line.qty" min="1"
              :readonly="line.confirmed" :style="line.confirmed?'opacity:.6;cursor:not-allowed':''"
              @keydown.enter.prevent="onQtyEnter(i)"/>
          </div>
          <div class="input-wrap" style="flex:1;min-width:90px">
            <label>Buy Price</label>
            <input type="number" class="input" :ref="el=>setPriceRef(el,i)"
              v-model.number="line.price" min="0"
              :readonly="line.confirmed" :style="line.confirmed?'opacity:.6;cursor:not-allowed':''"
              @keydown.enter.prevent="onPriceEnter(i)"/>
          </div>
          <div style="min-width:80px;padding-bottom:2px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:5px">Line Total</div>
            <div class="font-mono" style="font-size:13px;color:var(--accent3)">{{ fmtNum((line.qty||0)*(line.price||0)) }}</div>
          </div>
          <div class="flex gap-1 items-end pb-0.5">
            <template v-if="!line.confirmed">
              <button class="btn btn-success btn-sm" :disabled="!line.product_id||!line.qty" @click="confirmLine(i)">✓</button>
              <button class="btn btn-danger btn-sm" @click="removeLine(i)">✕</button>
            </template>
            <template v-else>
              <button class="btn btn-ghost btn-sm" @click="editLine(i)" title="Unlock">✎</button>
              <button class="btn btn-danger btn-sm" @click="removeLine(i)">✕</button>
            </template>
          </div>
        </div>
        <div v-if="line.product_id && db.getProduct(line.product_id)" class="font-mono mt-1" style="font-size:11px;color:var(--text3)">
          Buy: {{ fmtNum(db.getProduct(line.product_id).buy_price) }} · Stock: {{ db.getProduct(line.product_id).stock }} {{ db.getProduct(line.product_id).unit }}
        </div>
      </div>
      <div v-if="!form.lines.length" style="color:var(--text3);font-size:12px;padding:8px 0">No lines — press Enter in Notes or click "+ Add Line".</div>
    </div>

    <!-- Total + payments -->
    <div v-if="total > 0" class="mt-4 p-4 rounded-xl space-y-2" style="background:var(--surface2);border:1px solid var(--border2)">
      <div class="flex justify-between"><span style="color:var(--text2)">Order Total</span><b class="font-mono" style="color:var(--accent3)">{{ fmtNum(total) }} DZD</b></div>
      <template v-if="paidTotal > 0">
        <div class="flex justify-between" style="border-top:1px solid var(--border);padding-top:8px">
          <span style="color:var(--accent3)">Paid</span><span class="font-mono" style="color:var(--accent3)">{{ fmtNum(paidTotal) }} DZD</span>
        </div>
        <div class="flex justify-between">
          <span style="color:var(--warn)">Remaining</span><span class="font-mono" style="color:var(--warn)">{{ fmtNum(remaining) }} DZD</span>
        </div>
      </template>
    </div>
  </ModalShell>
</template>
