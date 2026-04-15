<script setup>
import { useRoute } from 'vue-router'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { today, fmtDate } from '@/utils/helpers'

const route = useRoute()
const { isOnline, hasBackend, lastSync } = useOnlineStatus()
</script>

<template>
  <header class="topbar flex items-center px-6 gap-4">
    <div class="font-display font-semibold" style="font-size:15px;color:var(--text2)">
      {{ route.meta.title || '' }}
    </div>
    <div class="flex-1"/>

    <!-- Connectivity badge -->
    <div class="flex items-center gap-2">
      <span class="pulse"
        style="width:6px;height:6px;border-radius:3px;display:inline-block"
        :style="isOnline ? 'background:var(--accent3)' : 'background:var(--danger)'"/>
      <span style="font-size:12px;color:var(--text2)">
        {{ !isOnline ? 'Offline' : hasBackend ? 'Live' : 'Local' }}
      </span>
      <span v-if="lastSync && hasBackend" class="chip" style="font-size:10px"
        :title="'Last sync: ' + (lastSync instanceof Date ? lastSync.toLocaleString() : lastSync)">
        ⟳ {{ fmtDate(lastSync instanceof Date ? lastSync.toISOString() : lastSync) }}
      </span>
    </div>

    <div style="width:1px;height:20px;background:var(--border)"/>
    <span style="font-size:12px;color:var(--text2)">{{ today }}</span>

    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style="background:var(--surface2);border:1px solid var(--border)">
      <div style="width:24px;height:24px;border-radius:50%;
                  background:linear-gradient(135deg,var(--accent),var(--accent2));
                  display:flex;align-items:center;justify-content:center;
                  font-size:10px;font-weight:700;color:#fff">S</div>
      <span style="font-size:12px">StockOS</span>
    </div>
  </header>
</template>
