<script setup>
  import { ref, computed, onMounted } from 'vue';
  import ordersService from '@/service/ordersService';

  const orders = ref([]);
  const loading = ref(true);

  onMounted(async () => {
    try {
      orders.value = await ordersService.getOrders();
    } catch (error) {
      console.error("Erreur dashboard:", error);
    } finally {
      loading.value = false;
    }
  });

  // CALCUL : Chiffre d'affaires total
  //boucle qui additionne le total_paid de chaque commande, puis arrondi à 2 décimales
  //depart sum=0, pour chaque order dans orders.value, sum = sum + total_paid de l'order
  const totalRevenue = computed(() => {
    return orders.value
      .reduce((sum, order) => sum + parseFloat(order.total_paid), 0)
      .toFixed(2);
  });

  // CALCUL : Groupement par jour
  const dailyStats = computed(() => {
    const groups = {};

    orders.value.forEach(order => {
      // On extrait juste la date (YYYY-MM-DD) de date_add
      const date = order.date_add.split(' ')[0];
      //recherche dans groups si la date existe déjà, sinon on crée une nouvelle entrée avec count=0 et total=0
      if (!groups[date]) {
        groups[date] = { date: date, count: 0, total: 0 };
      }
      // On ajoute +1 au compteur et le montant au total du jour
      groups[date].count += 1;
      groups[date].total += parseFloat(order.total_paid);
    });

    // Convertir l'objet en tableau et trier par date décroissante
    return Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
  });


  // Formatage de la date d'ajout "2026-05-14 22:15:03" en "jeu. 14 mai"
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
          <span class="value">{{ totalRevenue }} €</span>
        </div>
      </div>

      <div class="card total-orders">
        <div class="card-info">
          <span class="label">Commandes Totales</span>
          <span class="value">{{ orders.length }}</span>
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
          <span>Montant</span>
        </div>
        
        <div v-for="day in dailyStats" :key="day.date" class="stats-row">
          <div class="col-date">{{ formatDate(day.date) }}</div>
          <div class="col-count">
            <span class="count-badge">{{ day.count }}</span>
          </div>
          <div class="col-amount">{{ day.total.toFixed(2) }} €</div>
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
.label { display: block; color: #7f8c8d; font-size: 0.9rem; }
.value { font-size: 1.5rem; font-weight: bold; color: #2c3e50; }

.total-sales { border-left: 5px solid #2ecc71; }
.total-orders { border-left: 5px solid #3498db; }

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
.col-amount { flex: 1; text-align: right; font-weight: bold; color: #2ecc71; }

.count-badge {
  background: #ebf5fb;
  color: #3498db;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.loading { text-align: center; padding: 40px; color: #666; }
</style>