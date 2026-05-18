<script setup>
import { ref, onMounted } from 'vue';
import cartsService from '@/service/cartsService';
import ordersService from '@/service/ordersService';
import customersService from '@/service/customersService';
import { enrichCartSummary, formatCustomerName } from '@/utils/orderMetrics';

const carts = ref([]);
const orders = ref([]);
const orderStates = ref([]);
const customers = ref([]);
const loading = ref(true);
const updatingId = ref(null); // Pour afficher un petit chargeur pendant l'update


onMounted(async () => {
  try {
    const [cartsData, ordersData, statesData, customersData] = await Promise.all([
      cartsService.getCarts(),
      ordersService.getOrders(),
      ordersService.getOrderStates(),
      customersService.getCustomers()
    ]);

    carts.value = cartsData;
    orders.value = ordersData;
    orderStates.value = statesData;
    customers.value = customersData;
    // Création d'un mapping id_customer => customer pour un accès rapide
    const customersById = Object.fromEntries((customersData || []).map((customer) => [String(customer.id), customer]));
    
    // Enrichissement des données des paniers avec les infos de commandes liées et les infos clients
    carts.value = await Promise.all((cartsData || []).map(async (cart) => {
      const summary = await enrichCartSummary(cart);
      // On cherche la commande liée à ce panier (si elle existe)
      const linkedOrder = ordersData.find(o => String(o.id_cart) === String(cart.id)) || null;
      // On récupère les infos du client à partir de l'id_customer du panier
      const customer = customersById[String(cart.id_customer)] || null;

      // On retourne un objet enrichi qui combine les infos du panier, du client, du résumé et de la commande liée
      // On utilise toujours le totalTTC calculé correctement
      return {
        ...cart,
        customerName: formatCustomerName(customer),
        cartDate: summary.cartDate || cart.date_add,
        itemCount: summary.itemCount,
        cartTotalHT: summary.totalHT,
        cartTotalTTC: Number(summary.totalTTC || 0),
        linkedOrder
      };

    }));
  } catch (error) {
    console.error("Erreur sync:", error);
  } finally {
    loading.value = false;
  }
});

// Fonction pour trouver la commande liée à un panier (si elle existe)
const getOrderForCart = (cartId) => {
  return orders.value.find(o => String(o.id_cart) === String(cartId));
};

// Fonction pour changer l'état en base de données
const updateOrderStatus = async (orderId, newStateId) => {
  updatingId.value = orderId;
  try {
    const order = orders.value.find(o => String(o.id) === String(orderId));

    // On appelle une méthode updateOrderState dans ton service (à créer)
    await ordersService.updateOrderState(orderId, newStateId);

    // Si la commande est livrée, on consomme le stock réservé et on écrit un mouvement
    if (Number(newStateId) === 5 && order) {
      await ordersService.consumeOrderReservedStock(order);
    }

    // Si la commande est annulée, on remet les quantités réservées en stock
    if (Number(newStateId) === 6 && order) {
      await ordersService.restoreOrderReservedStock(order);
    }
    
    // On met à jour localement l'objet pour éviter de recharger toute la page
    if (order) order.current_state = newStateId;
    
    console.log(`✅ Commande ${orderId} passée à l'état ${newStateId}`);
  } catch (error) {
    alert("Erreur lors de la mise à jour de l'état");
  } finally {
    updatingId.value = null;
  }
};

// Formatage de la date d'ajout pour affichage "2026-05-14 22:15:03" en "14 mai 2026"
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR');
};

// Formatage du prix avec 2 décimales et le symbole €
const formatPrice = (value) => {
  return `${Number(value || 0).toFixed(2)} €`;
};

const canShowStatusButtons = (order) => {
  const currentState = Number(order?.current_state);
  return currentState === 2 || currentState === 11;
};

const isFinalStatus = (order) => {
  const currentState = Number(order?.current_state);
  return currentState === 5 || currentState === 6;
};

const markAsDelivered = (orderId) => updateOrderStatus(orderId, 5);
const markAsCanceled = (orderId) => updateOrderStatus(orderId, 6);
</script>

<template>
  <div class="monitor-container">
    <h1>Flux des Paniers & Actions</h1>

    <div v-if="loading" class="loading">Chargement...</div>

    <div v-else class="table-responsive">
      <table class="modern-table">
        <thead>
          <tr>
            <th>ID Panier</th>
            <th>Client</th>
            <th>Date panier</th>
            <th>Nb produits</th>
            <th>Total TTC</th>
            <th>Commande</th>
            <th>État Actuel</th>
            <th>Changer l'état</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cart in carts" :key="cart.id">
            <td>#{{ cart.id }}</td>
            <td>👤 {{ cart.customerName }}</td>
            <td>{{ formatDate(cart.cartDate) }}</td>
            <td>{{ cart.itemCount }}</td>
            <td class="price">{{ formatPrice(cart.cartTotalTTC) }}</td>
            
            <td>
              <span v-if="cart.linkedOrder || getOrderForCart(cart.id)" class="ref-badge">
                {{ (cart.linkedOrder || getOrderForCart(cart.id)).reference }}
              </span>
              <span v-else class="empty">-</span>
            </td>

            <td>
              <template v-if="cart.linkedOrder || getOrderForCart(cart.id)">
                <div class="state-indicator">
                  <span class="dot" :style="{ background: orderStates.find(s => String(s.id) === String((cart.linkedOrder || getOrderForCart(cart.id)).current_state))?.color }"></span>
                  {{ orderStates.find(s => String(s.id) === String((cart.linkedOrder || getOrderForCart(cart.id)).current_state))?.name }}
                </div>
              </template>
            </td>

            <td>
              <div v-if="cart.linkedOrder || getOrderForCart(cart.id)" class="action-cell">
                <template v-if="!isFinalStatus(cart.linkedOrder || getOrderForCart(cart.id)) && canShowStatusButtons(cart.linkedOrder || getOrderForCart(cart.id))">
                  <button
                    type="button"
                    class="action-btn deliver-btn"
                    :disabled="updatingId === (cart.linkedOrder || getOrderForCart(cart.id)).id"
                    @click="markAsDelivered((cart.linkedOrder || getOrderForCart(cart.id)).id)"
                  >
                    Livrer
                  </button>
                  <button
                    type="button"
                    class="action-btn cancel-btn"
                    :disabled="updatingId === (cart.linkedOrder || getOrderForCart(cart.id)).id"
                    @click="markAsCanceled((cart.linkedOrder || getOrderForCart(cart.id)).id)"
                  >
                    Annuler
                  </button>
                </template>
                <span v-else class="empty">Aucune action</span>
                <span v-if="updatingId === (cart.linkedOrder || getOrderForCart(cart.id)).id" class="mini-loader">⌛</span>
              </div>
              <span v-else class="empty">N/A</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.monitor-container { padding: 20px; font-family: sans-serif; }
.modern-table { width: 100%; border-collapse: collapse; background: white; }
.modern-table th { text-align: left; padding: 12px; background: #f4f4f4; border-bottom: 2px solid #ddd; font-size: 13px; }
.modern-table td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }

.price { font-weight: bold; color: #2ecc71; }

.ref-badge { background: #e3f2fd; color: #1976d2; padding: 3px 7px; border-radius: 4px; font-weight: bold; font-family: monospace; }

.state-indicator { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); }

.action-cell { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.action-btn {
  border: none;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.action-btn:hover { transform: translateY(-1px); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.deliver-btn { background: #2ecc71; color: white; }
.cancel-btn { background: #e74c3c; color: white; }
.mini-loader { font-size: 12px; }
.empty { color: #ccc; font-style: italic; }
</style>
