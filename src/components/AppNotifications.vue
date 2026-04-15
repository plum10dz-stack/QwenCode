<script setup>
import { useNotify } from '@/composables/useNotify.js'
const { toasts, dismiss } = useNotify()

const ICON = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' }
const COLOR = {
  success: 'var(--accent3)',
  error:   'var(--danger)',
  info:    'var(--accent)',
  warn:    'var(--warn)',
}
const BG = {
  success: 'rgba(52,211,153,.12)',
  error:   'rgba(248,113,113,.12)',
  info:    'rgba(108,138,255,.12)',
  warn:    'rgba(251,191,36,.12)',
}
</script>

<template>
  <Teleport to="body">
    <div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;
                display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id"
          style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;
                 min-width:280px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,.4);
                 backdrop-filter:blur(8px);pointer-events:all;cursor:pointer;
                 border:1px solid rgba(255,255,255,.07)"
          :style="`background:${BG[t.type]};border-left:3px solid ${COLOR[t.type]}`"
          @click="dismiss(t.id)">
          <span :style="`color:${COLOR[t.type]};font-size:15px;flex-shrink:0`">{{ ICON[t.type] }}</span>
          <span style="font-size:13px;color:var(--text);flex:1">{{ t.message }}</span>
          <span style="color:var(--text3);font-size:11px;flex-shrink:0">✕</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active { transition: all .2s ease-out; }
.toast-leave-active { transition: all .2s ease-in; }
.toast-enter-from   { opacity: 0; transform: translateY(12px); }
.toast-leave-to     { opacity: 0; transform: translateY(-8px); }
</style>
