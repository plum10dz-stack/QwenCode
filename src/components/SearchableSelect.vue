<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useClickOutside } from '@/composables/useClickOutside'
import { applySearch } from '@/utils/search'

const props = defineProps({
  modelValue:  { default: '' },
  options:     { type: Array,   default: () => [] },
  placeholder: { type: String,  default: 'Select…' },
  searchMode:  { type: String,  default: 'contains' },
  clearable:   { type: Boolean, default: false },
  autoOpen:    { type: Boolean, default: false },  // open dropdown on mount
  disabled:    { type: Boolean, default: false },  // fully locked, no click
})
const emit = defineEmits(['update:modelValue', 'selected'])

const open    = ref(false)
const query   = ref('')
const focused = ref(-1)
const wrapEl  = ref(null)
const inputEl = ref(null)

useClickOutside(wrapEl, () => { open.value = false })

onMounted(() => { if (props.autoOpen) nextTick(() => openDropdown()) })

const selected = computed(() => props.options.find(o => o.value === props.modelValue))

const filtered = computed(() => {
  if (!query.value) return props.options.map(o => ({ ...o, hl: o.label }))
  return props.options
    .map(o => { const r = applySearch(o.label, query.value, props.searchMode); return r.match ? { ...o, hl: r.hl } : null })
    .filter(Boolean)
})

function openDropdown() {
  open.value = true
  query.value = ''
  focused.value = -1
  nextTick(() => inputEl.value?.focus())
}

function toggle() {
  if (props.disabled) return
  if (open.value) { open.value = false } else { openDropdown() }
}

function select(opt) {
  emit('update:modelValue', opt.value)
  emit('selected', opt.value)   // explicit "user chose something" signal
  open.value = false
}

function clear(e) {
  e.stopPropagation()
  emit('update:modelValue', '')
}

function onKey(e) {
  if (e.key === 'ArrowDown')  { e.preventDefault(); focused.value = Math.min(focused.value + 1, filtered.value.length - 1) }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); focused.value = Math.max(focused.value - 1, -1) }
  else if (e.key === 'Enter')     {
    e.preventDefault()
    if (focused.value >= 0) select(filtered.value[focused.value])
    else if (filtered.value.length === 1) select(filtered.value[0]) // auto-select only match
  }
  else if (e.key === 'Escape')    { open.value = false }
}

// Expose so parent can programmatically open
defineExpose({ openDropdown })
</script>

<template>
  <div class="ss-wrap" ref="wrapEl">
    <div class="ss-trigger" :class="{ open, disabled: props.disabled }"
      :style="props.disabled ? 'opacity:.65;cursor:not-allowed;pointer-events:none' : ''"
      @click="toggle">
      <span v-if="selected" style="flex:1;overflow:hidden;text-overflow:ellipsis">{{ selected.label }}</span>
      <span v-else class="ss-placeholder" style="flex:1">{{ placeholder }}</span>
      <span v-if="clearable && modelValue" class="ss-clear" @click="clear">✕</span>
      <svg class="ss-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
      </svg>
    </div>

    <Transition name="fade">
      <div v-if="open" class="ss-dropdown">
        <div class="ss-search-wrap">
          <input class="ss-search" ref="inputEl" v-model="query"
            :placeholder="`Search (${searchMode})…`" @keydown="onKey"/>
        </div>
        <div class="ss-list">
          <div v-if="!filtered.length" class="ss-empty">No results for "{{ query }}"</div>
          <div v-for="(opt, i) in filtered" :key="opt.value"
            class="ss-item"
            :class="{ selected: opt.value === modelValue, focused: i === focused }"
            @mousedown.prevent="select(opt)">
            <span class="ss-item-label" v-html="opt.hl"/>
            <span v-if="opt.sub" class="ss-item-sub">{{ opt.sub }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
