<script setup>
defineProps({ value: Number, max: Number, color: { type: String, default: 'var(--accent)' } })
</script>
<template>
  <div class="stock-bar">
    <div class="stock-bar-fill" :style="`width:${max ? Math.min(value/max*100,100) : 0}%;background:${color}`"/>
  </div>
</template>
