<script setup>
// Base modal shell — all modals use this as a wrapper
const props = defineProps({
  title: String, sub: String,
  size: { type: String, default: 'md' } // 'sm' | 'md' | 'lg'
})
const emit = defineEmits(['close', 'submit'])
const sizeClass = { sm: 'modal-sm', md: '', lg: 'modal-lg' }
</script>

<template>
  <div class="modal-bg" @click.self="emit('close')">
    <div class="modal" :class="sizeClass[size]">
      <div class="flex items-center justify-between p-6 border-b" style="border-color:var(--border)">
        <div>
          <h2 class="font-display font-bold text-lg">{{ title }}</h2>
          <p v-if="sub" style="font-size:12px;color:var(--text2);margin-top:3px">{{ sub }}</p>
        </div>
        <button class="btn btn-ghost btn-sm" @click="emit('close')">✕</button>
      </div>
      <div class="p-6"><slot/></div>
      <div class="flex items-center justify-end gap-3 px-6 pb-6">
        <slot name="footer">
          <button class="btn btn-ghost" @click="emit('close')">Cancel</button>
          <button class="btn btn-primary" @click="emit('submit')">
            <slot name="submit-label">Save</slot>
          </button>
        </slot>
      </div>
    </div>
  </div>
</template>
