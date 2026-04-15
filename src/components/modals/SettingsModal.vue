<script setup>
import ModalShell from './ModalShell.vue'
import { useSettingsStore } from '@/stores/settings'
const emit = defineEmits(['close'])
const settings = useSettingsStore()
</script>
<template>
  <ModalShell title="Settings" sub="App-wide configuration" size="sm" @close="emit('close')" :hide-footer="true">
    <!-- TVA -->
    <div class="mb-5">
      <p style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Default TVA / Tax Rate</p>
      <div class="flex items-center gap-3">
        <input type="number" class="input" style="width:100px" :value="settings.defaultTva" @change="settings.setDefaultTva($event.target.value)" min="0" max="100"/>
        <span style="color:var(--text2);font-size:13px">%  — applied to new orders automatically</span>
      </div>
    </div>
    <!-- Product Search Mode -->
    <div class="mb-5">
      <p style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Product Search in Order Lines</p>
      <div class="space-y-2">
        <label v-for="m in settings.productSearchModes" :key="m.value"
          class="flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all"
          :style="settings.productSearchMode===m.value ? 'background:rgba(108,138,255,.08);border-color:var(--accent)' : 'background:var(--surface2);border-color:var(--border2)'">
          <input type="radio" :value="m.value" :checked="settings.productSearchMode===m.value" @change="settings.setProductSearchMode(m.value)" style="position:absolute;opacity:0;pointer-events:none"/>
          <div style="width:16px;height:16px;border-radius:50%;border:2px solid;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center" :style="settings.productSearchMode===m.value ? 'border-color:var(--accent)' : 'border-color:var(--border2)'">
            <div v-if="settings.productSearchMode===m.value" style="width:8px;height:8px;border-radius:50%;background:var(--accent)"/>
          </div>
          <div><div style="font-weight:600;font-size:13px;margin-bottom:2px">{{ m.label }}</div><div style="font-size:12px;color:var(--text3)">{{ m.desc }}</div></div>
        </label>
      </div>
    </div>
    <!-- Search Mode -->
    <div>
      <p style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Dropdown Search Algorithm</p>
      <div class="space-y-2">
        <label v-for="m in settings.searchModes" :key="m.value"
          class="flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all"
          :style="settings.searchMode===m.value ? 'background:rgba(108,138,255,.08);border-color:var(--accent)' : 'background:var(--surface2);border-color:var(--border2)'">
          <input type="radio" :value="m.value" :checked="settings.searchMode===m.value" @change="settings.setSearchMode(m.value)" style="position:absolute;opacity:0;pointer-events:none"/>
          <div style="width:16px;height:16px;border-radius:50%;border:2px solid;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center" :style="settings.searchMode===m.value ? 'border-color:var(--accent)' : 'border-color:var(--border2)'">
            <div v-if="settings.searchMode===m.value" style="width:8px;height:8px;border-radius:50%;background:var(--accent)"/>
          </div>
          <div>
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">{{ m.label }}</div>
            <div style="font-size:12px;color:var(--text3)">{{ m.desc }}</div>
            <div style="font-size:11px;color:var(--accent);margin-top:3px;font-family:'DM Mono',monospace">{{ m.example }}</div>
          </div>
        </label>
      </div>
    </div>
    <div class="flex justify-end mt-6"><button class="btn btn-primary" @click="emit('close')">Done</button></div>
  </ModalShell>
</template>
