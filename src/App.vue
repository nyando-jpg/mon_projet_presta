<script setup>
  import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router'
  import { onUnmounted, ref, onMounted, computed } from 'vue';

  const router = useRouter()
  const route = useRoute()
  const currentCustomer = ref(null)

  // Détection de la zone (Admin vs Boutique)
  const isBackend = computed(() => route.path.startsWith('/backend'))
  const isFrontend = computed(() => route.path.startsWith('/frontend'))

  // Avoir le customer dans localStorage si non null
  const chargerCustomer = () => {
    const stored = localStorage.getItem('customer')
    try {
      currentCustomer.value = stored ? JSON.parse(stored) : null
    } catch (e) {
      currentCustomer.value = null
    }
  }

  // Se deconnecter
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
  <div>

    <template v-if="isBackend">
      <header style="background: #000; color: #fff;">
        <h1>PrestaShop <small>ADMIN</small></h1>
        <div>
          <span v-if="currentCustomer">M. {{ currentCustomer.firstname }} </span>
          <button @click="logout">🚪 Quitter</button>
        </div>
      </header>

      <section>
        <nav>
          <RouterLink to="/backend/reset">🔄 Reset</RouterLink>
          <RouterLink to="/backend/import">🔄 Import</RouterLink>
          <RouterLink to="/backend/dashboard">📊 Dashboard</RouterLink>
          <RouterLink to="/backend/liste-commandes">📦 Liste Commandes</RouterLink>
          <RouterLink to="/backend/liste-paniers">🛒 Liste Paniers Complet</RouterLink>
          <RouterLink to="/backend/stocks">📦 Ajout/Supression Stocks</RouterLink>
          <RouterLink to="/backend/synthese-stocks">📊 Tableau Synthèse stocks</RouterLink>
          <RouterLink to="/backend/marges-produits">💰 Marges produits</RouterLink>
          <RouterLink to="/backend/historique-mouvements">📜 Mouvements de stocks</RouterLink>
          <hr />
          <RouterLink to="/frontend/liste-produits">🌐 Voir le site</RouterLink>
        </nav>
        <main><RouterView /></main>
      </section>
    </template>

    <template v-else-if="isFrontend">
      <header style="background: #f0f0f0; color: #000;">
        <h1>Boutique Presta</h1>
        <div>
          <RouterLink to="/">
            👤 {{ currentCustomer ? currentCustomer.firstname : 'Connexion' }}
          </RouterLink>
          <button v-if="currentCustomer" @click="logout">❌</button>
          <RouterLink to="/frontend/panier">🛒 Panier</RouterLink>
        </div>
      </header>

      <section>
        <nav>
          <RouterLink to="/frontend/liste-produits">🛍️ Produits</RouterLink>
          <RouterLink to="/frontend/mes-commandes">📋 Mes Commandes</RouterLink>
          <hr v-if="currentCustomer" />
          <RouterLink to="/backend/dashboard">⚙️ Admin</RouterLink>
        </nav>
        <main><RouterView /></main>
      </section>
    </template>

    <template v-else>
      <main><RouterView /></main>
    </template>

  </div>
</template>

<style scoped>
/* Structure Globale brute */
section {
  display: flex;
  min-height: calc(100vh - 70px);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  border-bottom: 1px solid #ccc;
}

header div {
  display: flex;
  align-items: center;
  gap: 15px;
}

/* Menu de navigation gauche */
nav {
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  background: #fdfdfd;
  border-right: 1px solid #ccc;
}

nav a, header a {
  text-decoration: none;
  color: inherit;
}

/* Liens actifs ou survolés */
.router-link-active {
  font-weight: bold;
  text-decoration: underline;
}

/* Zone de contenu principale */
main {
  flex: 1;
  padding: 20px;
  background: #fff;
  color: #000;
}

/* Éléments de formulaire et boutons génériques neutres */
button {
  background: #fff;
  color: #000;
  border: 1px solid #000;
  padding: 5px 10px;
  cursor: pointer;
}

button:hover {
  background: #eee;
}

hr {
  width: 100%;
  border: 0;
  border-top: 1px solid #ccc;
}
</style>