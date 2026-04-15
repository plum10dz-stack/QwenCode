<script setup>
import { defineAsyncComponent, computed } from 'vue'
import { useModalStore } from '@/stores/modal'

const modal = useModalStore()

const MODAL_MAP = {
  product:      defineAsyncComponent(() => import('./ProductModal.vue')),
  supplier:     defineAsyncComponent(() => import('./SupplierModal.vue')),
  customer:       defineAsyncComponent(() => import('./CustomerModal.vue')),
  end_customer: defineAsyncComponent(() => import('./EndCustomerModal.vue')),
  so:           defineAsyncComponent(() => import('./SalesOrderModal.vue')),
  po:           defineAsyncComponent(() => import('./PurchaseOrderModal.vue')),
  adjust:       defineAsyncComponent(() => import('./AdjustModal.vue')),
  category:     defineAsyncComponent(() => import('./CategoryModal.vue')),
  s_payment:    defineAsyncComponent(() => import('./SPaymentModal.vue')),
  p_payment:    defineAsyncComponent(() => import('./PPaymentModal.vue')),
  settings:     defineAsyncComponent(() => import('./SettingsModal.vue')),
}

const CurrentModal = computed(() => MODAL_MAP[modal.type] || null)
</script>

<template>
  <Transition name="fade" @after-leave="modal.afterClose()">
    <div v-if="modal.visible && CurrentModal" class="modal-bg">
      <component :is="CurrentModal" @close="modal.close()"/>
    </div>
  </Transition>
</template>
