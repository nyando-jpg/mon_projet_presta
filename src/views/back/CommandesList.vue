<script setup>
import { ref, onMounted } from 'vue';
import ordersService from '@/service/ordersService';
import cartsService from '@/service/cartsService';
import customersService from '@/service/customersService';
import { enrichCartSummary, formatCustomerName } from '@/utils/orderMetrics';

const orders = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const [ordersData, cartsData, customersData] = await Promise.all([
      ordersService.getOrders(),
      cartsService.getCarts(),
      customersService.getCustomers()
    ]);

    const cartsById = Object.fromEntries((cartsData || []).map((cart) => [String(cart.id), cart]));
    const customersById = Object.fromEntries((customersData || []).map((customer) => [String(customer.id), customer]));

    orders.value = await Promise.all((ordersData || []).map(async (order) => {
      const cart = cartsById[String(order.id_cart)] || null;
      const customer = customersById[String(order.id_customer)] || null;
      const cartSummary = cart ? await enrichCartSummary(cart) : {
        cartDate: order.date_add,
        itemCount: Array.isArray(order.products) ? order.products.reduce((sum, row) => sum + Number(row.quantity || row.product_quantity || 0), 0) : 0,
        totalTTC: Number(order.total_paid) || 0
      };

      return {
        ...order,
        customerName: formatCustomerName(customer),
        cartDate: cartSummary.cartDate || order.date_add,
        cartItemCount: cartSummary.itemCount,
        cartTotal: cartSummary.totalTTC || Number(order.total_paid) || 0
      };
    }));
  } catch (error) {
    alert("Erreur lors du chargement des commandes");
  } finally {
    loading.value = false;
  }
});

// Formatage de la date d'ajout "2026-05-14 22:15:03" en "14/05/2026"
// objet qui comprends annee, mois, jour
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR');
};

const formatPrice = (value) => {
  return `${Number(value || 0).toFixed(2)} €`;
};

const viewOrderDetails = (order) => {
  alert(`Détails de la commande ${order.reference}\nMéthode de paiement : ${order.payment}`);
};
</script>

<template>
  <div class="orders-page">
    <div class="header-section">
      <h1>Liste des Commandes</h1>
      <span class="badge">{{ orders.length }} commandes</span>
    </div>

    <div v-if="loading" class="loading">Récupération des commandes...</div>

    <div v-else class="orders-list">
      <div class="list-header">
        <div class="col-id">ID</div>
        <div class="col-ref">Référence</div>
        <div class="col-customer">Client</div>
        <div class="col-date">Date panier</div>
        <div class="col-count">Nb produits</div>
        <div class="col-total">Total panier</div>
      </div>

      <div 
        v-for="order in orders" 
        :key="order.id" 
        class="order-card"
        @click="viewOrderDetails(order)"
      >
        <div class="col-id">#{{ order.id }}</div>
        <div class="col-ref"><strong>{{ order.reference }}</strong></div>
        <div class="col-customer">👤 {{ order.customerName }}</div>
        <div class="col-date">{{ formatDate(order.cartDate) }}</div>
        <div class="col-count">{{ order.cartItemCount }}</div>
        <div class="col-total price">{{ formatPrice(order.cartTotal) }}</div>
        <div class="col-arrow">→</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orders-page { padding: 20px; background-color: #f5f7f9; min-height: 100vh; }

.header-section { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }

.badge { background: #3498db; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.9em; }

.orders-list { display: flex; flex-direction: column; gap: 12px; }

/* En-tête gris discret */
.list-header {
  display: flex;
  padding: 0 20px;
  font-size: 12px;
  color: #95a5a6;
  text-transform: uppercase;
  font-weight: bold;
}

.order-card {
  display: flex;
  align-items: center;
  background: white;
  padding: 18px 20px;
  border-radius: 10px;
  border: 1px solid #ddd;
  cursor: pointer;
  transition: all 0.2s ease;
}

.order-card:hover {
  border-color: #3498db;
  box-shadow: 0 4px 10px rgba(52, 152, 219, 0.15);
  transform: translateX(5px);
}

/* Colonnes */
.col-id { flex: 0 0 60px; color: #7f8c8d; }
.col-ref { flex: 1; color: #2c3e50; }
.col-customer { flex: 1.4; color: #34495e; }
.col-date { flex: 1; text-align: right; color: #95a5a6; padding-right: 20px; }
.col-count { flex: 0 0 110px; text-align: center; color: #34495e; }
.col-total { flex: 1; font-weight: bold; color: #2ecc71; text-align: right; }
.col-arrow { flex: 0 0 30px; color: #3498db; text-align: right; font-size: 18px; }

.price { font-size: 1.1em; }

.loading { text-align: center; padding: 50px; color: #666; font-style: italic; }

</style>
