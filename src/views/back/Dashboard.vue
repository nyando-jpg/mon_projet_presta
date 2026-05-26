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

    <div class="kpi-panel">
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
            <div class="price-row">
              <div class="price-item single-metric">
                <span class="price-value">{{ orders.length }}</span>
                <span class="price-type">Commandes</span>
              </div>
            </div>
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
            <div class="price-row">
              <div class="price-item single-metric">
                <span class="price-value">{{ paidOrdersCount }}</span>
                <span class="price-type">Payées</span>
              </div>
            </div>
          </div>
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
.dashboard {
  padding: 24px;
  background: linear-gradient(180deg, #d7e6ee 0%, #c6dce7 100%);
  min-height: 100vh;
  border-radius: 14px;
  border: 1px solid rgba(30, 72, 90, 0.16);
}

.dashboard h1 {
  color: #1f4a5f;
  padding-bottom: 12px;
  margin-bottom: 26px;
  font-size: clamp(1.5rem, 2vw, 2.1rem);
  letter-spacing: 0.4px;
}

.dashboard h2 {
  color: #26596f;
  margin-bottom: 12px;
}

/* Styles des cartes */
.kpi-panel {
  background: #eaf2f6;
  border: 1px solid rgba(39, 90, 111, 0.14);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 30px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 14px;
}

.card {
  background: #f7fbfd;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(39, 90, 111, 0.16);
  box-shadow: 0 2px 8px rgba(18, 53, 68, 0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-info {
  width: 100%;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(18, 53, 68, 0.12);
}

.card-icon { font-size: 2.5rem; }
.label {
  display: block;
  color: #4d6a77;
  font-size: 0.82rem;
  margin-bottom: 7px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.value { font-size: 1.4rem; font-weight: 700; color: #224e63; }

/* Affichage des prix TTC et HT côte à côte */
.price-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.price-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.single-metric {
  min-width: 120px;
}

.price-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e4b60;
}

.price-type {
  font-size: 0.68rem;
  color: #627c88;
  text-transform: uppercase;
}

.total-sales,
.total-orders,
.paid-sales,
.paid-orders {
  border-left: 1px solid rgba(39, 90, 111, 0.16);
}

/* Styles du tableau journalier */
.stats-section {
  background: #edf5f9;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid rgba(39, 90, 111, 0.15);
  box-shadow: 0 8px 20px rgba(20, 56, 70, 0.08);
}

.daily-stats-container { margin-top: 20px; }

.stats-header, .stats-row {
  display: flex;
  padding: 13px 14px;
  border-bottom: 1px solid #d7e6ee;
}

.stats-header {
  font-weight: 600;
  color: #eff8fc;
  background: linear-gradient(180deg, #2d6178 0%, #3c7690 100%);
  text-transform: uppercase;
  font-size: 0.8rem;
  border-radius: 10px 10px 0 0;
}

.stats-row {
  transition: background 0.2s;
  background: rgba(255, 255, 255, 0.55);
}

.stats-row:hover {
  background: rgba(255, 255, 255, 0.86);
}

.col-date { flex: 2; font-weight: 500; color: #2c3e50; }
.col-count { flex: 1; text-align: center; }
.col-amount { flex: 1.2; text-align: right; font-weight: 700; color: #23353c; }

.col-amount.paid {
  color: #22556e;
}

.ttc-label { 
  font-size: 0.7rem; 
  color: #95a5a6; 
  font-weight: normal; 
  margin-left: 4px; 
}

.count-badge {
  background: linear-gradient(180deg, #2e6077 0%, #3f7d97 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
}

.loading { text-align: center; padding: 40px; color: #2d6178; font-weight: 600; }

@media (max-width: 1200px) {
  .summary-cards {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

@media (max-width: 680px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }

  .stats-header,
  .stats-row {
    font-size: 0.78rem;
    padding: 10px 8px;
  }
}
</style>