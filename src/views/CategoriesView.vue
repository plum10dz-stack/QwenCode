<script setup>
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useNotify } from '@/composables/useNotify.js'
import { useConfirm } from '@/composables/useConfirm.js'
const db = useDbStore(), modal = useModalStore()
const { notify } = useNotify()
const { confirm } = useConfirm()

async function tryDeleteCat(id) {
  const cat = db.getCategoryById(id); if (!cat) return
  if (!await confirm(`Delete category "${cat.name}"? Products won't be deleted.`)) return
  try { await db.deleteCategory(id); notify.success('Category deleted') }
  catch (e) { notify.error(e.message) }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-5">
      <span style="color:var(--text2);font-size:13px">{{ db.categories.length }} categories</span>
      <button class="btn btn-primary" @click="modal.open('category')">+ New Category</button>
    </div>
    <div v-if="!db.categories.length" class="card p-8 text-center col-span-3" style="color:var(--text3)">
      No categories yet. <span style="color:var(--accent);cursor:pointer" @click="modal.open('category')">Add one</span>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div v-for="cat in db.categories" :key="cat.id" class="card p-5">
        <div class="flex items-start justify-between mb-3">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="font-display font-bold" style="font-size:15px">{{ cat.name }}</span>
              <span class="badge b-blue" style="font-size:11px;font-family:'DM Mono',monospace">{{ cat.abr }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="cat.ref" class="chip" style="font-size:10px">{{ cat.ref }}</span>
              <span style="font-size:12px;color:var(--text2)">
                {{ db.products.filter(p => p.category === cat.name).length }} products
              </span>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" @click="modal.open('category', cat)">Edit</button>
            <button class="btn btn-danger btn-sm" @click="tryDeleteCat(cat.id)">Del</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
