<script setup>
import { ref, onMounted } from 'vue';
import cartsService from '@/service/cartsService';
import ordersService from '@/service/ordersService';

const items = ref([]); // Contiendra le mélange paniers / commandes
const orderStates = ref([]);
const loading = ref(true);

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

onMounted(async () => {
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

    // 2. On crée la liste finale
    items.value = customerCarts.map(cart => {
      // On cherche si une commande est liée à ce panier
      const linkedOrder = allOrders.find(o => String(o.id_cart) === String(cart.id));
      
      return {
        cartId: cart.id,
        date: cart.date_add,
        order: linkedOrder || null, // null si pas de commande = "Panier en cours"
      };
    }).sort((a, b) => b.cartId - a.cartId); // Plus récent en haut

  } catch (error) {
    console.error("Erreur sync client:", error);
  } finally {
    loading.value = false;
  }
});

const getState = (stateId) => {
  return orderStates.value.find(s => String(s.id) === String(stateId)) || { name: 'Inconnu', color: '#999' };
};
</script>
<template>
  <div class="my-account">
    <h2>Mes Activités (Paniers & Commandes)</h2>

    <div v-if="loading" class="msg">Chargement...</div>

    <div v-else class="simple-list">
      <div v-for="item in items" :key="item.cartId" class="list-row">
        
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
        </div>

        <div class="col-price">
          {{ item.order ? parseFloat(item.order.total_paid).toFixed(2) + ' €' : '---' }}
        </div>

      </div>
    </div>
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

.col-main { width: 120px; display: flex; flex-direction: column; }
.id-tag { font-weight: bold; color: #666; font-size: 0.9rem; }
.date { font-size: 0.8rem; color: #999; }

.col-info { flex-grow: 1; display: flex; align-items: center; gap: 10px; }
.order-ref { font-family: monospace; font-weight: bold; background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }

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
</style>