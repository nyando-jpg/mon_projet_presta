<script setup>
import { ref, onMounted } from 'vue';
import ordersService from '@/service/ordersService';

const orders = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    orders.value = await ordersService.getOrders();
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
        <div class="col-customer">Client ID</div>
        <div class="col-total">Total</div>
        <div class="col-date">Date</div>
      </div>

      <div 
        v-for="order in orders" 
        :key="order.id" 
        class="order-card"
        @click="viewOrderDetails(order)"
      >
        <div class="col-id">#{{ order.id }}</div>
        <div class="col-ref"><strong>{{ order.reference }}</strong></div>
        <div class="col-customer">👤 Client n°{{ order.id_customer }}</div>
        <div class="col-total price">{{ order.total_paid }} €</div>
        <div class="col-date">{{ formatDate(order.date_add) }}</div>
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
.col-customer { flex: 1; color: #34495e; }
.col-total { flex: 1; font-weight: bold; color: #2ecc71; text-align: right; }
.col-date { flex: 1; text-align: right; color: #95a5a6; padding-right: 20px; }
.col-arrow { flex: 0 0 30px; color: #3498db; text-align: right; font-size: 18px; }

.price { font-size: 1.1em; }

.loading { text-align: center; padding: 50px; color: #666; font-style: italic; }

</style>