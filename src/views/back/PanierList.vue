<script setup>
import { ref, onMounted } from 'vue';
import cartsService from '@/service/cartsService';
import ordersService from '@/service/ordersService';

const carts = ref([]);
const orders = ref([]);
const orderStates = ref([]);
const loading = ref(true);
const updatingId = ref(null); // Pour afficher un petit chargeur pendant l'update

onMounted(async () => {
  try {
    const [cartsData, ordersData, statesData] = await Promise.all([
      cartsService.getCarts(),
      ordersService.getOrders(),
      ordersService.getOrderStates()
    ]);
    carts.value = cartsData;
    orders.value = ordersData;
    orderStates.value = statesData;
  } catch (error) {
    console.error("Erreur sync:", error);
  } finally {
    loading.value = false;
  }
});

const getOrderForCart = (cartId) => {
  return orders.value.find(o => String(o.id_cart) === String(cartId));
};

// Fonction pour changer l'état en base de données
const updateOrderStatus = async (orderId, newStateId) => {
  updatingId.value = orderId;
  try {
    // On appelle une méthode updateOrderState dans ton service (à créer)
    await ordersService.updateOrderState(orderId, newStateId);
    
    // On met à jour localement l'objet pour éviter de recharger toute la page
    const order = orders.value.find(o => String(o.id) === String(orderId));
    if (order) order.current_state = newStateId;
    
    console.log(`✅ Commande ${orderId} passée à l'état ${newStateId}`);
  } catch (error) {
    alert("Erreur lors de la mise à jour de l'état");
  } finally {
    updatingId.value = null;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR');
};
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
            <th>Commande</th>
            <th>État Actuel</th>
            <th>Changer l'état</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cart in carts" :key="cart.id">
            <td>#{{ cart.id }}</td>
            <td>👤 Client #{{ cart.id_customer }}</td>
            
            <td>
              <span v-if="getOrderForCart(cart.id)" class="ref-badge">
                {{ getOrderForCart(cart.id).reference }}
              </span>
              <span v-else class="empty">-</span>
            </td>

            <td>
              <template v-if="getOrderForCart(cart.id)">
                <div class="state-indicator">
                  <span class="dot" :style="{ background: orderStates.find(s => String(s.id) === String(getOrderForCart(cart.id).current_state))?.color }"></span>
                  {{ orderStates.find(s => String(s.id) === String(getOrderForCart(cart.id).current_state))?.name }}
                </div>
              </template>
            </td>

            <td>
              <div v-if="getOrderForCart(cart.id)" class="action-cell">
                <select 
                  :disabled="updatingId === getOrderForCart(cart.id).id"
                  :value="getOrderForCart(cart.id).current_state"
                  @change="updateOrderStatus(getOrderForCart(cart.id).id, $event.target.value)"
                  class="state-select"
                >
                  <option v-for="state in orderStates" :key="state.id" :value="state.id">
                    {{ state.name }}
                  </option>
                </select>
                <span v-if="updatingId === getOrderForCart(cart.id).id" class="mini-loader">⌛</span>
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

.ref-badge { background: #e3f2fd; color: #1976d2; padding: 3px 7px; border-radius: 4px; font-weight: bold; font-family: monospace; }

.state-indicator { display: flex; align-items: center; gap: 8px; font-weight: 500; }
.dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); }

.state-select {
  padding: 5px;
  border-radius: 4px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 13px;
  width: 100%;
  max-width: 200px;
  cursor: pointer;
}

.state-select:disabled { opacity: 0.5; cursor: not-allowed; }

.action-cell { display: flex; align-items: center; gap: 10px; }
.mini-loader { font-size: 12px; }
.empty { color: #ccc; font-style: italic; }
</style>