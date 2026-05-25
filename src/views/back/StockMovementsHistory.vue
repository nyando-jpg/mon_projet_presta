<script setup>
import { computed, onMounted, ref } from 'vue';
import ordersService from '@/service/ordersService';
import produitsService from '@/service/produitsService';

const movements = ref([]);
const loading = ref(true);
const error = ref('');
const selectedProduct = ref('');
const selectedDay = ref('');

const loadMovements = async () => {
  loading.value = true;
  error.value = '';

  try {
    const [data, productsResponse] = await Promise.all([
      ordersService.getStockMovementsHistory(),
      produitsService.getProduits()
    ]);

    const products = Array.isArray(productsResponse?.products) ? productsResponse.products : [];
    const productRows = await Promise.all(
      products.map(async (product) => {
        const stockManagement = await produitsService.getStockManagementRows(product);
        return { product, stockManagement };
      })
    );

    const stockLabelById = new Map();

    for (const entry of productRows) {
      const productName = entry.product?.name || `Produit #${entry.product?.id || 'N/A'}`;
      const baseStockId = entry.stockManagement?.productStock?.stockId;

      if (baseStockId) {
        stockLabelById.set(String(baseStockId), `${productName} - Stock principal`);
      }

      for (const combination of entry.stockManagement?.combinations || []) {
        if (combination?.stockId) {
          const combinationLabel = combination.label ? ` - ${combination.label}` : ` - Combinaison #${combination.id}`;
          stockLabelById.set(String(combination.stockId), `${productName}${combinationLabel}`);
        }
      }
    }

    movements.value = (Array.isArray(data) ? data : [])
      .slice()
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .map((movement) => ({
      ...movement,
      productLabel: stockLabelById.get(String(movement.id_stock)) || `Stock #${movement.id_stock || 'N/A'}`
      }));
  } catch (e) {
    console.error('Erreur chargement historique mouvements:', e);
    error.value = 'Impossible de charger l’historique des mouvements.';
    movements.value = [];
  } finally {
    loading.value = false;
  }
};

const filteredMovements = computed(() => {
  return movements.value.filter((movement) => {
    const matchesProduct = !selectedProduct.value || String(movement.id_stock) === String(selectedProduct.value);
    const movementDay = movement.date_add ? movement.date_add.split(' ')[0] : '';
    const matchesDay = !selectedDay.value || movementDay === selectedDay.value;

    return matchesProduct && matchesDay;
  });
});

const productOptions = computed(() => {
  const options = new Map();

  movements.value.forEach((movement) => {
    const stockId = String(movement.id_stock || '');
    const label = movement.productLabel || `Stock #${movement.id_stock || 'N/A'}`;

    if (stockId) {
      options.set(stockId, label);
    }
  });

  return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
});

const dayOptions = computed(() => {
  const days = new Set();

  movements.value.forEach((movement) => {
    if (movement.date_add) {
      days.add(movement.date_add.split(' ')[0]);
    }
  });

  return Array.from(days).sort().reverse();
});

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('fr-FR');
};

const getMovementType = (movement) => {
  return Number(movement?.sign) >= 0 ? 'Entrée' : 'Sortie';
};

const getMovementBadgeClass = (movement) => {
  return Number(movement?.sign) >= 0 ? 'entry' : 'exit';
};

const formatEmployee = (movement) => {
  const parts = [movement?.employee_firstname, movement?.employee_lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : `#${movement?.id_employee || 'N/A'}`;
};

const formatQuantity = (movement) => {
  const quantity = Math.abs(Number(movement?.physical_quantity || 0));
  return quantity.toFixed(0);
};

onMounted(() => {
  loadMovements();
});
</script>

<template>
  <div class="movements-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Backend / Stock</p>
        <h1>Historique des mouvements</h1>
        <p class="subtitle">Lecture directe de la table <strong>ps_stock_mvt</strong> via la ressource <strong>stock_movements</strong>.</p>
      </div>

      <div class="header-actions">
        <select v-model="selectedProduct" class="filter-input">
          <option value="">Tous les produits</option>
          <option v-for="option in productOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select v-model="selectedDay" class="filter-input">
          <option value="">Tous les jours</option>
          <option v-for="day in dayOptions" :key="day" :value="day">
            {{ formatDate(day) }}
          </option>
        </select>

        <button class="refresh-btn" @click="loadMovements" :disabled="loading">Rafraîchir</button>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="state-box">Chargement de l’historique...</div>

    <div v-else class="table-card">
      <div class="table-header">
        <span>ID</span>
        <span>Date</span>
        <span>Type</span>
        <span>Quantité</span>
        <span>Produit</span>
        <span>Stock</span>
        <span>Commande</span>
      </div>

      <div v-for="movement in filteredMovements" :key="movement.id" class="table-row">
        <span>#{{ movement.id }}</span>
        <span>{{ formatDate(movement.date_add) }}</span>
        <span>
          <span class="type-badge" :class="getMovementBadgeClass(movement)">{{ getMovementType(movement) }}</span>
        </span>
        <span>{{ formatQuantity(movement) }}</span>
        <span class="product-name">{{ movement.productLabel }}</span>
        <span>#{{ movement.id_stock || 'N/A' }}</span>
        <span>{{ movement.id_order || '-' }}</span>
      </div>

      <div v-if="!filteredMovements.length" class="state-box">
        Aucun mouvement trouvé.
      </div>
    </div>
  </div>
</template>

<style scoped>
.movements-page {
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

.filter-input {
  min-width: 220px;
  padding: 12px 14px;
  border: 1px solid #dbe3ee;
  border-radius: 12px;
  background: #fff;
}

.refresh-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
  font-weight: 700;
  cursor: pointer;
  background: #0f172a;
  color: #fff;
}

.alert.error,
.state-box,
.table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}

.alert.error,
.state-box {
  padding: 16px;
  margin-bottom: 16px;
}

.table-card {
  overflow: hidden;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 90px 180px 110px 110px 1.6fr 110px 110px 1fr 120px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
}

.table-header {
  background: #0f172a;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
}

.table-row {
  border-top: 1px solid #eef2f7;
  color: #1f2937;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
}

.type-badge.entry {
  background: #dcfce7;
  color: #166534;
}

.type-badge.exit {
  background: #fee2e2;
  color: #991b1b;
}

.product-name {
  font-weight: 600;
  color: #0f172a;
}
</style>
