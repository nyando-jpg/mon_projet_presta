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

      <div class="layout backend-layout">
        <nav class="sidebar backend-sidebar">
          <div class="sidebar-nav">
            <RouterLink to="/backend/reset">🔄 Reset</RouterLink>
            <RouterLink to="/backend/import">🔄 Import</RouterLink>
            <RouterLink to="/backend/dashboard">📊 Dashboard</RouterLink>
            <RouterLink to="/backend/liste-commandes">📦 Liste Commandes</RouterLink>
            <RouterLink to="/backend/liste-paniers">� Liste Paniers Complet</RouterLink>
            <RouterLink to="/backend/stocks">📦 Ajout/Supression Stocks</RouterLink>
            <RouterLink to="/backend/synthese-stocks">📊 Tableau Synthèse stocks</RouterLink>
            <RouterLink to="/backend/marges-produits">💰 Marges produits (achat/ventes/benefice)</RouterLink>
            <RouterLink to="/backend/historique-mouvements">📜 Mouvements de stocks</RouterLink>
          </div>
          <div class="sidebar-footer">
            <hr />
            <RouterLink to="/frontend/liste-produits">🌐 Voir le site</RouterLink>
          </div>
        </nav>
        <main class="content backend-content"><RouterView /></main>
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
        <nav class="sidebar frontend-sidebar">
          <div class="sidebar-nav">
            <RouterLink to="/frontend/liste-produits">🛍️ Produits</RouterLink>
            <RouterLink to="/frontend/mes-commandes">📋 Mes Commandes</RouterLink>
            <RouterLink to="/frontend/remove-stock">📋 Remove stock</RouterLink>
          </div>
          <div class="sidebar-footer">
            <hr v-if="currentCustomer" />
            <RouterLink to="/backend/dashboard">⚙️ Admin</RouterLink>
          </div>
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

:root {
  --theme-primary: #4E8EA2;
  --theme-primary-dark: #2f5d74;
  --theme-primary-deep: #244d61;
  --theme-soft: #c8dde8;
}

.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(180deg, #b8cfdb 0%, #a6c2d1 100%);
}

.layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.backend-layout {
  gap: 16px;
  padding: 14px;
}

.header { 
  display: flex; justify-content: space-between; align-items: center; 
  padding: 15px 25px;
  border-bottom: 2px solid rgba(36, 77, 97, 0.25);
  background: linear-gradient(180deg, #d4e4ec 0%, #c4d9e5 100%);
}
.header h1 { color: #21495c; margin: 0; letter-spacing: 0.5px; }
.header-right { display: flex; gap: 15px; align-items: center; }

.header-btn {
  text-decoration: none;
  padding: 8px 14px;
  border: 1px solid rgba(47, 93, 116, 0.45);
  border-radius: 999px;
  color: #21495c;
  background: #eaf2f6;
  cursor: pointer;
  transition: all 0.25s;
  font-weight: 600;
}

.header-btn:hover {
  background: var(--theme-primary);
  color: #fff;
  border-color: var(--theme-primary);
}

.sidebar { 
  width: 222px; 
  display: flex; 
  flex-direction: column; 
  gap: 8px;
  padding: 18px 14px;
  min-height: 0; /* allow inner scrolling when parent restricts height */
}

.backend-sidebar {
  background: linear-gradient(180deg, #2f5d74 0%, #244d61 100%);
  border-radius: 16px;
  box-shadow: 0 18px 32px rgba(20, 45, 57, 0.28);
}

.sidebar a { 
  text-decoration: none; 
  color: #ecf7fb; 
  padding: 10px 12px;
  border-radius: 10px;
  transition: all 0.25s;
  font-weight: 500;
  border: 1px solid transparent;
}

.backend-sidebar a:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.22);
}

.sidebar hr {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  margin: 10px 0;
}

.backend-sidebar .router-link-active {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.35);
  color: #ffffff !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.frontend-sidebar {
  background: #f6fbfd;
  border-right: 1px solid #cfe1e9;
}

/* Make the nav area scrollable and pin footer to bottom */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  min-height: 0;
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.frontend-sidebar a {
  color: #2f5d74;
}

.frontend-sidebar a:hover {
  background: #e5f1f6;
}

.frontend-sidebar .router-link-active {
  background: #d1e6ef !important;
  color: #21495c !important;
}

.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #f5f7f9;
}

.backend-content {
  background: linear-gradient(180deg, #d6e5ed 0%, #c9dbe6 100%);
  border-radius: 18px;
  padding: 22px;
  border: 1px solid rgba(36, 77, 97, 0.15);
}

.full-page { height: 100vh; }

.backend-style {
  background: linear-gradient(180deg, #c3d8e3 0%, #b0c9d7 100%);
  color: #163848;
}

@media (max-width: 900px) {
  .backend-layout {
    gap: 10px;
    padding: 10px;
  }

  .sidebar {
    width: 190px;
  }
}
</style>