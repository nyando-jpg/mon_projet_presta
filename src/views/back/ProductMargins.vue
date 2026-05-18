<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';
import ordersService from '@/service/ordersService';

const rows = ref([]);
const loading = ref(true);
const error = ref('');

const cancelledStateIds = new Set([6]);

const rowKey = (productId, attributeId) => `${productId}:${attributeId}`;

const extractOrderRows = (order) => {
  const lines = Array.isArray(order?.products) ? order.products : [];

  return lines
    .map((row) => ({
      id_product: String(row.product_id || row.id_product || '').trim(),
      id_product_attribute: String(row.product_attribute_id || row.id_product_attribute || '0').trim() || '0',
      quantity: Number(row.product_quantity || row.quantity || 0) || 0
    }))
    .filter((row) => row.id_product && row.quantity > 0);
};

const buildSoldMap = (orders) => {
  const map = new Map();

  for (const order of orders || []) {
    if (cancelledStateIds.has(Number(order.current_state))) {
      continue;
    }

    for (const row of extractOrderRows(order)) {
      const key = rowKey(row.id_product, row.id_product_attribute);
      map.set(key, (map.get(key) || 0) + row.quantity);
    }
  }

  return map;
};

const loadData = async () => {
  loading.value = true;
  error.value = '';

  try {
    const [result, ordersData] = await Promise.all([
      produitsService.getProduits(),
      ordersService.getOrders()
    ]);
    const productList = Array.isArray(result?.products) ? result.products : [];
    const soldMap = buildSoldMap(ordersData);

    const allRows = [];

    for (const product of productList) {
      const stockManagement = await produitsService.getStockManagementRows(product);
      const variantRows = [stockManagement?.productStock, ...(Array.isArray(stockManagement?.combinations) ? stockManagement.combinations : [])]
        .filter(Boolean)
        .map((variant) => {
          const attributeId = String(variant.id || variant.id_product_attribute || '0').trim() || '0';
          const quantityOrdered = Number(soldMap.get(rowKey(String(product.id), attributeId)) || 0);
          const saleUnit = (Number(product.price || 0) || 0) + (Number(variant.priceImpact || 0) || 0);
          const purchaseUnit = Number(product.wholesalePrice || 0) || 0;

          return {
            productId: String(product.id),
            productName: product.name || 'Sans nom',
            reference: product.reference || 'Sans référence',
            variantLabel: variant.label || 'Produit principal',
            quantityOrdered,
            saleUnit,
            purchaseUnit,
            saleTotal: saleUnit * quantityOrdered,
            purchaseTotal: purchaseUnit * quantityOrdered,
            profit: (saleUnit - purchaseUnit) * quantityOrdered
          };
        });

      allRows.push(...variantRows);
    }

    rows.value = allRows.sort((left, right) => {
      const nameCompare = left.productName.localeCompare(right.productName, 'fr');
      if (nameCompare !== 0) return nameCompare;
      return left.variantLabel.localeCompare(right.variantLabel, 'fr');
    });
  } catch (e) {
    console.error('Erreur chargement marges produits:', e);
    error.value = 'Impossible de charger les marges produits.';
  } finally {
    loading.value = false;
  }
};

const totals = computed(() => ({
  sale: rows.value.reduce((sum, row) => sum + row.saleTotal, 0),
  purchase: rows.value.reduce((sum, row) => sum + row.purchaseTotal, 0),
  profit: rows.value.reduce((sum, row) => sum + row.profit, 0)
}));

const currency = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
}).format(Number(value || 0));

const qty = (value) => Number(value || 0).toLocaleString('fr-FR');

onMounted(loadData);
</script>

<template>
  <div class="margin-overview-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Backend / Produits</p>
        <h1>Marges produits</h1>
        <p class="subtitle">Montant des ventes HT, montant d'achat HT et bénéfice estimé par produit.</p>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="state-box">Chargement des marges produits...</div>

    <div v-else class="table-card">
      <div class="summary-strip">
        <div class="summary-item">
          <span>Lignes de commande</span>
          <strong>{{ qty(rows.length) }}</strong>
        </div>
        <div class="summary-item">
          <span>Ventes HT</span>
          <strong>{{ currency(totals.sale) }}</strong>
        </div>
        <div class="summary-item">
          <span>Achat HT</span>
          <strong>{{ currency(totals.purchase) }}</strong>
        </div>
        <div class="summary-item">
          <span>Bénéfice</span>
          <strong>{{ currency(totals.profit) }}</strong>
        </div>
      </div>

      <div class="table-responsive">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Déclinaison</th>
              <th>Qté commandée</th>
              <th>Ventes HT</th>
              <th>Achat HT</th>
              <th>Bénéfice</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.productId}:${row.variantLabel}`" class="product-row">
              <td>
                <strong>{{ row.productName }}</strong>
                <div class="meta">#{{ row.productId }} · {{ row.reference }}</div>
              </td>
              <td>{{ row.variantLabel }}</td>
              <td>{{ qty(row.quantityOrdered) }}</td>
              <td>{{ currency(row.saleTotal) }}</td>
              <td>{{ currency(row.purchaseTotal) }}</td>
              <td :class="['profit-cell', { positive: row.profit >= 0, negative: row.profit < 0 }]">
                {{ currency(row.profit) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!rows.length" class="state-box">
        Aucun produit disponible.
      </div>
    </div>
  </div>
</template>

<style scoped>
.margin-overview-page {
  padding: 24px;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%);
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: #6b7280;
}

h1 {
  margin: 0;
  font-size: 2rem;
  color: #111827;
}

.subtitle {
  margin: 8px 0 0;
  color: #4b5563;
}

.table-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
}

.summary-item {
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.summary-item span {
  display: block;
  color: #64748b;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.summary-item strong {
  display: block;
  margin-top: 6px;
  font-size: 1.4rem;
  color: #0f172a;
}

.table-responsive {
  overflow-x: auto;
}

.modern-table {
  width: 100%;
  border-collapse: collapse;
}

.modern-table th,
.modern-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #eef2f7;
}

.modern-table th {
  background: #0f172a;
  color: #fff;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.product-row {
  background: #fff;
}

.meta {
  margin-top: 4px;
  font-size: 0.82rem;
  color: #64748b;
}

.profit-cell.positive {
  color: #166534;
  font-weight: 700;
}

.profit-cell.negative {
  color: #b91c1c;
  font-weight: 700;
}

.state-box,
.alert {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 14px;
}

.state-box {
  background: #fff;
  color: #475569;
}

.alert.error {
  background: #fee2e2;
  color: #991b1b;
}

@media (max-width: 960px) {
  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .summary-strip {
    grid-template-columns: 1fr;
  }
}
</style>