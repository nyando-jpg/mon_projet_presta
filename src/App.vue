<script setup>
  import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
  import { onUnmounted, ref, onMounted, computed } from 'vue';

  const router = useRouter()
  const route = useRoute()
  const currentCustomer = ref(null)

  // Détection de la zone (Admin vs Boutique)
  const isBackend = computed(() => route.path.startsWith('/backend'))
  const isFrontend = computed(() => route.path.startsWith('/frontend'))

  //avoir le customer dans localStorage si non null
  const chargerCustomer = () => {
    const stored = localStorage.getItem('customer')
    try {
      currentCustomer.value = stored ? JSON.parse(stored) : null
    } catch (e) {
      currentCustomer.value = null
    }
  }

  //se deconnecter
  const logout = () => {
    localStorage.removeItem('customer')
    chargerCustomer()
    router.push('/')
  }

  // Charger seulement apres montage
  onMounted(() => {
    chargerCustomer()
    window.addEventListener('customer-update', chargerCustomer)
    window.addEventListener('storage', chargerCustomer)
  })

  // Nettoyer les écouteurs d'événements
  onUnmounted(() => {
    window.removeEventListener('customer-update', chargerCustomer)
    window.removeEventListener('storage', chargerCustomer)
  })
</script>

<template>
  <div class="app-wrapper">

    <template v-if="isBackend">
      <header class="header backend-style">
        <h1>PrestaShop <small>ADMIN</small></h1>
        <div class="header-right">
          <span v-if="currentCustomer">M. {{ currentCustomer.firstname }}</span>
          <button @click="logout" class="header-btn">🚪 Quitter</button>
        </div>
      </header>

      <div class="layout">
        <nav class="sidebar">
          <RouterLink to="/backend/reset">🔄 Reset</RouterLink>
          <RouterLink to="/backend/import">🔄 Import</RouterLink>
          <RouterLink to="/backend/dashboard">📊 Dashboard</RouterLink>
          <RouterLink to="/backend/liste-commandes">📦 Liste Commandes</RouterLink>
          <RouterLink to="/backend/liste-paniers">� Liste Paniers Complet</RouterLink>
          <RouterLink to="/backend/stocks">📦 Ajout/Supression Stocks</RouterLink>
          <RouterLink to="/backend/synthese-stocks">📊 Tableau Synthèse stocks</RouterLink>
          <RouterLink to="/backend/marges-produits">💰 Marges produits (achat/ventes/benefice)</RouterLink>
          <RouterLink to="/backend/historique-mouvements">📜 Mouvements de stocks</RouterLink>
          <hr />
          <RouterLink to="/frontend/liste-produits">🌐 Voir le site</RouterLink>
        </nav>
        <main class="content"><RouterView /></main>
      </div>
    </template>

    <template v-else-if="isFrontend">
      <header class="header">
        <h1>Boutique Presta</h1>
        <div class="header-right">
          <RouterLink to="/" class="header-btn">
            👤 {{ currentCustomer ? currentCustomer.firstname : 'Connexion' }}
          </RouterLink>
          
          <button v-if="currentCustomer" @click="logout" class="header-btn">❌</button>
          
          <RouterLink to="/frontend/panier" class="header-btn cart-btn">🛒 Panier</RouterLink>
        </div>
      </header>

      <div class="layout">
        <nav class="sidebar">
          <RouterLink to="/frontend/liste-produits">🛍️ Produits</RouterLink>
          <RouterLink to="/frontend/mes-commandes">📋 Mes Commandes</RouterLink>
          <hr v-if="currentCustomer" />
          <RouterLink to="/backend/dashboard">⚙️ Admin</RouterLink>
        </nav>
        <main class="content"><RouterView /></main>
      </div>
    </template>

    <template v-else>
      <div class="full-page"><RouterView /></div>
    </template>

  </div>
</template>

<style>
.app-wrapper { display: flex; flex-direction: column; height: 100vh; }
.layout { display: flex; flex: 1; overflow: hidden; }

.header { 
  display: flex; justify-content: space-between; align-items: center; 
  padding: 10px 20px; border-bottom: 1px solid #ddd; 
}
.header-right { display: flex; gap: 15px; align-items: center; }
.header-btn { text-decoration: none; padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; color: inherit; }

.sidebar { width: 180px; display: flex; flex-direction: column; gap: 10px; padding: 15px; border-right: 1px solid #ddd; }
.sidebar a { text-decoration: none; color: #333; }
.router-link-active { font-weight: bold; color: #007bff !important; }

.content { flex: 1; padding: 20px; overflow-y: auto; }
.full-page { height: 100vh; }
.backend-style { background: #333; color: #fff; }
</style>