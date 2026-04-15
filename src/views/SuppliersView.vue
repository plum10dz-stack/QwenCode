<script setup>
import { ref, computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useTableSearch } from '@/composables/useTableSearch'
import { useSettingsStore } from '@/stores/settings'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'

const db = useDbStore(); const modal = useModalStore(); const settings = useSettingsStore()
const { notify } = useNotify()
const { confirm } = useConfirm()
const search = ref('')

const textFiltered = useTableSearch(
  computed(() => db.suppliers),
  ['name', 'email', 'phone', 'contact', 'address', 'notes'],
  search
)

const supplierProducts = id => db.products.filter(p => p.supplier_id === id).length
const supplierPOs      = id => db.purchaseOrders.filter(p => p.supplier_id === id).length
async function tryDelete(id) {
  if (!await confirm('Delete this supplier?')) return
  try { await db.deleteSupplier(id); notify.success('Supplier deleted') }
  catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <input class="input" style="width:240px" :placeholder="`Search (${settings.searchMode})…`" v-model="search"/>
      <button class="btn btn-primary" @click="modal.open('supplier')">+ New Supplier</button>
    </div>
    <div v-if="!textFiltered.length" class="card p-8 text-center" style="color:var(--text3)">
      No suppliers. <span style="color:var(--accent);cursor:pointer" @click="modal.open('supplier')">Add one</span>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div v-for="s in textFiltered" :key="s.id" class="card p-5">
        <div class="flex items-start justify-between mb-3">
          <div><div class="font-display font-bold" style="font-size:15px">{{ s.name }}</div><div v-if="s.contact" style="font-size:12px;color:var(--text2);margin-top:2px">{{ s.contact }}</div></div>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" @click="modal.open('supplier', s)">Edit</button>
            <button class="btn btn-danger btn-sm" @click="tryDelete(s.id)">Del</button>
          </div>
        </div>
        <div class="space-y-1">
          <div v-if="s.phone" class="flex gap-2"><span style="font-size:11px;color:var(--text3);width:52px;flex-shrink:0">Phone</span><span class="font-mono" style="font-size:12px">{{ s.phone }}</span></div>
          <div v-if="s.email" class="flex gap-2"><span style="font-size:11px;color:var(--text3);width:52px;flex-shrink:0">Email</span><span>{{ s.email }}</span></div>
          <div v-if="s.address" class="flex gap-2"><span style="font-size:11px;color:var(--text3);width:52px;flex-shrink:0">Address</span><span style="color:var(--text2)">{{ s.address }}</span></div>
        </div>
        <div class="flex items-center gap-3 mt-3 pt-3 border-t" style="border-color:var(--border)">
          <span style="font-size:12px;color:var(--text3)">Products:</span><span class="badge b-blue">{{ supplierProducts(s.id) }}</span>
          <span style="font-size:12px;color:var(--text3);margin-left:8px">POs:</span><span class="badge b-gray">{{ supplierPOs(s.id) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
