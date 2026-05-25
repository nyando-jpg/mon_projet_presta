<script setup>
import { computed, ref, onMounted } from 'vue';
import cartsService from '@/service/cartsService';
import addressesService from '@/service/adressesService';
import ordersService from '@/service/ordersService';
import { enrichCartSummary } from '@/utils/orderMetrics';

const items = ref([]); // Contiendra le mélange paniers / commandes
const orderStates = ref([]);
const loading = ref(true);
const historyLoading = ref(false);
const selectedItem = ref(null);
const selectedHistory = ref([]);
const modalOpen = ref(false);
const duplicatingId = ref(null);
const duplicateEditorId = ref(null);
const duplicateQuantities = ref({});

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

const loadActivities = async () => {
  loading.value = true;
  try {
    const customer = JSON.parse(localStorage.getItem('customer'));
    if (!customer?.id) return;

    // Récupération de tout en parallèle
    const [allCarts, allOrders, states] = await Promise.all([
      cartsService.getCarts(), // On filtrera localement par id_customer
      ordersService.getOrdersByCustomer(customer.id),
      ordersService.getOrderStates()
    ]);

    orderStates.value = states;

    // 1. On filtre les paniers de CE client
    const customerCarts = allCarts.filter(c => String(c.id_customer) === String(customer.id));

    const sortedCustomerCarts = [...customerCarts].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

    const cartSummaries = new Map(
      await Promise.all(sortedCustomerCarts.map(async (cart) => [String(cart.id), await enrichCartSummary(cart)]))
    );

    // 2. On crée la liste finale
    items.value = sortedCustomerCarts.map(cart => {
      // On cherche si une commande est liée à ce panier
      const linkedOrder = allOrders.find(o => String(o.id_cart) === String(cart.id));
      const summary = cartSummaries.get(String(cart.id)) || { cartDate: cart.date_add, itemCount: 0, totalTTC: 0 };
      if (duplicateQuantities.value[String(cart.id)] === undefined) {
        duplicateQuantities.value[String(cart.id)] = 1;
      }
      
      return {
        cartId: cart.id,
        cart,
        date: summary.cartDate || cart.date_add,
        itemCount: summary.itemCount,
        totalHT: summary.totalHT,
        totalTTC: summary.totalTTC,
        total: linkedOrder ? Number(linkedOrder.total_paid) : summary.totalTTC,
        order: linkedOrder || null, // null si pas de commande = "Panier en cours"
      };
    });

  } catch (error) {
    console.error("Erreur sync client:", error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadActivities);

const getState = (stateId) => {
  return orderStates.value.find(s => String(s.id) === String(stateId)) || { name: 'Inconnu', color: '#999' };
};

const formatPrice = (value) => {
  return `${Number(value || 0).toFixed(2)} €`;
};

const formatHistoryDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const orderHistoryTimeline = computed(() => {
  return selectedHistory.value.map((entry) => {
    const state = getState(entry.id_order_state);
    return {
      ...entry,
      stateName: state.name,
      stateColor: state.color
    };
  });
});

const openHistory = async (item) => {
  if (!item?.order?.id) return;

  selectedItem.value = item;
  modalOpen.value = true;
  historyLoading.value = true;
  selectedHistory.value = [];

  try {
    const history = await ordersService.getOrderHistory(item.order.id);
    selectedHistory.value = Array.isArray(history) ? history : [];
  } catch (error) {
    console.error('Erreur historique commande:', error);
    selectedHistory.value = [];
  } finally {
    historyLoading.value = false;
  }
};

const closeHistory = () => {
  modalOpen.value = false;
  selectedItem.value = null;
  selectedHistory.value = [];
  historyLoading.value = false;
};

const getDuplicateMultiplier = (cartId) => Math.max(1, parseInt(duplicateQuantities.value[cartId] || 1, 10) || 1);

const getDuplicateCustomerId = (sourceOrder, sourceCart) => {
  const customer = JSON.parse(localStorage.getItem('customer'));
  return String(customer?.id || sourceOrder.id_customer || sourceCart.id_customer || '').trim();
};

const getDuplicateAddressId = async (sourceOrder, customerId) => {
  const directAddressId = String(sourceOrder.id_address_delivery || sourceOrder.id_address_invoice || '').trim();
  if (directAddressId) return directAddressId;

  const addresses = await addressesService.getAddressesByCustomer(customerId);
  return String(addresses?.[0]?.id || '').trim();
};

const getDuplicateTotals = (item, sourceOrder) => {
  const shippingTotal = Number(sourceOrder.total_shipping || sourceOrder.total_shipping_tax_incl || 0) || 0;
  const totalHT = Number(item.totalHT || sourceOrder.total_paid_tax_excl || sourceOrder.total_products || 0) || 0;
  const totalProductsTTC = Number(item.totalTTC || sourceOrder.total_products_wt || 0) || 0;

  return {
    shippingTotal,
    totalHT,
    totalProductsTTC,
    totalPaidTTC: totalProductsTTC + shippingTotal
  };
};

const createDuplicatedCart = async ({ sourceRows, customerId, multiplier }) => {
  let newCart = null;

  for (const [index, row] of sourceRows.entries()) {
    const payload = {
      id_customer: customerId,
      id_product: String(row.id_product || ''),
      id_product_attribute: String(row.id_product_attribute || '0'),
      quantity: String((Math.max(1, parseInt(row.quantity || 0, 10) || 1)) * multiplier)
    };

    if (index > 0 && newCart?.id) {
      payload.id_cart = newCart.id;
    }

    newCart = await cartsService.addToCart(payload);
  }

  return newCart;
};

const duplicateOrder = async (item) => {
  const sourceOrder = item?.order;
  const sourceCart = item?.cart;

  if (!sourceOrder || !sourceCart) {
    alert('Aucune commande à dupliquer pour cette ligne.');
    return;
  }

  duplicatingId.value = item.cartId;

  try {
    const multiplier = getDuplicateMultiplier(item.cartId);
    const customerId = getDuplicateCustomerId(sourceOrder, sourceCart);

    if (!customerId) {
      throw new Error('Client introuvable');
    }

    const sourceRows = sourceCart?.associations?.cart_rows?.cart_row || [];
    if (!sourceRows.length) {
      throw new Error('Aucun produit à copier');
    }

    const stockCheck = await ordersService.checkDuplicateStockAvailability(sourceCart, multiplier);
    if (!stockCheck.ok) {
      const details = stockCheck.shortages
        .map((line) => `Produit ${line.id_product}${line.id_product_attribute !== '0' ? ` / déclinaison ${line.id_product_attribute}` : ''} : restant ${line.available}, manquant ${line.missing}`)
        .join('\n');

      alert(`Stock insuffisant pour la duplication :\n${details}`);
      return;
    }

    const addressId = await getDuplicateAddressId(sourceOrder, customerId);

    if (!addressId) {
      throw new Error('Adresse introuvable');
    }

    const carrierId = String(sourceOrder.id_carrier || '1').trim() || '1';
    const { shippingTotal, totalHT, totalProductsTTC, totalPaidTTC } = getDuplicateTotals(item, sourceOrder);
    const newCart = await createDuplicatedCart({ sourceRows, customerId, multiplier });

    if (!newCart?.id) {
      throw new Error('Impossible de créer le panier dupliqué');
    }

    await cartsService.updateCartAddresses(newCart.id, addressId, carrierId);

    const result = await ordersService.createOrder({
      id_customer: customerId,
      id_cart: newCart.id,
      id_address: addressId,
      id_carrier: carrierId,
      total_paid_tax_excl: String(totalHT),
      total_paid_tax_incl: String(totalPaidTTC),
      total_paid: String(totalPaidTTC),
      total_products: String(totalHT),
      total_products_wt: String(totalProductsTTC),
      shipping_cost: String(shippingTotal)
    });

    if (result?.id) {
      await ordersService.updateOrderState(result.id, 5);
      await ordersService.consumeOrderReservedStock(newCart);
    }

    await loadActivities();
    alert(`✅ Commande dupliquée et livrée avec succès : n°${result.id}`);
  } catch (error) {
    console.error('Erreur duplication commande:', error);
    alert(`Erreur lors de la duplication: ${error?.message || 'inconnue'}`);
  } finally {
    duplicatingId.value = null;
  }
};

const openDuplicateEditor = (item) => {
  const cartId = String(item?.cartId || '');
  if (!cartId) return;

  if (duplicateQuantities.value[cartId] === undefined) {
    duplicateQuantities.value[cartId] = 1;
  }

  duplicateEditorId.value = cartId;
};

const confirmDuplicateOrder = async (item) => {
  const cartId = String(item?.cartId || '');
  if (!cartId) return;

  duplicateEditorId.value = cartId;
  await duplicateOrder(item);
};
</script>
<template>
  <div class="my-account">
    <h2>Mes Activités (Paniers & Commandes)</h2>

    <div v-if="loading" class="msg">Chargement...</div>

    <div v-else class="simple-list">
      <div
        v-for="item in items"
        :key="item.cartId"
        class="list-row"
        :class="{ clickable: item.order }"
        @click="openHistory(item)"
      >
        
        <div class="col-main">
          <span class="id-tag">#{{ item.cartId }}</span>
          <span class="date">{{ formatDate(item.date) }}</span>
        </div>

        <div class="col-info">
          <template v-if="item.order">
            <span class="order-ref">{{ item.order.reference }}</span>
            <span 
              class="state-dot" 
              :style="{ backgroundColor: getState(item.order.current_state).color }"
            >
              {{ getState(item.order.current_state).name }}
            </span>
          </template>

          <template v-else>
            <span class="pending-tag">🛒 Panier en cours</span>
          </template>

          <span class="item-count">{{ item.itemCount }} produit(s)</span>

          <button
            v-if="item.order"
            type="button"
            class="duplicate-btn"
            :disabled="duplicatingId === item.cartId"
            @click.stop="openDuplicateEditor(item)"
          >
            Dupliquer
          </button>
          <input
            v-if="item.order && duplicateEditorId === String(item.cartId)"
            v-model="duplicateQuantities[item.cartId]"
            type="number"
            min="1"
            step="1"
            class="duplicate-qty"
            @click.stop
          />
          <button
            v-if="item.order && duplicateEditorId === String(item.cartId)"
            type="button"
            class="duplicate-confirm-btn"
            :disabled="duplicatingId === item.cartId"
            @click.stop="confirmDuplicateOrder(item)"
          >
            Valider
          </button>
          <button
            v-if="item.order && duplicateEditorId === String(item.cartId)"
            type="button"
            class="duplicate-cancel-btn"
            @click.stop="duplicateEditorId = null"
          >
            Annuler
          </button>
          <span v-if="duplicatingId === item.cartId" class="dup-loader">⌛</span>
        </div>

        <div class="col-price">
          {{ formatPrice(item.total) }}
        </div>

      </div>
    </div>

    <teleport to="body">
      <div v-if="modalOpen" class="modal-overlay" @click.self="closeHistory">
        <div class="modal-card">
          <div class="modal-header">
            <div>
              <p class="modal-eyebrow">Historique commande</p>
              <h3 v-if="selectedItem?.order">{{ selectedItem.order.reference }}</h3>
              <h3 v-else>Historique</h3>
            </div>
            <button class="modal-close" @click="closeHistory">×</button>
          </div>

          <div v-if="historyLoading" class="modal-state">Chargement de l’historique...</div>

          <div v-else>
            <div v-if="orderHistoryTimeline.length" class="timeline">
              <div v-for="entry in orderHistoryTimeline" :key="entry.id" class="timeline-item">
                <div class="timeline-dot" :style="{ backgroundColor: entry.stateColor }"></div>
                <div class="timeline-content">
                  <div class="timeline-topline">
                    <strong>{{ entry.stateName }}</strong>
                    <span>{{ formatHistoryDate(entry.date_add) }}</span>
                  </div>
                  <div class="timeline-meta">
                    État #{{ entry.id_order_state }} · Employé {{ entry.employee_firstname || entry.employee_lastname ? `${entry.employee_firstname} ${entry.employee_lastname}`.trim() : 'N/A' }}
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="modal-state">
              Aucun historique trouvé pour cette commande.
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>
<style scoped>
.my-account { max-width: 700px; margin: 0 auto; padding: 20px; font-family: sans-serif; }
h2 { font-size: 1.2rem; margin-bottom: 20px; color: #333; }

.simple-list { border-top: 1px solid #eee; }

.list-row {
  display: flex;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid #eee;
  gap: 15px;
}

.list-row.clickable {
  cursor: pointer;
}

.list-row.clickable:hover {
  background: #f9fbfd;
}

.col-main { width: 120px; display: flex; flex-direction: column; }
.id-tag { font-weight: bold; color: #666; font-size: 0.9rem; }
.date { font-size: 0.8rem; color: #999; }

.col-info { flex-grow: 1; display: flex; align-items: center; gap: 10px; }
.item-count {
  color: #34495e;
  font-size: 0.9rem;
  font-weight: 600;
  background: #f4f7fa;
  padding: 3px 8px;
  border-radius: 999px;
}
.order-ref { font-family: monospace; font-weight: bold; background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }

.duplicate-btn {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: #1976d2;
  color: white;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.duplicate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.duplicate-qty {
  width: 64px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

.duplicate-confirm-btn,
.duplicate-cancel-btn {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.duplicate-confirm-btn {
  background: #16a34a;
  color: white;
}

.duplicate-cancel-btn {
  background: #e5e7eb;
  color: #374151;
}

.dup-loader {
  font-size: 0.9rem;
}

.state-dot {
  padding: 3px 10px;
  border-radius: 12px;
  color: white;
  font-size: 0.7rem;
  font-weight: bold;
  text-transform: uppercase;
}

.pending-tag {
  color: #e67e22;
  font-style: italic;
  font-size: 0.9rem;
  font-weight: 500;
}

.col-price { font-weight: bold; color: #2c3e50; min-width: 80px; text-align: right; }

.msg { padding: 20px; text-align: center; color: #666; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1000;
}

.modal-card {
  width: min(720px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.modal-eyebrow {
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  color: #6b7280;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.modal-close {
  border: none;
  background: #f3f4f6;
  border-radius: 999px;
  width: 34px;
  height: 34px;
  cursor: pointer;
  font-size: 1.1rem;
}

.modal-state {
  padding: 18px;
  text-align: center;
  color: #6b7280;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 6px;
  flex: 0 0 12px;
}

.timeline-content {
  flex: 1;
  padding-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}

.timeline-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.timeline-topline span,
.timeline-meta {
  color: #6b7280;
  font-size: 0.85rem;
}

.timeline-meta {
  margin-top: 4px;
}
</style>
