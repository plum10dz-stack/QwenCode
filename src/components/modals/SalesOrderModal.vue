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
import { uuid, soSeq, fmtNum } from '@/utils/helpers'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const { loading: saving, run } = useAsync()
const { notify } = useNotify()
const isEdit = computed(() => !!modal.editId)
const todayISO = new Date().toISOString().split('T')[0]
const orderId  = modal.editId || uuid()
const savedInDb = ref(!!modal.editId)
const pickerLine = ref(null)  // which line index is using advanced picker

const form = reactive({
  id: orderId, so_number: soSeq(), customer_id: '', end_customer_id: '',
  status: 'draft', delivery_date: todayISO, notes: '',
  lines: [], subtotal: 0, tax_pct: settings.defaultTva, tax_amount: 0, total: 0,
  ...(modal.editData ? { ...modal.editData, lines: modal.editData.lines?.map(l=>({...l}))||[] } : {})
})

const customerOptions      = computed(() => db.customers.map(c => ({ value:c.id, label:c.full_name, sub:c.phone||'' })))
const endCustomerOptions = computed(() => db.endCustomers.map(c => ({ value:c.id, label:c.full_name, sub:c.city||'' })))
const productOptions     = computed(() => db.products.filter(p=>p.active).map(p => ({
  value: p.id, label: p.name,
  sub: `SKU:${p.sku}  Buy:${fmtNum(p.buy_price)}  Sell:${fmtNum(p.sell_price)}  Stock:${p.stock}${p.unit}`
})))
const soStatusOpts = ['draft','confirmed','processing','shipped','delivered','cancelled'].map(s=>({value:s,label:s}))

// ── Field refs ────────────────────────────────────────────────────────────────
const customerRef       = ref(null)
const deliveryDateRef = ref(null)
const notesRef        = ref(null)
const productRefs     = ref([])
const qtyRefs         = ref([])
const priceRefs       = ref([])
const setProductRef = (el,i) => { if(el) productRefs.value[i]=el }
const setQtyRef     = (el,i) => { if(el) qtyRefs.value[i]=el }
const setPriceRef   = (el,i) => { if(el) priceRefs.value[i]=el }

// Auto-focus customer on mount
nextTick(() => { if (!isEdit.value) customerRef.value?.openDropdown() })

// ── Persist header ────────────────────────────────────────────────────────────
function persistHeader() {
  if (!form.customer_id) return
  recalc()
  db.upsertSO({ ...form, lines: form.lines.map(l=>({...l})) })
  savedInDb.value = true
}

// ── Enter-key flow ────────────────────────────────────────────────────────────
function oncustomerselected()     { persistHeader(); nextTick(() => deliveryDateRef.value?.focus()) }
function onDeliveryDateEnter()  { notesRef.value?.focus() }
function onNotesEnter(e)        { if(!e.shiftKey){ e.preventDefault(); addLineAndFocus() } }

// ── Line management ───────────────────────────────────────────────────────────
function addLine() { form.lines.push({ _id:uuid(), product_id:'', qty:1, unit_price:0, line_total:0, confirmed:false }) }
function addLineAndFocus() {
  addLine()
  const i = form.lines.length - 1
  nextTick(() => {
    if (settings.productSearchMode === 'advanced') pickerLine.value = i
    else productRefs.value[i]?.openDropdown()
  })
}
function removeLine(i) {
  form.lines.splice(i, 1); recalc(); persistHeader()
}
function editLine(i) { form.lines[i].confirmed = false }

function onProductSelected(line, i, pid) {
  if (pid) line.product_id = pid
  const p = db.getProduct(line.product_id)
  if (p) { line.unit_price = p.sell_price; line.line_total = line.qty * p.sell_price }
  recalc(); nextTick(() => qtyRefs.value[i]?.focus())
}
function openAdvancedPicker(i) { pickerLine.value = i }
function onPickerSelected(pid) {
  const i = pickerLine.value; pickerLine.value = null
  if (i == null) return
  onProductSelected(form.lines[i], i, pid)
}
function onQtyChange(line)  { line.line_total = (line.qty||0)*(line.unit_price||0); recalc() }
function onQtyEnter(i)      { priceRefs.value[i]?.focus() }
function onPriceChange(line){ line.line_total = (line.qty||0)*(line.unit_price||0); recalc() }
function onPriceEnter(i) {
  const line = form.lines[i]
  if (!line.product_id || !line.qty) return
  confirmLine(i)
}
function confirmLine(i) {
  const line = form.lines[i]
  if (!line.product_id || line.qty <= 0) return
  line.confirmed = true; recalc(); persistHeader()
  nextTick(() => addLineAndFocus())
}

function recalc() {
  form.subtotal   = form.lines.reduce((s,l) => s+(l.line_total||0), 0)
  form.tax_amount = form.subtotal * (form.tax_pct||0) / 100
  form.total      = form.subtotal + form.tax_amount
}

function save() {
  if (!form.customer_id) return notify.warn('Select a customer')
  recalc()
  run(() => db.upsertSO({ ...form, lines: form.lines.map(l=>({...l})) }))
    .then(() => { notify.success(isEdit.value ? 'Order updated' : 'Order created'); emit('close') })
    .catch(e => notify.error('Save failed: ' + e.message))
}

const headerComplete = computed(() => !!form.customer_id && !!form.so_number)
const confirmedCount = computed(() => form.lines.filter(l=>l.confirmed).length)
const soPaymentTotal = computed(() => db.soPaymentTotal(form.id))
const paymentStatus  = computed(() => {
  if (!form.total) return null
  const p = soPaymentTotal.value
  if (p <= 0) return { label:'Unpaid', cls:'b-red' }
  if (p >= form.total) return { label:'Paid', cls:'b-green' }
  return { label:'Partial', cls:'b-yellow' }
})
</script>

<template>
  <!-- Advanced product picker overlay -->
  <ProductPickerModal v-if="pickerLine !== null"
    @selected="onPickerSelected" @close="pickerLine = null"/>

  <ModalShell :title="isEdit ? 'Edit Sales Order' : 'New Sales Order'"
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
      <template v-if="paymentStatus">
        <div style="flex:1;height:1px;background:var(--border)"/>
        <span class="badge" :class="paymentStatus.cls" style="font-size:10px">{{ paymentStatus.label }}</span>
      </template>
    </div>

    <!-- Header fields -->
    <div class="grid grid-cols-2 gap-4 mb-5">
      <div class="input-wrap">
        <label>SO Number</label>
        <input class="input" :value="form.so_number" readonly style="opacity:.6;cursor:not-allowed"/>
      </div>
      <div class="input-wrap">
        <label>Customer *</label>
        <SearchableSelect ref="customerRef" :options="customerOptions" v-model="form.customer_id"
          placeholder="Select customer…" :search-mode="settings.searchMode" clearable @selected="oncustomerselected"/>
      </div>
      <div class="input-wrap">
        <label>End Customer</label>
        <SearchableSelect :options="endCustomerOptions" v-model="form.end_customer_id"
          placeholder="Final beneficiary…" :search-mode="settings.searchMode" clearable @selected="persistHeader"/>
      </div>
      <div class="input-wrap">
        <label>Status</label>
        <SearchableSelect :options="soStatusOpts" v-model="form.status"
          :search-mode="settings.searchMode" @selected="persistHeader"/>
      </div>
      <div class="input-wrap">
        <label>Delivery Date</label>
        <input type="date" class="input" ref="deliveryDateRef" v-model="form.delivery_date"
          @change="persistHeader" @keydown.enter.prevent="onDeliveryDateEnter"/>
      </div>
      <div class="input-wrap">
        <label>TVA %</label>
        <input type="number" class="input" v-model.number="form.tax_pct"
          @input="recalc(); persistHeader()" min="0" max="100"/>
      </div>
      <div class="input-wrap col-span-2">
        <label>Notes <span style="font-size:10px;color:var(--text3);margin-left:6px">Enter = add line · Shift+Enter = newline</span></label>
        <textarea class="input" ref="notesRef" v-model="form.notes" rows="2"
          @keydown.enter="onNotesEnter" @blur="persistHeader"/>
      </div>
    </div>

    <!-- Line items -->
    <div class="flex items-center justify-between mb-2">
      <span style="font-size:12px;color:var(--text2)">Line Items</span>
      <button class="btn btn-ghost btn-sm" @click="addLineAndFocus">+ Add Line</button>
    </div>
    <div class="space-y-2">
      <div v-for="(line, i) in form.lines" :key="line._id||i"
        style="border-radius:8px;padding:10px 12px;transition:border-color .15s"
        :style="line.confirmed
          ? 'background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.18)'
          : 'background:var(--surface2);border:1px solid var(--border2)'">
        <div class="grid grid-cols-12 gap-2 items-end">
          <!-- Product -->
          <div class="input-wrap col-span-5">
            <label class="flex items-center gap-2">
              Product
              <span v-if="line.confirmed" class="badge b-green" style="font-size:9px;padding:1px 5px">✓ locked</span>
            </label>
            <div v-if="settings.productSearchMode==='advanced' && !line.confirmed">
              <button class="btn btn-ghost btn-sm w-full" style="justify-content:flex-start;color:var(--text2)"
                @click="openAdvancedPicker(i)">
                <span v-if="line.product_id" style="color:var(--text)">{{ db.getProduct(line.product_id)?.name }}</span>
                <span v-else>Choose product…</span>
              </button>
            </div>
            <SearchableSelect v-else
              :ref="el => setProductRef(el,i)" :options="productOptions"
              v-model="line.product_id" placeholder="Product…"
              :search-mode="settings.searchMode" :disabled="line.confirmed"
              @selected="onProductSelected(line, i)"/>
          </div>
          <!-- Qty -->
          <div class="input-wrap col-span-2">
            <label>Qty</label>
            <input type="number" class="input" :ref="el => setQtyRef(el,i)"
              v-model.number="line.qty" min="1"
              :readonly="line.confirmed" :style="line.confirmed?'opacity:.6;cursor:not-allowed':''"
              @input="onQtyChange(line)" @keydown.enter.prevent="onQtyEnter(i)"/>
          </div>
          <!-- Unit Price -->
          <div class="input-wrap col-span-2">
            <label>Price</label>
            <input type="number" class="input" :ref="el => setPriceRef(el,i)"
              v-model.number="line.unit_price" min="0"
              :readonly="line.confirmed" :style="line.confirmed?'opacity:.6;cursor:not-allowed':''"
              @input="onPriceChange(line)" @keydown.enter.prevent="onPriceEnter(i)"/>
          </div>
          <!-- Total -->
          <div class="col-span-2 pb-0.5">
            <div style="font-size:11px;color:var(--text3);margin-bottom:5px">Total</div>
            <div class="font-mono" style="font-size:13px;color:var(--accent3)">{{ fmtNum(line.line_total||0) }}</div>
          </div>
          <!-- Actions -->
          <div class="col-span-1 flex items-end gap-1 pb-0.5">
            <template v-if="!line.confirmed">
              <button class="btn btn-success btn-sm" :disabled="!line.product_id||!line.qty" @click="confirmLine(i)" title="Confirm">✓</button>
              <button class="btn btn-danger btn-sm" @click="removeLine(i)" title="Remove">✕</button>
            </template>
            <template v-else>
              <button class="btn btn-ghost btn-sm" @click="editLine(i)" title="Unlock to edit">✎</button>
              <button class="btn btn-danger btn-sm" @click="removeLine(i)" title="Delete line">✕</button>
            </template>
          </div>
        </div>
        <!-- Stock hint -->
        <div v-if="line.product_id" class="font-mono mt-1" style="font-size:11px;color:var(--text3)">
          <template v-if="db.getProduct(line.product_id)">
            Buy: {{ fmtNum(db.getProduct(line.product_id).buy_price) }} ·
            Sell: {{ fmtNum(db.getProduct(line.product_id).sell_price) }} ·
            Stock: {{ db.getProduct(line.product_id).stock }} {{ db.getProduct(line.product_id).unit }}
            <span v-if="line.qty > db.getProduct(line.product_id).stock" class="badge b-red ml-2" style="font-size:10px">⚠ Insufficient</span>
          </template>
        </div>
      </div>
      <div v-if="!form.lines.length" style="color:var(--text3);font-size:12px;padding:8px 0">
        No lines yet — press Enter in Notes or click "+ Add Line".
      </div>
    </div>
    <!-- Totals -->
    <div v-if="form.lines.length" class="mt-4 p-4 rounded-xl space-y-2"
      style="background:var(--surface2);border:1px solid var(--border2)">
      <div class="flex justify-between"><span style="color:var(--text2)">Subtotal</span><b class="font-mono">{{ fmtNum(form.subtotal) }} DZD</b></div>
      <div class="flex justify-between"><span style="color:var(--text2)">TVA {{ form.tax_pct }}%</span><span class="font-mono">{{ fmtNum(form.tax_amount) }} DZD</span></div>
      <div class="flex justify-between pt-2" style="border-top:1px solid var(--border)">
        <span class="font-display font-bold">Total</span>
        <span class="font-mono font-bold" style="font-size:16px;color:var(--accent3)">{{ fmtNum(form.total) }} DZD</span>
      </div>
      <div v-if="soPaymentTotal > 0" class="flex justify-between" style="border-top:1px solid var(--border);padding-top:8px">
        <span style="color:var(--accent3)">Paid</span>
        <span class="font-mono" style="color:var(--accent3)">{{ fmtNum(soPaymentTotal) }} DZD</span>
      </div>
      <div v-if="soPaymentTotal > 0" class="flex justify-between">
        <span style="color:var(--warn)">Remaining</span>
        <span class="font-mono" style="color:var(--warn)">{{ fmtNum(form.total - soPaymentTotal) }} DZD</span>
      </div>
    </div>
  </ModalShell>
</template>
