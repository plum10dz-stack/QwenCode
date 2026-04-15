<script setup>
defineProps({ value: [String, Number], label: String, sub: String, color: { type: String, default: 'b-blue' } })
</script>

<template>
  <div class="card p-5">
    <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">{{ label }}</div>
    <div class="font-display font-bold" style="font-size:32px" :style="color ? '' : ''">
      <slot>{{ value }}</slot>
    </div>
    <div v-if="sub" style="font-size:12px;color:var(--text2);margin-top:4px">{{ sub }}</div>
  </div>
</template>
