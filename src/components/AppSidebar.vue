<script setup>
import SidebarIcon from '@/components/SidebarIcon.vue'
import { useDbStore } from '@/stores/db'
import { useModalStore } from '@/stores/modal'
import { useSettingsStore } from '@/stores/settings'
import { useSupabaseAuth } from '@/composables/useSupabaseAuth.js'
import { useNotify } from '@/composables/useNotify.js'
import { useRouter } from 'vue-router'

const db = useDbStore(), modal = useModalStore(), settings = useSettingsStore()
const router = useRouter()
const { isAuthenticated, user, signOut } = useSupabaseAuth()
const { notify } = useNotify()

async function handleSignOut() {
  await signOut()
  router.replace('/login')
}

const nav = [
  { section: 'Overview' },
  { path: '/dashboard',      label: 'Dashboard',         icon: 'grid' },
  { path: '/alerts',         label: 'Alerts',            icon: 'bell',     badge: () => db.lowStockItems.length, badgeClass: 'b-red' },
  { section: 'Sales' },
  { path: '/customers',        label: 'customers',           icon: 'users',    chip: () => db.customers.length },
  { path: '/end-customers',  label: 'End Customers',     icon: 'user',     chip: () => db.endCustomers.length },
  { path: '/sales-orders',   label: 'Sales Orders',      icon: 'bag',      badge: () => db.activeSOs, badgeClass: 'b-blue' },
  { path: '/s-payments',     label: 'Sales Payments',    icon: 'payment',  chip: () => db.sPayments.length },
  { section: 'Inventory' },
  { path: '/products',       label: 'Products',          icon: 'cube',     chip: () => db.products.length },
  { path: '/categories',     label: 'Categories',        icon: 'tag' },
  { path: '/movements',      label: 'Movements',         icon: 'arrows' },
  { section: 'Procurement' },
  { path: '/purchase-orders',label: 'Purchase Orders',   icon: 'doc',      badge: () => db.pendingPOs, badgeClass: 'b-yellow' },
  { path: '/p-payments',     label: 'Purchase Payments', icon: 'payment',  chip: () => db.pPayments.length },
  { path: '/suppliers',      label: 'Suppliers',         icon: 'building', chip: () => db.suppliers.length },
  { section: 'Reports' },
  { path: '/analytics',      label: 'Analytics',         icon: 'chart' },
  { path: '/reports/customer-situation', label: 'Customer Situation', icon: 'report' },
]
</script>

<template>
  <aside class="sidebar flex flex-col py-4 px-3 overflow-y-auto">
    <div class="px-2 mb-5">
      <div class="font-display font-bold text-lg" style="color:var(--text)">Stock<span style="color:var(--accent)">OS</span></div>
      <div class="font-mono" style="font-size:11px;color:var(--text3);margin-top:2px">ERP · DZD Workspace</div>
    </div>
    <nav class="space-y-0.5 flex-1">
      <template v-for="item in nav" :key="item.path || item.section">
        <div v-if="item.section" class="nav-section">{{ item.section }}</div>
        <RouterLink v-else :to="item.path" custom v-slot="{ isActive, navigate }">
          <div class="nav-item" :class="{ active: isActive }" @click="navigate">
            <SidebarIcon :name="item.icon" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.badge && item.badge()" class="badge ml-auto" :class="item.badgeClass" style="font-size:10px">{{ item.badge() }}</span>
            <span v-else-if="item.chip && item.chip()" class="chip ml-auto" style="font-size:10px">{{ item.chip() }}</span>
          </div>
        </RouterLink>
      </template>
    </nav>
    <div class="mt-4 pt-4 border-t space-y-0.5" style="border-color:var(--border)">
      <div class="nav-item" @click="modal.open('settings')">
        <SidebarIcon name="settings" /><span class="flex-1">Settings</span>
        <span class="chip ml-auto" style="font-size:10px">{{ settings.searchMode }}</span>
      </div>
      <div class="nav-item" @click="() => db.seed().then(() => notify.success('Demo data loaded')).catch(e => notify.error('Seed failed: ' + e.message))">
        <SidebarIcon name="arrow"/><span>Seed Demo Data</span>
      </div>
      <div class="nav-item" @click="db.exportJSON()"><SidebarIcon name="download"/><span>Export JSON</span></div>
      <div v-if="isAuthenticated" class="nav-item" style="color:var(--danger)" @click="handleSignOut">
        <SidebarIcon name="arrow"/><span>Sign Out</span>
        <span v-if="user?.email" style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;max-width:80px">{{ user.email }}</span>
      </div>
    </div>
  </aside>
</template>
