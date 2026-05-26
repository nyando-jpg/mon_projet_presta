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
.orders-page {
  padding: 22px;
  background: linear-gradient(180deg, #e6f0f4 0%, #d9eaf0 100%);
  min-height: 100vh;
}

.header-section { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }

.header-section h1 { color: #1f4a5f; margin: 0; font-size: 1.6rem; }

.badge {
  background: linear-gradient(180deg, #2e6077 0%, #3f7d97 100%);
  color: white;
  padding: 6px 14px;
  border-radius: 18px;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 6px 14px rgba(46,96,119,0.12);
}

.orders-list { display: flex; flex-direction: column; gap: 12px; }

.list-header {
  display: flex;
  padding: 10px 18px;
  font-size: 12px;
  color: #6f8b94;
  text-transform: uppercase;
  font-weight: 700;
  background: linear-gradient(180deg, rgba(46,96,119,0.08), rgba(46,96,119,0.03));
  border-radius: 10px;
  margin-bottom: 8px;
}

.order-card {
  display: flex;
  align-items: center;
  background: #f7fbfd;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid rgba(39,90,111,0.12);
  cursor: pointer;
  transition: all 0.18s ease;
}

.order-card:hover {
  border-color: rgba(46,96,119,0.28);
  box-shadow: 0 8px 20px rgba(26,58,71,0.08);
  transform: translateY(-4px);
}

/* Colonnes */
.col-id { flex: 0 0 70px; color: #6b8a93; font-weight: 600; }
.col-ref { flex: 1; color: #1f4a5f; font-weight: 700; }
.col-customer { flex: 1.4; color: #2c4852; }
.col-date { flex: 1; text-align: right; color: #6f8b94; padding-right: 20px; }
.col-count { flex: 0 0 110px; text-align: center; color: #2c4852; font-weight: 600; }
.col-total { flex: 1; font-weight: 800; color: #2f8f7f; text-align: right; }
.col-arrow { flex: 0 0 30px; color: #3f7d97; text-align: right; font-size: 18px; }

.price { font-size: 1.05em; }

.loading { text-align: center; padding: 50px; color: #2d6178; font-weight: 600; font-style: normal; }

/* Responsive tweaks */
@media (max-width: 900px) {
  .list-header { display: none; }
  .order-card { flex-wrap: wrap; gap: 8px; }
  .col-id { flex-basis: 30%; }
  .col-ref { flex-basis: 100%; }
  .col-customer { flex-basis: 100%; }
  .col-date, .col-total, .col-count { flex-basis: 50%; text-align: left; }
}

</style>
