"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vue_router_1 = require("vue-router");
//@ts-ignore
const useSupabaseAuth_1 = require("../composables/useSupabaseAuth");
const r = (path, file, title) => ({
    path,
    component: () => Promise.resolve(`${`@/views/${file}.vue`}`).then(s => __importStar(require(s))),
    meta: { title },
});
const routes = [
    { path: '/', redirect: '/dashboard' },
    {
        path: '/login',
        component: () => {
            // @ts-ignore
            return Promise.resolve().then(() => __importStar(require('../views/LoginView.vue')));
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
];
const router = (0, vue_router_1.createRouter)({ history: (0, vue_router_1.createWebHashHistory)(), routes });
// ── Navigation guard ──────────────────────────────────────────────────────────
router.beforeEach((to) => __awaiter(void 0, void 0, void 0, function* () {
    // Public pages (login) never require auth
    if (to.meta.public)
        return true;
    const { isAuthenticated, restoreSession } = (0, useSupabaseAuth_1.useSupabaseAuth)();
    // Already authenticated in this JS session
    if (isAuthenticated.value)
        return true;
    // Try to restore a persisted session (also auto-passes for offline mode)
    const ok = yield restoreSession();
    if (ok)
        return true;
    // No valid session → redirect to login, preserve intended destination
    return { path: '/login', query: { redirect: to.fullPath } };
}));
// Redirect to intended page after successful login
router.afterEach((to) => {
    if (to.path === '/login')
        return;
    // Update document title
    document.title = to.meta.title ? `${to.meta.title} — StockOS` : 'StockOS';
});
exports.default = router;
