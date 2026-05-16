import { createRouter, createWebHistory } from 'vue-router'
// import HomeView from '../views/HomeView.vue'
// import AboutView from '../views/AboutView.vue'


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    //frontend
    {
      path: '/',
      name: 'Home',
      component: () => import('../views/front/CustomersList.vue')
    },
    {
      path: '/frontend/liste-produits',
      name: 'liste-produits',
      component: () => import('../views/front/ProduitsList.vue'),
    },
    // {
    //   path: '/produits',
    //   name: 'produits',
    //   component: () => import('../views/Produits.vue'),
    // },
    // {
    //   path: '/produits-create',
    //   name: 'produits-create',
    //   component: () => import('../views/Produits-create.vue'),
    // },
    // {
    //   path: '/modifier/:id',
    //   name: 'ProduitsModifier',
    //   component: () => import('../views/Produits-modifier.vue'),
    // },
    {
      path: '/frontend/produits/:id',
      name: 'ProduitDetail',
      component: () => import('../views/front/ProduitsDetail.vue')
    },
    {
      path: '/frontend/panier',
      name: 'Panier',
      component: () => import('../views/front/Panier.vue')
    },
    {
      path: '/frontend/commande',
      name: 'Commande',
      component: () => import('../views/front/Commande.vue')
    },
    {
      path: '/frontend/customers',
      name: 'Customers',
      component: () => import('../views/front/CustomersList.vue')
    },
    {
      path: '/frontend/create-customer',
      name: 'CreateCustomer',
      component: () => import('../views/front/CustomerCreate.vue')
    },
    {
      path: '/frontend/mes-commandes',
      name: 'MesCommandes',
      component: () => import('../views/front/MesCommandes.vue')
    },


//backend
    {
      path: '/backend/dashboard',
      name: 'Dashboard',
      component: () => import('../views/back/Dashboard.vue')
    },
    {
      path: '/backend/liste-commandes',
      name: 'ListeCommandes',
      component: () => import('../views/back/CommandesList.vue')
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/back/Login.vue')
    },
    {
      path: '/backend/liste-paniers',
      name: 'ListePaniers',
      component: () => import('../views/back/PanierList.vue')
    },


        {
      path: '/backend/reset',
      name: 'reset',
      component: () => import('../views/back/ResetView.vue')
    },
        {
      path: '/backend/import',
      name: 'Import',
      component: () => import('../views/back/ImportView.vue')
    },
  ],
})

router.beforeEach((to) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated');

  // Si on essaie d'aller dans le back sans être connecté
  if (to.path.startsWith('/backend') && to.name !== 'Login' && !isAuthenticated) {
    // On RETOURNE l'objet de redirection au lieu d'appeler next()
    return { name: 'Login' };
  }

  // Si tout est ok, on ne retourne rien (ou true), ce qui autorise l'accès
});

export default router
