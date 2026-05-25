<script setup>
import { ref, onMounted, watch } from 'vue'; // Ajout de watch
import { useRouter } from 'vue-router';
import customersService from '@/service/customersService';
import cartsService from '@/service/cartsService';
import ordersService from '@/service/ordersService';
import { setActiveCartId } from '@/utils/cartStorage';

const router = useRouter();
const customers = ref([]);
const loading = ref(true);

// État du filtre : 'vrais' ou 'invités'
const filterMode = ref('vrais'); 

// Fonction unique pour charger les données
const loadData = async () => {
  loading.value = true;
  try {
    if (filterMode.value === 'vrais') {
      customers.value = await customersService.getTrueCustomers();
    } else {
      customers.value = await customersService.getGuests();
    }
  } catch (error) {
    alert("Erreur lors de la récupération des données");
    console.error(error);
  } finally {
    loading.value = false;
  }
};

// On charge au montage
onMounted(loadData);

// On recharge automatiquement quand filterMode change
watch(filterMode, loadData);

const resolveOpenCartIdForCustomer = async (customerId) => {
  const [carts, orders] = await Promise.all([
    cartsService.getCarts(),
    ordersService.getOrdersByCustomer(customerId)
  ]);

  const customerCarts = (carts || [])
    .filter((cart) => String(cart.id_customer) === String(customerId))
    .sort((a, b) => {
      const dateA = new Date(a.date_add || 0).getTime();
      const dateB = new Date(b.date_add || 0).getTime();

      if (dateA !== dateB) return dateB - dateA;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  const openCart = customerCarts.find((cart) => {
    return !(orders || []).some((order) => String(order.id_cart) === String(cart.id));
  });

  return openCart?.id || '';
};

const selectCustomer = async (user) => {
  localStorage.setItem('customer', JSON.stringify(user));

  try {
    const openCartId = await resolveOpenCartIdForCustomer(user.id);
    if (openCartId) {
      setActiveCartId(openCartId);
    } else {
      setActiveCartId('');
      localStorage.removeItem('active_cart_id_guest');
      localStorage.removeItem('active_cart_id');
    }
  } catch (error) {
    console.warn('Impossible de retrouver le panier du client:', error);
  }

  //appelle  dans App.vue le chargement du customer depuis localStorage
  window.dispatchEvent(new CustomEvent('customer-update'));
  router.push('/frontend/liste-produits');
};

// Formatage de la date d'inscription "2026-05-14 22:15:03" en ["2026-05-14", 0]
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  return dateStr.split(' ')[0];
};
</script>

<template>
  <div class="customers-page">
    <div class="header-section">
      <h1>Liste des {{ filterMode === 'vrais' ? 'Clients' : 'Invités' }}</h1>
      <span class="badge">{{ customers.length }}</span>
    </div>

    <div class="quick-actions">
      <RouterLink to="/frontend/create-customer" class="action-btn create-btn">
        ✨ Créer un nouveau compte
      </RouterLink>
      <RouterLink to="/frontend/liste-produits" class="action-btn anonymous-btn">
        👻 Rester anonyme (Continuer sans login)
      </RouterLink>
    </div>

    <div class="filter-tabs">
      <button 
        :class="{ active: filterMode === 'vrais' }" 
        @click="filterMode = 'vrais'"
      >
        👥 Clients (getTrue)
      </button>
      <button 
        :class="{ active: filterMode === 'invités' }" 
        @click="filterMode = 'invités'"
      >
        👤 Invités (getGuests)
      </button>
      <RouterLink to="/login" class="action-btn anonymous-btn">
        Aller a l'espace admin
      </RouterLink>
      
    </div>

    <div v-if="loading" class="loading">Chargement des données via API...</div>

    <div v-else class="customers-list">
      <div 
        v-for="user in customers" :key="user.id" 
        class="customer-card" :class="{ 'guest-mode': filterMode === 'invités' }"
        @click="selectCustomer(user)"
      >
        <div class="col id">#{{ user.id }}</div>
        <div class="col name">
          <strong>{{ user.firstname }} <span class="uppercase">{{ user.lastname }}</span></strong>
        </div>
        <div class="col email">{{ user.email }}</div>
        <div class="col date">
          Inscrit le : {{ formatDate(user.date_add) }}
        </div>
        <div class="col arrow">→</div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.customers-page {
  padding: 20px;
  background-color: #f5f7f9;
  min-height: 100vh;
}

.header-section {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

.badge {
  background: #42b983;
  color: white;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.9em;
  font-weight: bold;
}

/* Structure en lignes horizontales (Div) */
.customers-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.customer-card {
  display: flex;
  align-items: center;
  background: white;
  padding: 15px 20px;
  border-radius: 8px;
  border: 1px solid #ddd;
  transition: all 0.2s ease;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.customer-card:hover {
  border-color: #42b983;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
  background-color: #f0fff4;
}

/* Gestion des colonnes */
.col {
  flex: 1;
  font-size: 14px;
  color: #334e68;
}

.col.id {
  flex: 0 0 60px;
  font-weight: bold;
  color: #95a5a6;
}

.col.name {
  flex: 1.5;
}

.col.email {
  flex: 2;
  color: #7f8c8d;
}

.col.date {
  text-align: right;
  font-size: 12px;
  color: #95a5a6;
}

.col.arrow {
  flex: 0 0 40px;
  text-align: right;
  font-weight: bold;
  color: #42b983;
  font-size: 18px;
}

.uppercase {
  text-transform: uppercase;
}

.loading {
  text-align: center;
  padding: 50px;
  font-style: italic;
  color: #666;
}

/* Section des actions rapides (Créer / Anonyme) */
.quick-actions {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
}

.action-btn {
  flex: 1;
  text-align: center;
  padding: 12px;
  text-decoration: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 14px;
  transition: opacity 0.2s;
}

.create-btn {
  background-color: #42b983;
  color: white;
}

.anonymous-btn {
  background-color: #334e68;
  color: white;
}

.action-btn:hover {
  opacity: 0.9;
}

.separator {
  border: 0;
  border-top: 1px solid #ddd;
  margin: 25px 0;
}

.section-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
}

/* Onglets de filtrage */
.filter-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filter-tabs button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 6px;
  font-weight: bold;
  color: #666;
}

.filter-tabs button.active {
  background-color: #e8f5e9;
  border-color: #42b983;
  color: #42b983;
}

.guest-mode {
  border-left: 4px solid #f1c40f !important;
}
</style>