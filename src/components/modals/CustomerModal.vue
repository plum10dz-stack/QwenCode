<script setup>
import { reactive, computed } from 'vue'
import ModalShell from './ModalShell.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useModalSave } from '@/composables/useModalSave.js'

const emit = defineEmits(['close'])
const db = useDbStore(), modal = useModalStore()
const { saving, handleSave } = useModalSave(emit)
const isEdit = computed(() => !!modal.editId)

const form = reactive({
  full_name: '', phone: '', email: '', city: '', tax_id: '',
  address: '', notes: '', is_active: true,
  ...(modal.editData || {})
})

async function save() {
  if (!form.full_name.trim()) return
  await handleSave(
    () => db.saveCustomer({ ...form }, modal.editId),
    isEdit.value ? 'Customer updated' : 'Customer created'
  )
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Customer' : 'New Customer'" :edit-mode="isEdit" :saving="saving" @close="emit('close')" @save="save">
    <div class="grid grid-cols-2 gap-4">
      <div class="input-wrap col-span-2"><label>Full Name *</label><input class="input" v-model="form.full_name" placeholder="Customer / company name"/></div>
      <div class="input-wrap"><label>Phone</label><input class="input" v-model="form.phone" placeholder="+213…"/></div>
      <div class="input-wrap"><label>Email</label><input class="input" v-model="form.email" placeholder="customer@email.dz"/></div>
      <div class="input-wrap"><label>Wilaya / City</label><input class="input" v-model="form.city" placeholder="Alger"/></div>
      <div class="input-wrap"><label>Tax ID (NIF)</label><input class="input" v-model="form.tax_id" placeholder="NIF…"/></div>
      <div class="input-wrap col-span-2"><label>Address</label><input class="input" v-model="form.address" placeholder="Street, City, Wilaya"/></div>
      <div class="input-wrap col-span-2"><label>Notes</label><textarea class="input" v-model="form.notes"/></div>
    </div>
    <div class="flex items-center gap-3 mt-4">
      <div class="toggle" :class="{ on: form.is_active }" @click="form.is_active = !form.is_active"/>
      <span style="color:var(--text2);font-size:13px">Customer Active</span>
    </div>
  </ModalShell>
</template>
