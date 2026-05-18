<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';
import ordersService from '@/service/ordersService';

const products = ref([]);
const loading = ref(true);
const error = ref('');

const finalStateIds = new Set([5, 6]);

const rowKey = (productId, stockId) => `${productId}:${stockId}`;

const extractOrderRows = (order) => {
  const rows = Array.isArray(order?.products) ? order.products : [];

  return rows
    .map((row) => ({
      id_product: String(row.product_id || row.id_product || '').trim(),
      id_product_attribute: String(row.product_attribute_id || row.id_product_attribute || '0').trim() || '0',
      quantity: Number(row.product_quantity || row.quantity || 0) || 0
    }))
    .filter((row) => row.id_product && row.quantity > 0);
};

const buildReservedMap = (orders) => {
  const map = new Map();

  for (const order of orders || []) {
    if (finalStateIds.has(Number(order.current_state))) {
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
    const [productsData, ordersData] = await Promise.all([
      produitsService.getProduits(),
      ordersService.getOrders()
    ]);
    const categoriesData = await produitsService.getCategories();

    const productList = Array.isArray(productsData?.products) ? productsData.products : [];
    const reservedMap = buildReservedMap(ordersData);
    const categoriesById = Object.fromEntries((categoriesData || []).map((category) => [String(category.id), category.name]));

    const enriched = await Promise.all(productList.map(async (product) => {
      const stockManagement = await produitsService.getStockManagementRows(product);
      const mainStock = stockManagement?.productStock || null;
      const total = Number(mainStock?.quantity || 0);
      const reserved = Number(reservedMap.get(rowKey(String(product.id), '0')) || 0);
      const categoryIds = Array.isArray(product.categories) ? product.categories : [];
      const categoryLabels = categoryIds
        .map((categoryId) => categoriesById[String(categoryId)] || `#${categoryId}`)
        .filter(Boolean);

      return {
        id: String(product.id),
        reference: product.reference || 'Sans référence',
        name: product.name,
        categories: categoryLabels,
        total,
        reserved,
        remaining: Math.max(0, total - reserved),
        stockLabel: mainStock?.label || 'Stock principal',
        stockId: String(mainStock?.stockId || mainStock?.id || '')
      };
    }));

    products.value = enriched;
  } catch (e) {
    console.error('Erreur chargement synthèse stocks:', e);
    error.value = 'Impossible de charger la synthèse des stocks.';
  } finally {
    loading.value = false;
  }
};

const filteredProducts = computed(() => {
  return products.value;
});

const groupedCategories = computed(() => {
  const groups = new Map();

  for (const product of filteredProducts.value) {
    const categoryNames = product.categories.length ? product.categories : ['Sans catégorie'];

    for (const categoryName of categoryNames) {
      if (!groups.has(categoryName)) {
        groups.set(categoryName, {
          name: categoryName,
          productCount: 0,
          total: 0,
          reserved: 0,
          remaining: 0
        });
      }

      const group = groups.get(categoryName);
      group.productCount += 1;
      group.total += product.total;
      group.reserved += product.reserved;
      group.remaining += product.remaining;
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'fr'));
});

const formatQty = (value) => Number(value || 0).toLocaleString('fr-FR');

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="stock-overview-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Backend / Stocks</p>
        <h1>Stocks par produit</h1>
        <p class="subtitle">Vue synthétique du stock total, des quantités réservées et du reste disponible.</p>
      </div>

      <div class="header-actions">
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="state-box">Chargement de la synthèse des stocks...</div>

    <div v-else class="table-card">
      <!-- <div class="summary-strip">
        <div class="summary-item">
          <span>Catégories</span>
          <strong>{{ groupedCategories.length }}</strong>
        </div>
        <div class="summary-item">
          <span>Total stock</span>
          <strong>{{ formatQty(groupedCategories.reduce((sum, group) => sum + group.total, 0)) }}</strong>
        </div>
        <div class="summary-item">
          <span>Réservé</span>
          <strong>{{ formatQty(groupedCategories.reduce((sum, group) => sum + group.reserved, 0)) }}</strong>
        </div>
        <div class="summary-item">
          <span>Reste</span>
          <strong>{{ formatQty(groupedCategories.reduce((sum, group) => sum + group.remaining, 0)) }}</strong>
        </div>
      </div> -->

      <div class="table-responsive">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Produits</th>
              <th>Total</th>
              <th>Réservé</th>
              <th>Reste</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groupedCategories" :key="group.name" class="category-row">
              <td>
                <strong>{{ group.name }}</strong>
              </td>
              <td>{{ formatQty(group.productCount) }}</td>
              <td>{{ formatQty(group.total) }}</td>
              <td>{{ formatQty(group.reserved) }}</td>
              <td>{{ formatQty(group.remaining) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!groupedCategories.length" class="state-box">
        Aucun stock à afficher.
      </div>
    </div>
  </div>
</template>

<style scoped>
.stock-overview-page {
  padding: 24px;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%);
  min-height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-end;
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

.header-actions {
  display: flex;
  align-items: center;
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
  font-size: 1.5rem;
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

.detail-row {
  background: #f8fafc;
  color: #475569;
}

.category-row td {
  background: #f8fafc;
  color: #475569;
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
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

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