<script setup>
import AppSidebar from '@/components/AppSidebar.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import ModalManager from '@/components/modals/ModalManager.vue'
import AppNotifications from '@/components/AppNotifications.vue'
import { useModalStore } from '@/stores/modal'
import { onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { main } from './index';
main();
const modal = useModalStore()
const router = useRouter()
const route = useRoute()
const isLoginPage = computed(() => route.path === '/login')

const PAGE_MODAL_MAP = {
  '/products': 'product',
  '/customers': 'customer',
  '/end-customers': 'end_customer',
  '/sales-orders': 'so',
  '/purchase-orders': 'po',
  '/movements': 'adjust',
  '/categories': 'category',
  '/suppliers': 'supplier',
  '/s-payments': 's_payment',
  '/p-payments': 'p_payment',
}

const NO_FAB = ['/dashboard', '/alerts', '/analytics', '/reports/customer-situation', '/login']

function fabModalType() {
  return PAGE_MODAL_MAP[router.currentRoute.value.path] || 'product'
}

function onKey(e) {
  if (modal.visible) { if (e.key === 'Escape') modal.close(); return }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return
  if (e.key === 'n') modal.open(fabModalType())
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- Login page: no sidebar/topbar chrome -->
  <RouterView v-if="isLoginPage" />

  <!-- App shell -->
  <div v-else class="flex h-screen overflow-hidden">
    <AppSidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <AppTopbar />
      <main class="flex-1 overflow-y-auto p-6" style="background:var(--bg)">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" :key="$route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>

  <ModalManager />
  <AppNotifications />
  <button v-if="!isLoginPage && !NO_FAB.includes($route.path)" class="fab" @click="modal.open(fabModalType())"
    title="New Record (N)">+</button>
</template>
