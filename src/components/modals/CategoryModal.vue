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

const form = reactive({ name: '', abr: '', ref: '', ...(modal.editData || {}) })

function onNameInput() {
  if (!form.abr || form.abr === form.name.substring(0, 4).toUpperCase().slice(0, -1))
    form.abr = form.name.substring(0, 4).toUpperCase()
}

async function save() {
  if (!form.name.trim()) return
  if (!form.abr.trim()) form.abr = form.name.substring(0, 4).toUpperCase()
  await handleSave(
    () => db.saveCategory({ name: form.name.trim(), abr: form.abr.trim().toUpperCase(), ref: form.ref.trim() }, modal.editId),
    isEdit.value ? 'Category updated' : 'Category created'
  )
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Category' : 'New Category'" :edit-mode="isEdit"
    size="sm" :saving="saving" @close="emit('close')" @save="save">
    <div class="space-y-4">
      <div class="input-wrap">
        <label>Category Name *</label>
        <input class="input" v-model="form.name" placeholder="e.g. Electronics" @input="onNameInput"/>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="input-wrap">
          <label>Abbreviation (ABR) *</label>
          <input class="input" v-model="form.abr" placeholder="ELEC" maxlength="6"
            style="text-transform:uppercase" @input="form.abr = form.abr.toUpperCase()"/>
        </div>
        <div class="input-wrap">
          <label>Reference Code</label>
          <input class="input" v-model="form.ref" placeholder="CAT-001"/>
        </div>
      </div>
    </div>
  </ModalShell>
</template>
