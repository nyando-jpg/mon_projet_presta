<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';
import ordersService from '@/service/ordersService';

const products = ref([]);
const orders = ref([]);
const loading = ref(true);
const error = ref('');

const reservedStateIds = new Set([2, 11]);

const localExtractVal = (node) => {
  if (typeof node === 'string') return node;
  if (!node) return '';
  if (node['#text']) return String(node['#text']);
  if (node.language && Array.isArray(node.language)) {
    const first = node.language[0];
    return first['#text'] || first.value || '';
  }
  return String(node);
};

const rowKey = (productId, stockId) => `${productId}:${stockId}`;

const extractOrderRows = (order) => {
  const rows = Array.isArray(order?.products) ? order.products : [];

  return rows
    .map((row) => ({
      id_product: String(localExtractVal(row.product_id || row.id_product || '')).trim(),
      id_product_attribute: String(localExtractVal(row.product_attribute_id || row.id_product_attribute || '0')).trim() || '0',
      quantity: Number(localExtractVal(row.product_quantity || row.quantity || 0)) || 0
    }))
    .filter((row) => row.id_product && row.quantity > 0);
};

const buildReservedMap = (ordersData) => {
  const map = new Map();
  console.log('buildReservedMap - ordersData.length:', ordersData?.length);

  for (const order of ordersData || []) {
    console.log('order.current_state:', order.current_state, 'has in set?', reservedStateIds.has(Number(order.current_state)));
    // Ne compter que les commandes avec état 2 ou 11 comme réservées
    if (!reservedStateIds.has(Number(order.current_state))) {
      continue;
    }

    const rows = extractOrderRows(order);
    console.log('extractOrderRows result:', rows);
    for (const row of rows) {
      // Compter TOUS les produits/variantes, pas seulement le main stock (id_product_attribute = '0')
      const key = rowKey(row.id_product, row.id_product_attribute);
      console.log('Adding key:', key, 'qty:', row.quantity);
      map.set(key, (map.get(key) || 0) + row.quantity);
    }
  }

  console.log('Final reservedMap:', map);
  console.log('Final reservedMap keys:', Array.from(map.keys()));
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

    // Filtrer et sauvegarder les commandes avec état 2 ou 11
    orders.value = (ordersData || []).filter((order) => reservedStateIds.has(Number(order.current_state)));

    const enriched = await Promise.all(productList.map(async (product) => {
      const stockManagement = await produitsService.getStockManagementRows(product);
      const mainStock = stockManagement?.productStock || null;
      // "current" = la quantité actuellement en stock (ce qui était auparavant affiché dans la colonne "Total")
      const current = Number(mainStock?.quantity || 0);

      // Calculer le réservé en additionnant TOUTES les variantes du produit
      let reserved = 0;
      const productIdStr = String(product.id);
      console.log(`Product ${product.id} (string: '${productIdStr}') - checking reservedMap keys:`, Array.from(reservedMap.keys()));
      for (const [key, qty] of reservedMap) {
        const [mapProductId] = key.split(':');
        console.log(`  Comparing '${mapProductId}' === '${productIdStr}'?`, mapProductId === productIdStr);
        if (mapProductId === productIdStr) {
          reserved += qty;
          console.log(`    MATCH! Found key ${key} with qty ${qty}, reserved now: ${reserved}`);
        }
      }
      console.log(`Product ${product.id} final reserved: ${reserved}`);
      
      // Nouveau comportement demandé:
      // - la colonne `total` doit afficher la valeur actuelle + réservé
      // - la colonne `reste` doit afficher la valeur actuelle (ancienne "total")
      const total = current + reserved;
      const remaining = current;
      
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
        // `reste` montre désormais la quantité actuelle en stock
        remaining: Math.max(0, remaining),
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

const reservedOrders = computed(() => {
  return orders.value;
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

    <!-- Section des commandes réservées -->
    <div class="table-card" style="margin-top: 24px;">
      <div class="page-header" style="padding: 20px 24px; margin: 0; border-bottom: 1px solid #e2e8f0;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem; color: #111827;">Commandes réservées (état 2 ou 11)</h2>
          <p style="margin: 6px 0 0; color: #4b5563; font-size: 0.9rem;">Liste des commandes avec statut 2 ou 11</p>
        </div>
      </div>

      <div class="table-responsive">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Produit</th>
              <th>Variant</th>
              <th>Quantité</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="order in reservedOrders" :key="order.id">
              <template v-for="product in (Array.isArray(order.products) ? order.products : [])" :key="`${order.id}-${product.product_id}-${product.product_attribute_id}`">
                <tr class="order-row">
                  <td>
                    <strong>{{ order.reference }}</strong>
                  </td>
                  <td>{{ product.product_name }}</td>
                  <td>{{ product.product_attribute_id || '0' }}</td>
                  <td>{{ formatQty(product.product_quantity || 0) }}</td>
                  <td>
                    <span :class="['state-badge', `state-${order.current_state}`]">
                      {{ order.current_state === 2 ? 'Payée' : order.current_state === 11 ? 'Payée' : `État ${order.current_state}` }}
                    </span>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>

      <div v-if="!reservedOrders.length" class="state-box">
        Aucune commande réservée à afficher.
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

.order-row {
  background: #fff;
}

.order-row:hover {
  background: #f8fafc;
}

.state-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.state-2 {
  background: #dcfce7;
  color: #166534;
}

.state-11 {
  background: #fce7f3;
  color: #831843;
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