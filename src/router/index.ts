import { createRouter, createWebHashHistory } from 'vue-router'
//@ts-ignore
import { useSupabaseAuth } from '../composables/useSupabaseAuth'

const r = (path: string, file: string, title: string) => ({
  path,
  component: () => import(`@/views/${file}.vue`),
  meta: { title },
})

const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    component: () => {
      // @ts-ignore
      return import('../views/LoginView.vue')
    },
    meta: { title: 'Sign In', public: true },
  },
  r('/dashboard', 'DashboardView', 'Dashboard'),
  r('/customers', 'CustomersView', 'Customers'),
  r('/end-customers', 'EndCustomersView', 'End Customers'),
  r('/sales-orders', 'SalesOrdersView', 'Sales Orders'),
  r('/s-payments', 'SPaymentsView', 'Sales Payments'),
  r('/products', 'ProductsView', 'Products'),
  r('/categories', 'CategoriesView', 'Categories'),
  r('/movements', 'MovementsView', 'Stock Movements'),
  r('/purchase-orders', 'PurchaseOrdersView', 'Purchase Orders'),
  r('/p-payments', 'PPaymentsView', 'Purchase Payments'),
  r('/suppliers', 'SuppliersView', 'Suppliers'),
  r('/alerts', 'AlertsView', 'Stock Alerts'),
  r('/analytics', 'AnalyticsView', 'Analytics'),
  r('/reports/customer-situation', 'customersituationView', 'Customer Situation'),
]

const router = createRouter({ history: createWebHashHistory(), routes })

// ── Navigation guard ──────────────────────────────────────────────────────────
router.beforeEach(async (to) => {
  // Public pages (login) never require auth
  if (to.meta.public) return true

  const { isAuthenticated, restoreSession } = useSupabaseAuth()

  // Already authenticated in this JS session
  if (isAuthenticated.value) return true

  // Try to restore a persisted session (also auto-passes for offline mode)
  const ok = await restoreSession()
  if (ok) return true

  // No valid session → redirect to login, preserve intended destination
  return { path: '/login', query: { redirect: to.fullPath } }
})

// Redirect to intended page after successful login
router.afterEach((to) => {
  if (to.path === '/login') return
  // Update document title
  document.title = to.meta.title ? `${to.meta.title} — StockOS` : 'StockOS'
})

export default router
