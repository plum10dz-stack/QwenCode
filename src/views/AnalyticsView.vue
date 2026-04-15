<script setup>
import { computed } from 'vue'
import { useDbStore } from '@/stores/db'
import { fmtNum } from '@/utils/helpers'

const db = useDbStore()

// ── Stock by category bar chart data ─────────────────────────────────────────
const stockByCategory = computed(() => {
  const map = {}
  db.products.forEach(p => {
    const k = p.category || 'Uncategorized'
    map[k] = (map[k] || 0) + p.stock * p.buy_price
  })
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1
  return Object.entries(map).sort(([,a],[,b]) => b - a)
    .map(([name, value]) => ({ name, value, pct: value / total * 100 }))
})

// ── Top customers by order count ────────────────────────────────────────────────
const topCustomers = computed(() => {
  return db.customers
    .map(c => ({ ...c, orders: db.salesOrders.filter(o => o.customer_id === c.id).length }))
    .filter(c => c.orders > 0)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 6)
})

// ── Most moved products ───────────────────────────────────────────────────────
const topMoved = computed(() => {
  const map = {}
  db.movements.forEach(m => { map[m.product_id] = (map[m.product_id] || 0) + 1 })
  return Object.entries(map)
    .map(([id, moves]) => ({ ...(db.getProduct(id) || { name: 'Deleted', id }), moves }))
    .sort((a, b) => b.moves - a.moves)
    .slice(0, 6)
})

const movBadge  = t => t === 'in' ? 'b-green' : t === 'out' ? 'b-red' : 'b-blue'
const movBgVar  = t => t === 'in' ? 'var(--accent3)' : t === 'out' ? 'var(--danger)' : 'var(--info)'
const poBadge   = s => ({ draft:'b-gray', sent:'b-blue', confirmed:'b-cyan', received:'b-green', cancelled:'b-red' }[s] || 'b-gray')
</script>

<template>
  <div>
    <!-- Row 1: movements + sales -->
    <div class="grid grid-cols-2 gap-4 mb-4">

      <!-- Movement breakdown -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Movement Breakdown</h3>
        <div class="space-y-3">
          <div v-for="t in ['in','out','adjustment']" :key="t">
            <div class="flex items-center justify-between mb-1">
              <span class="badge" :class="movBadge(t)">{{ t }}</span>
              <span class="font-mono" style="font-size:12px">
                {{ db.movements.filter(m => m.type === t).length }}
              </span>
            </div>
            <div class="stock-bar">
              <div class="stock-bar-fill"
                :style="`width:${db.movements.length ? db.movements.filter(m=>m.type===t).length/db.movements.length*100 : 0}%;background:${movBgVar(t)}`"/>
            </div>
          </div>
        </div>
      </div>

      <!-- Sales performance -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Sales Performance</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Total Orders</span>
            <b class="font-mono">{{ db.salesOrders.length }}</b>
          </div>
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Active (in-flight)</span>
            <b class="font-mono" style="color:var(--accent)">{{ db.activeSOs }}</b>
          </div>
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Delivered</span>
            <b class="font-mono" style="color:var(--accent3)">{{ db.salesOrders.filter(o => o.status==='delivered').length }}</b>
          </div>
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Confirmed Revenue</span>
            <b class="font-mono" style="color:var(--accent4)">{{ fmtNum(db.totalRevenue) }} DZD</b>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:12px">
            <div class="flex justify-between items-center">
              <span style="color:var(--text2)">Total Customers</span>
              <b class="font-mono" style="color:var(--accent2)">{{ db.customers.length }}</b>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: inventory health + PO status -->
    <div class="grid grid-cols-2 gap-4 mb-4">

      <!-- Inventory health -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Inventory Health</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">In Stock</span>
            <b class="font-mono" style="color:var(--accent3)">{{ db.products.filter(p => p.stock > p.low_stock).length }}</b>
          </div>
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Low Stock</span>
            <b class="font-mono" style="color:var(--warn)">{{ db.products.filter(p => p.stock > 0 && p.stock <= p.low_stock).length }}</b>
          </div>
          <div class="flex justify-between items-center">
            <span style="color:var(--text2)">Out of Stock</span>
            <b class="font-mono" style="color:var(--danger)">{{ db.products.filter(p => p.stock === 0).length }}</b>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:12px" class="space-y-3">
            <div class="flex justify-between items-center">
              <span style="color:var(--text2)">Buy Value (stock)</span>
              <b class="font-mono" style="color:var(--accent3)">{{ fmtNum(db.totalStockValue) }} DZD</b>
            </div>
            <div class="flex justify-between items-center">
              <span style="color:var(--text2)">Sell Value (stock)</span>
              <b class="font-mono" style="color:var(--accent2)">{{ fmtNum(db.totalSellValue) }} DZD</b>
            </div>
            <div class="flex justify-between items-center">
              <span style="color:var(--text2)">Potential Margin</span>
              <b class="font-mono" style="color:var(--accent4)">{{ fmtNum(db.totalSellValue - db.totalStockValue) }} DZD</b>
            </div>
          </div>
        </div>
      </div>

      <!-- PO status -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Purchase Order Status</h3>
        <div class="space-y-3">
          <div v-for="s in ['draft','sent','confirmed','received','cancelled']" :key="s" class="flex items-center gap-3">
            <span class="badge" :class="poBadge(s)" style="width:80px;justify-content:center;flex-shrink:0">{{ s }}</span>
            <div class="stock-bar flex-1">
              <div class="stock-bar-fill"
                :style="`width:${db.purchaseOrders.length ? db.purchaseOrders.filter(p=>p.status===s).length/db.purchaseOrders.length*100 : 0}%;background:var(--accent)`"/>
            </div>
            <span class="font-mono" style="font-size:12px;width:20px;text-align:right">
              {{ db.purchaseOrders.filter(p => p.status === s).length }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 3: top customers + most moved -->
    <div class="grid grid-cols-2 gap-4">

      <!-- Top customers -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Top Customers by Orders</h3>
        <div v-if="!topCustomers.length" style="color:var(--text3);font-size:13px">No sales data yet.</div>
        <div class="space-y-3">
          <div v-for="c in topCustomers" :key="c.id" class="flex items-center gap-3">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.full_name }}</div>
            </div>
            <div class="stock-bar" style="width:80px">
              <div class="stock-bar-fill"
                :style="`width:${topCustomers[0]?.orders ? c.orders/topCustomers[0].orders*100 : 0}%;background:var(--accent2)`"/>
            </div>
            <span class="font-mono" style="font-size:12px;color:var(--text2);width:55px;text-align:right">{{ c.orders }} orders</span>
          </div>
        </div>
      </div>

      <!-- Most moved products -->
      <div class="card p-5">
        <h3 class="font-display font-semibold mb-4">Most Moved Products</h3>
        <div v-if="!topMoved.length" style="color:var(--text3);font-size:13px">No movement data yet.</div>
        <div class="space-y-3">
          <div v-for="p in topMoved" :key="p.id" class="flex items-center gap-3">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.name }}</div>
            </div>
            <div class="stock-bar" style="width:80px">
              <div class="stock-bar-fill"
                :style="`width:${topMoved[0]?.moves ? p.moves/topMoved[0].moves*100 : 0}%;background:var(--accent4)`"/>
            </div>
            <span class="font-mono" style="font-size:12px;color:var(--text2);width:55px;text-align:right">{{ p.moves }} moves</span>
          </div>
        </div>
      </div>

      <!-- Stock by category -->
      <div class="card p-5 col-span-2">
        <h3 class="font-display font-semibold mb-4">Stock Value by Category</h3>
        <div v-if="!stockByCategory.length" style="color:var(--text3);font-size:13px">No product data.</div>
        <div class="space-y-3">
          <div v-for="cat in stockByCategory" :key="cat.name" class="flex items-center gap-3">
            <span style="width:130px;font-size:13px;color:var(--text2);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              {{ cat.name }}
            </span>
            <div class="stock-bar flex-1">
              <div class="stock-bar-fill" :style="`width:${cat.pct}%;background:var(--accent)`"/>
            </div>
            <span class="font-mono" style="font-size:12px;width:110px;text-align:right">{{ fmtNum(cat.value) }} DZD</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
