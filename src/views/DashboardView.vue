<script setup>
import { computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { fmtNum, fmtDate } from '@/utils/helpers'

const db = useDbStore()

const stockByCategory = computed(() => {
  const map = {}
  db.products.forEach(p => {
    const k = p.category || 'Uncategorized'
    map[k] = (map[k] || 0) + p.stock * p.buy_price
  })
  const total = Object.values(map).reduce((a,b) => a+b, 0) || 1
  return Object.entries(map).sort(([,a],[,b]) => b-a)
    .map(([name,value]) => ({ name, value, pct: value/total*100 }))
})

const soStatusList = ['draft','confirmed','processing','shipped','delivered','cancelled']
const soBadge = s => ({draft:'b-gray',confirmed:'b-blue',processing:'b-cyan',shipped:'b-purple',delivered:'b-green',cancelled:'b-red'}[s]||'b-gray')
const movBadge  = t => t==='in'?'b-green':t==='out'?'b-red':'b-blue'
const movColor  = t => t==='in'?'var(--accent3)':t==='out'?'var(--danger)':''
const movPrefix = t => t==='in'?'+':t==='out'?'-':''

// Payment summary
const totalSalesPaid = computed(() => db.sPayments.reduce((s,p) => s+p.amount, 0))
const totalPurchasePaid = computed(() => db.pPayments.reduce((s,p) => s+p.amount, 0))
</script>

<template>
  <div>
    <!-- KPI Row 1 -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Products</div>
        <div class="font-display font-bold" style="font-size:32px">{{ db.products.length }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.products.filter(p=>p.active).length }} active</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Stock Value</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent3)">{{ fmtNum(db.totalStockValue) }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">DZD at buy price</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Customers</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent2)">{{ db.customers.length }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.endCustomers.length }} end customers</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Sales Revenue</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent4)">{{ fmtNum(db.totalRevenue) }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">DZD confirmed</div>
      </div>
    </div>

    <!-- KPI Row 2 – Payments -->
    <div class="grid grid-cols-4 gap-4 mb-5">
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Sales Orders</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent)">{{ db.salesOrders.length }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.activeSOs }} active</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Sales Paid</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent3)">{{ fmtNum(totalSalesPaid) }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.sPayments.length }} payments</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Purchase Orders</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--accent2)">{{ db.purchaseOrders.length }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.pendingPOs }} pending</div>
      </div>
      <div class="card p-5">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px" class="font-mono">Purchases Paid</div>
        <div class="font-display font-bold" style="font-size:32px;color:var(--warn)">{{ fmtNum(totalPurchasePaid) }}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">{{ db.pPayments.length }} payments</div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-3 gap-4 mb-5">
      <div class="card p-5 col-span-2">
        <h3 class="font-display font-semibold mb-4">Stock by Category</h3>
        <div class="space-y-3">
          <div v-for="cat in stockByCategory" :key="cat.name" class="flex items-center gap-3">
            <span style="width:110px;font-size:13px;color:var(--text2);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ cat.name }}</span>
            <div class="stock-bar flex-1"><div class="stock-bar-fill" :style="`width:${cat.pct}%;background:var(--accent)`"/></div>
            <span class="font-mono" style="font-size:12px;width:100px;text-align:right">{{ fmtNum(cat.value) }} DZD</span>
          </div>
          <div v-if="!stockByCategory.length" style="color:var(--text3);font-size:13px">No data — click Seed Demo Data in the sidebar.</div>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Sales Order Status</h3>
        <div class="space-y-2">
          <div v-for="s in soStatusList" :key="s" class="flex items-center gap-3">
            <span class="badge" :class="soBadge(s)" style="width:80px;justify-content:center;flex-shrink:0">{{ s }}</span>
            <div class="stock-bar flex-1"><div class="stock-bar-fill" :style="`width:${db.salesOrders.length?db.salesOrders.filter(o=>o.status===s).length/db.salesOrders.length*100:0}%;background:var(--accent2)`"/></div>
            <span class="font-mono" style="font-size:12px;width:20px;text-align:right">{{ db.salesOrders.filter(o=>o.status===s).length }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Movements -->
    <div class="card p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-display font-semibold">Recent Movements</h3>
        <RouterLink to="/movements" class="btn btn-ghost btn-sm">View all →</RouterLink>
      </div>
      <div v-if="!db.movements.length" style="color:var(--text3);font-size:13px;padding:8px 0">No movements yet.</div>
      <table v-else>
        <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reason</th><th>Ref</th></tr></thead>
        <tbody>
          <tr v-for="m in db.movements.slice().reverse().slice(0,8)" :key="m.id">
            <td class="font-mono" style="font-size:11px;color:var(--text2)">{{ fmtDate(m.created_at) }}</td>
            <td style="font-weight:500">{{ db.getProduct(m.product_id)?.name||'—' }}</td>
            <td><span class="badge" :class="movBadge(m.type)">{{ m.type }}</span></td>
            <td class="font-mono font-bold" :style="`color:${movColor(m.type)}`">{{ movPrefix(m.type) }}{{ m.qty }}</td>
            <td style="color:var(--text2)">{{ m.reason }}</td>
            <td class="font-mono" style="font-size:11px;color:var(--text3)">{{ m.ref||'—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
