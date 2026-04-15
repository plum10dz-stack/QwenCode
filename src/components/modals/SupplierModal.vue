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
  name: '', contact: '', phone: '', email: '', address: '', notes: '',
  ...(modal.editData || {})
})

async function save() {
  if (!form.name.trim()) return
  await handleSave(
    () => db.saveSupplier({ ...form }, modal.editId),
    isEdit.value ? 'Supplier updated' : 'Supplier created'
  )
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Supplier' : 'New Supplier'" :edit-mode="isEdit" :saving="saving" @close="emit('close')" @save="save">
    <div class="grid grid-cols-2 gap-4">
      <div class="input-wrap col-span-2"><label>Supplier Name *</label><input class="input" v-model="form.name" placeholder="Company name"/></div>
      <div class="input-wrap"><label>Contact Name</label><input class="input" v-model="form.contact" placeholder="Full name"/></div>
      <div class="input-wrap"><label>Phone</label><input class="input" v-model="form.phone" placeholder="+213…"/></div>
      <div class="input-wrap col-span-2"><label>Email</label><input class="input" v-model="form.email" placeholder="supplier@company.dz"/></div>
      <div class="input-wrap col-span-2"><label>Address</label><input class="input" v-model="form.address" placeholder="City, Wilaya"/></div>
      <div class="input-wrap col-span-2"><label>Notes</label><textarea class="input" v-model="form.notes"/></div>
    </div>
  </ModalShell>
</template>
