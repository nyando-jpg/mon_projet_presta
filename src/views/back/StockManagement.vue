<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';

const products = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const savingKey = ref('');
const draftQuantities = ref({});

const rowKey = (productId, stockId) => `${productId}:${stockId}`;

const ensureDraftsForProduct = (product) => {
  const baseRow = product.stockManagement?.productStock;

  if (baseRow?.stockId) {
    draftQuantities.value[rowKey(product.id, baseRow.stockId)] ??= 0;
  }

  for (const combination of product.stockManagement?.combinations || []) {
    if (combination?.stockId) {
      draftQuantities.value[rowKey(product.id, combination.stockId)] ??= 0;
    }
  }
};

const loadProducts = async () => {
  loading.value = true;
  error.value = '';

  try {
    const result = await produitsService.getProduits();
    const list = Array.isArray(result?.products) ? result.products : [];

    const enriched = await Promise.all(
      list.map(async (product) => {
        const stockManagement = await produitsService.getStockManagementRows(product);
        return { ...product, stockManagement };
      })
    );

    products.value = enriched;
    enriched.forEach(ensureDraftsForProduct);
  } catch (e) {
    console.error('Erreur chargement stocks:', e);
    error.value = 'Impossible de charger les produits et leurs stocks.';
  } finally {
    loading.value = false;
  }
};

const filteredProducts = computed(() => {
  const needle = search.value.trim().toLowerCase();

  if (!needle) return products.value;

  return products.value.filter((product) => {
    const haystack = [product.id, product.reference, product.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
});

const getEntryQuantity = (entry) => Number(entry?.quantity || 0);

const submitStockUpdate = async (product, entry) => {
  const key = rowKey(product.id, entry.stockId);
  const amount = Number(draftQuantities.value[key] || 0);

  if (!entry?.stockId || amount <= 0) return;

  savingKey.value = key;

  try {
    const newQuantity = getEntryQuantity(entry) + amount;
    await produitsService.updateStockQuantity(entry.stockId, newQuantity);
    draftQuantities.value[key] = 0;
    await loadProducts();
  } catch (e) {
    console.error('Erreur mise à jour stock:', e);
    error.value = 'La mise à jour du stock a échoué.';
  } finally {
    savingKey.value = '';
  }
};

onMounted(() => {
  loadProducts();
});
</script>

<template>
  <div class="stocks-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Backend / Stock</p>
        <h1>Produits et combinaisons</h1>
        <p class="subtitle">Chaque ligne permet d’ajouter rapidement une quantité au stock correspondant.</p>
      </div>

      <div class="header-actions">
        <input v-model="search" class="search-input" type="text" placeholder="Rechercher un produit..." />
        <button class="refresh-btn" @click="loadProducts" :disabled="loading">Rafraîchir</button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="state-box">Chargement des produits...</div>

    <div v-else class="products-list">
      <article v-for="product in filteredProducts" :key="product.id" class="product-card">
        <div class="product-top">
          <div>
            <p class="product-meta">#{{ product.id }} · {{ product.reference || 'Sans référence' }}</p>
            <h2>{{ product.name }}</h2>
          </div>

          <div class="stock-summary">
            <span>Stock total</span>
            <strong>{{ getEntryQuantity(product.stockManagement?.productStock) }}</strong>
          </div>
        </div>

        <div class="stock-grid">
          <div class="stock-row base-row">
            <div class="row-info">
              <p class="row-label">Stock principal</p>
              <p class="row-detail">ID stock: {{ product.stockManagement?.productStock?.stockId || 'introuvable' }}</p>
            </div>

            <div class="row-quantity">Actuel: {{ getEntryQuantity(product.stockManagement?.productStock) }}</div>

            <div class="row-action">
              <input
                v-model.number="draftQuantities[rowKey(product.id, product.stockManagement?.productStock?.stockId)]"
                type="number"
                min="1"
                step="1"
                placeholder="+ quantité"
                :disabled="!product.stockManagement?.productStock?.stockId"
              />
              <button
                class="add-btn"
                :disabled="!product.stockManagement?.productStock?.stockId || savingKey === rowKey(product.id, product.stockManagement?.productStock?.stockId)"
                @click="submitStockUpdate(product, product.stockManagement?.productStock)"
              >
                {{ savingKey === rowKey(product.id, product.stockManagement?.productStock?.stockId) ? 'En cours...' : 'Ajouter' }}
              </button>
            </div>
          </div>

          <div v-if="!product.stockManagement?.combinations?.length" class="no-combinations">
            Aucune combinaison disponible pour ce produit.
          </div>

          <div v-for="combination in product.stockManagement?.combinations || []" :key="combination.id" class="stock-row">
            <div class="row-info">
              <p class="row-label">Combinaison #{{ combination.id }}</p>
              <p class="row-detail">{{ combination.label }}</p>
              <p class="row-detail muted">Impact prix: {{ combination.priceImpact.toFixed(2) }} €</p>
            </div>

            <div class="row-quantity">Actuel: {{ getEntryQuantity(combination) }}</div>

            <div class="row-action">
              <input
                v-model.number="draftQuantities[rowKey(product.id, combination.stockId)]"
                type="number"
                min="1"
                step="1"
                placeholder="+ quantité"
                :disabled="!combination.stockId"
              />
              <button
                class="add-btn"
                :disabled="!combination.stockId || savingKey === rowKey(product.id, combination.stockId)"
                @click="submitStockUpdate(product, combination)"
              >
                {{ savingKey === rowKey(product.id, combination.stockId) ? 'En cours...' : 'Ajouter' }}
              </button>
            </div>
          </div>
        </div>
      </article>

      <div v-if="!filteredProducts.length" class="state-box">
        Aucun produit ne correspond à la recherche.
      </div>
    </div>
  </div>
</template>

<style scoped>
.stocks-page {
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
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  min-width: 280px;
  padding: 12px 14px;
  border: 1px solid #dbe3ee;
  border-radius: 12px;
  background: #fff;
}

.refresh-btn,
.add-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
}

.refresh-btn {
  background: #0f172a;
  color: #fff;
}

.products-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.product-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #dde6f1;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}

.product-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.product-meta {
  margin: 0 0 4px;
  color: #64748b;
  font-size: 0.9rem;
}

.product-top h2 {
  margin: 0;
  font-size: 1.35rem;
  color: #0f172a;
}

.stock-summary {
  min-width: 120px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #eff6ff;
  color: #1d4ed8;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
}

.stock-summary span {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stock-summary strong {
  font-size: 1.4rem;
}

.stock-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stock-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) auto auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
  background: #f8fbff;
  border: 1px solid #e2e8f0;
}

.base-row {
  background: #f1f5f9;
}

.row-label {
  margin: 0;
  font-weight: 700;
  color: #0f172a;
}

.row-detail {
  margin: 3px 0 0;
  color: #475569;
}

.row-detail.muted {
  color: #64748b;
  font-size: 0.92rem;
}

.row-quantity {
  font-weight: 700;
  color: #0f172a;
}

.row-action {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}

.row-action input {
  width: 110px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #dbe3ee;
  background: #fff;
}

.add-btn {
  background: linear-gradient(135deg, #10b981, #0ea5e9);
  color: #fff;
}

.add-btn:disabled,
.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.state-box,
.alert.error,
.no-combinations {
  padding: 16px 18px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #dbe3ee;
  color: #475569;
}

.alert.error {
  margin-bottom: 16px;
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}

.no-combinations {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

@media (max-width: 900px) {
  .page-header,
  .product-top,
  .stock-row {
    grid-template-columns: 1fr;
    display: grid;
    align-items: stretch;
  }

  .header-actions,
  .row-action {
    justify-content: flex-start;
  }

  .search-input {
    min-width: 0;
    width: 100%;
  }
}
</style>