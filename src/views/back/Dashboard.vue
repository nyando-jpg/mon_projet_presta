<script setup>
  import { ref, computed, onMounted } from 'vue';
  import ordersService from '@/service/ordersService';
  import cartsService from '@/service/cartsService';
  import { enrichCartSummary } from '@/utils/orderMetrics';

  //id qu'on prends pour les payes
  const PAID_STATE_IDS = new Set([2, 11, 5]);

  const orders = ref([]);
  const loading = ref(true);

  // Récupération des commandes à l'initialisation du composant
  onMounted(async () => {
    try {
      const ordersData = await ordersService.getOrders();
      const cartsData = await cartsService.getCarts();
      
      // Créer un mapping cart par ID pour recherche rapide
      const cartsById = Object.fromEntries((cartsData || []).map((cart) => [String(cart.id), cart]));
      
      // Enrichir chaque commande avec les totaux TTC/HT calculés correctement
      orders.value = await Promise.all(ordersData.map(async (order) => {
        const cart = cartsById[String(order.id_cart)] || null;
        let totalHT = Number(order.total_paid_tax_excl) || 0;
        let totalTTC = Number(order.total_paid) || 0;
        
        // Si le panier existe, utiliser les calculs enrichis (plus fiables)
        if (cart) {
          const summary = await enrichCartSummary(cart);
          totalHT = summary.totalHT || 0;
          totalTTC = summary.totalTTC || 0;
        }
        
        return {
          ...order,
          totalHT,
          totalTTC
        };
      }));
    } catch (error) {
      console.error("Erreur dashboard:", error);
    } finally {
      loading.value = false;
    }
  });

  // CALCUL : Chiffre d'affaires total TTC
  const totalRevenue = computed(() => {
    return orders.value
      .reduce((sum, order) => sum + (Number(order.totalTTC) || 0), 0)
      .toFixed(2);
  });

  // CALCUL : Chiffre d'affaires total HT
  const totalRevenueHT = computed(() => {
    return orders.value
      .reduce((sum, order) => sum + (Number(order.totalHT) || 0), 0)
      .toFixed(2);
  });

  // Filtre les Commandes payées (les commandes dont le current_state est dans PAID_STATE_IDS)
  const paidOrders = computed(() => {
    return orders.value.filter((order) => PAID_STATE_IDS.has(Number(order.current_state)));
  });

  // CALCUL : Chiffre d'affaires payé TTC (additionne le total_paid des commandes payées)
  const paidRevenue = computed(() => {
    return paidOrders.value
      .reduce((sum, order) => sum + (Number(order.totalTTC) || 0), 0)
      .toFixed(2);
  });

  // CALCUL : Chiffre d'affaires payé HT (additionne le totalHT des commandes payées)
  const paidRevenueHT = computed(() => {
    return paidOrders.value
      .reduce((sum, order) => sum + (Number(order.totalHT) || 0), 0)
      .toFixed(2);
  });

  // CALCUL : Nombre de Commandes payées
  const paidOrdersCount = computed(() => paidOrders.value.length);

  // CALCUL : Totaux payés par jour, calculés uniquement à partir des commandes payées
  const paidDailyStats = computed(() => {
    const groups = {};

    paidOrders.value.forEach((order) => {
      const date = order.date_add.split(' ')[0];

      if (!groups[date]) {
        groups[date] = { paidTTC: 0, paidHT: 0 };
      }

      groups[date].paidTTC += Number(order.totalTTC) || 0;
      groups[date].paidHT += Number(order.totalHT) || 0;
    });

    return groups;
  });

  // CALCUL : Groupement par jour des commandes (compte et total par jour, TTC et HT)
  const dailyStats = computed(() => {
    const groups = {};

    orders.value.forEach(order => {
      // On extrait juste la date (YYYY-MM-DD) de date_add
      const date = order.date_add.split(' ')[0];
      //recherche dans groups si la date existe déjà, sinon on crée une nouvelle entrée avec count=0 et totaux=0
      if (!groups[date]) {
          groups[date] = { date, count: 0, totalTTC: 0, totalHT: 0, totalTTCSansLivree: 0, totalHTSansLivree: 0, paidTTC: 0, paidHT: 0 };
        }
      // On ajoute +1 au compteur et les montants TTC et HT au total du jour
      groups[date].count += 1;
      const tTTC = Number(order.totalTTC) || 0;
      const tHT = Number(order.totalHT) || 0;
      groups[date].totalTTC += tTTC;
      groups[date].totalHT += tHT;
      // Ajouter au total "sans livré" uniquement si l'état n'est pas "livré" (id 5)
      if (Number(order.current_state) !== 5) {
        groups[date].totalTTCSansLivree += tTTC;
        groups[date].totalHTSansLivree += tHT;
      }
    });

    // Convertir l'objet en tableau et trier par date décroissante
    return Object.values(groups)
      .map((day) => ({
        ...day,
        paidTTC: paidDailyStats.value[day.date]?.paidTTC || 0,
        paidHT: paidDailyStats.value[day.date]?.paidHT || 0,
        // valeurs sans livré déjà calculées
        totalTTCSansLivree: day.totalTTCSansLivree || 0,
        totalHTSansLivree: day.totalHTSansLivree || 0
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });


  // Formatage de la date d'ajout pour affichage "2026-05-14 22:15:03" en "jeu. 14 mai"
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', { 
      weekday: 'short', day: 'numeric', month: 'long' 
    });
  };
</script>

<template>
  <div class="dashboard">
    <h1>Tableau de Bord</h1>

    <div class="summary-cards">
      <div class="card total-sales">
        <div class="card-info">
          <span class="label">Chiffre d'Affaires Total</span>
          <div class="price-row">
            <div class="price-item">
              <span class="price-value">{{ totalRevenue }} €</span>
              <span class="price-type">TTC</span>
            </div>
            <div class="price-item">
              <span class="price-value">{{ totalRevenueHT }} €</span>
              <span class="price-type">HT</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card total-orders">
        <div class="card-info">
          <span class="label">Commandes Totales</span>
          <span class="value">{{ orders.length }}</span>
        </div>
      </div>

      <div class="card paid-sales">
        <div class="card-info">
          <span class="label">Chiffre d'Affaires Payé</span>
          <div class="price-row">
            <div class="price-item">
              <span class="price-value">{{ paidRevenue }} €</span>
              <span class="price-type">TTC</span>
            </div>
            <div class="price-item">
              <span class="price-value">{{ paidRevenueHT }} €</span>
              <span class="price-type">HT</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card paid-orders">
        <div class="card-info">
          <span class="label">Commandes Payées</span>
          <span class="value">{{ paidOrdersCount }}</span>
        </div>
      </div>
    </div>

    <div class="stats-section">
      <h2>Activité par jour</h2>
      <div v-if="loading" class="loading">Calcul des statistiques...</div>
      
      <div v-else class="daily-stats-container">
        <div class="stats-header">
          <span class="col-date">Date</span>
          <span class="col-count">Commandes</span>
          <span class="col-amount">Total TTC</span>
          <span class="col-amount">Payé TTC</span>
          <span class="col-amount">Total HT</span>
          <span class="col-amount">Payé HT</span>
        </div>
        
        <div v-for="day in dailyStats" :key="day.date" class="stats-row">
          <div class="col-date">{{ formatDate(day.date) }}</div>
          <div class="col-count">
            <span class="count-badge">{{ day.count }}</span>
          </div>
          <div class="col-amount">{{ day.totalTTC.toFixed(2) }} €</div>
          <div class="col-amount paid">{{ day.paidTTC.toFixed(2) }} €</div>
          <div class="col-amount">{{ day.totalHT.toFixed(2) }} €</div>
          <div class="col-amount paid">{{ day.paidHT.toFixed(2) }} €</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { padding: 20px; background-color: #f4f7f6; min-height: 100vh; }

/* Styles des cartes */
.summary-cards {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
}

.card {
  flex: 1;
  background: white;
  padding: 20px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.card-icon { font-size: 2.5rem; }
.label { display: block; color: #7f8c8d; font-size: 0.9rem; margin-bottom: 8px; }
.value { font-size: 1.5rem; font-weight: bold; color: #2c3e50; }

/* Affichage des prix TTC et HT côte à côte */
.price-row {
  display: flex;
  gap: 15px;
  align-items: center;
}

.price-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.price-value {
  font-size: 1.3rem;
  font-weight: bold;
  color: #2c3e50;
}

.price-type {
  font-size: 0.7rem;
  color: #95a5a6;
  text-transform: uppercase;
}

.total-sales { border-left: 5px solid #2ecc71; }
.total-orders { border-left: 5px solid #3498db; }
.paid-sales { border-left: 5px solid #f39c12; }
.paid-orders { border-left: 5px solid #9b59b6; }

/* Styles du tableau journalier */
.stats-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.daily-stats-container { margin-top: 15px; }

.stats-header, .stats-row {
  display: flex;
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
}

.stats-header {
  font-weight: bold;
  color: #95a5a6;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.col-date { flex: 2; font-weight: 500; }
.col-count { flex: 1; text-align: center; }
.col-amount { flex: 1.2; text-align: right; font-weight: bold; color: #2ecc71; }

.col-amount.paid {
  color: #3498db;
}

.ttc-label { 
  font-size: 0.7rem; 
  color: #95a5a6; 
  font-weight: normal; 
  margin-left: 4px; 
}

.count-badge {
  background: #ebf5fb;
  color: #3498db;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.loading { text-align: center; padding: 40px; color: #666; }
</style>