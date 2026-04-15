<script setup>
defineProps({ message: { type: String, default: 'Loading local database…' } })
</script>

<template>
  <div style="height:100vh;display:flex;flex-direction:column;align-items:center;
              justify-content:center;background:var(--bg,#0a0b0f);gap:20px">
    <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#e5e7eb">
      Stock<span style="color:#6c8aff">OS</span>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <span style="width:8px;height:8px;border-radius:50%;background:#6c8aff;display:inline-block;
                   animation:pulse-dot 1.4s ease-in-out infinite"/>
      <span style="font-size:13px;color:#9ca3af;font-family:'DM Mono',monospace">{{ message }}</span>
    </div>
  </div>
</template>

<style>
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .4; transform: scale(.7); }
}
</style>
