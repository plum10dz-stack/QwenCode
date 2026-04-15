<script setup>
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'

const db    = useDbStore()
const modal = useModalStore()

const stockColor = p => p.stock === 0 ? 'var(--danger)' : 'var(--warn)'
const badgeClass = p => p.stock === 0 ? 'b-red' : 'b-yellow'
const badgeLabel = p => p.stock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <span class="badge b-red" style="font-size:12px;padding:4px 12px">
        {{ db.lowStockItems.length }} items need attention
      </span>
    </div>

    <!-- All clear -->
    <div v-if="!db.lowStockItems.length" class="card p-10 text-center">
      <div style="font-size:36px;margin-bottom:12px">✅</div>
      <div class="font-display font-bold text-lg">All stock levels are healthy!</div>
      <div style="color:var(--text2);margin-top:6px;font-size:13px">
        No products are below their low-stock threshold.
      </div>
    </div>

    <!-- Alert rows -->
    <div class="space-y-3">
      <div
        v-for="p in db.lowStockItems" :key="p.id"
        class="alert-row"
        :style="p.stock === 0
          ? 'border-color:rgba(248,113,113,.3)'
          : 'border-color:rgba(251,191,36,.25)'"
      >
        <!-- Product info -->
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</div>
          <div style="font-size:12px;color:var(--text3)" class="font-mono">
            {{ p.sku }} · {{ p.category || 'Uncategorized' }} · {{ p.location || 'No location' }}
          </div>
        </div>

        <!-- Current stock -->
        <div class="text-center" style="flex-shrink:0">
          <div class="font-mono font-bold" style="font-size:22px" :style="`color:${stockColor(p)}`">
            {{ p.stock }}
          </div>
          <div style="font-size:11px;color:var(--text3)">current</div>
        </div>

        <!-- Threshold -->
        <div class="text-center" style="flex-shrink:0">
          <div class="font-mono" style="font-size:18px;color:var(--text2)">{{ p.low_stock }}</div>
          <div style="font-size:11px;color:var(--text3)">threshold</div>
        </div>

        <!-- Badge -->
        <span class="badge" :class="badgeClass(p)" style="flex-shrink:0">{{ badgeLabel(p) }}</span>

        <!-- Action -->
        <button
          class="btn btn-success btn-sm"
          style="flex-shrink:0"
          @click="modal.open('adjust', null, { product_id: p.id })">
          Restock
        </button>
      </div>
    </div>
  </div>
</template>
