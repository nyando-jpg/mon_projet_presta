<script setup>
import { ref, onMounted, computed } from 'vue';
import produitsService from '@/service/produitsService';
import taxesService from '@/service/taxesService';

const produits = ref(null);
const categories = ref([]);
const taxRatesByProductId = ref({});
const filtres = ref({
    nom: '',
    categorie: '',
    prixMin: 0,
    prixMax: 10000
});

const loadProductTaxes = async (products) => {
    const uniqueIds = [...new Set((products || []).map((product) => String(product.id)).filter(Boolean))];
    const entries = await Promise.all(
        uniqueIds.map(async (productId) => {
            const rate = await taxesService.getProductTaxRate(productId);
            return [productId, rate ?? 0];
        })
    );

    taxRatesByProductId.value = Object.fromEntries(entries);
};

const getPriceTTC = (priceHT, productId) => {
    const rate = taxRatesByProductId.value[String(productId)] ?? 0;
    return taxesService.calculatePriceTTC(priceHT, rate).toFixed(2);
};

const chargerDonnees = async () => {
    try {
        const [prodData, catData] = await Promise.all([
            produitsService.getProduits(),
            produitsService.getCategories()
        ]);

        produits.value = prodData;

        if (produits.value?.products?.length) {
            await loadProductTaxes(produits.value.products);
        }

        if (Array.isArray(catData)) {
            categories.value = catData.filter((category) => parseInt(category.id) > 2);
        }
    } catch (error) {
        console.error('Erreur globale :', error);
    }
};

const produitsFiltrés = computed(() => {
    if (!produits.value || !produits.value.products) return [];

    return produits.value.products.filter((product) => {
        const matchNom = product.name.toLowerCase().includes(filtres.value.nom.toLowerCase());
        const prix = parseFloat(product.price);
        const matchPrix = prix >= filtres.value.prixMin && prix <= filtres.value.prixMax;

        if (filtres.value.categorie === '') {
            return matchNom && matchPrix;
        }

        const idSelectionne = String(filtres.value.categorie);
        const matchCategorie = product.categories && product.categories.includes(idSelectionne);

        return matchNom && matchPrix && matchCategorie;
    });
});

onMounted(() => {
    chargerDonnees();
});

const getBadge = (dateAdd) => {
    if (!dateAdd) return null;

    const now = new Date();
    const dateProduit = new Date(dateAdd.replace(' ', 'T'));
    const diffInMs = now - dateProduit;
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInDays <= 1) return 'hot';
    if (diffInDays <= 7) return 'new';
    return null;
};
</script>

<template>
  <div>
    <h1>Voici la liste des produits</h1>

    <div class="search-box">
      <div class="filter-group">
        <label>Nom</label>
        <input v-model="filtres.nom" type="text" placeholder="Chercher un produit..." />
      </div>

      <div class="filter-group">
        <label>Prix min</label>
        <input v-model.number="filtres.prixMin" type="number" min="0" />
      </div>

      <div class="filter-group">
        <label>Prix max</label>
        <input v-model.number="filtres.prixMax" type="number" min="0" />
      </div>

      <div class="filter-group">
        <label>Catégorie</label>
        <select v-model="filtres.categorie" class="filter-select">
          <option value="">Toutes les catégories</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ '—'.repeat(Math.max(0, parseInt(cat.level_depth) - 2)) }} {{ cat.name }}
          </option>
        </select>
      </div>

      <button @click="filtres = { nom: '', categorie: '', prixMin: 0, prixMax: 10000 }" class="btn-reset">
        Réinitialiser
      </button>
    </div>

    <div v-if="produits" class="products-container">
      <div
        v-for="produit in produitsFiltrés"
        :key="produit.id"
        class="product-card"
        @click="$router.push(`/frontend/produits/${produit.id}`)"
      >
        <div v-if="getBadge(produit.date_add)" :class="['badge', getBadge(produit.date_add)]">
          {{ getBadge(produit.date_add).toUpperCase() }}
        </div>

        <div class="card-image">
          <img :src="produit.imageUrl || produit.galerie[0]" alt="Image produit" />
        </div>

        <div class="card-content">
          <span class="product-id">#{{ produit.id }}</span>
          <h3>{{ produit.name }}</h3>
          <p class="product-price price-ht">HT: {{ produit.price }} €</p>
          <p class="product-price price-ttc">TTC: {{ getPriceTTC(produit.price, produit.id) }} €</p>
        </div>
      </div>

      <div v-if="produitsFiltrés.length === 0" class="no-results">
        Aucun produit ne correspond à votre recherche
      </div>
    </div>

    <div v-else>Chargement...</div>
  </div>
</template>

<style scoped>
.search-box {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filter-group label {
  font-weight: bold;
  font-size: 0.85em;
  color: #666;
}

.filter-group input,
.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
}

.btn-reset {
  padding: 9px 15px;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-reset:hover {
  background: #c0392b;
}

.products-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 25px;
  padding-bottom: 40px;
}

.product-card {
  background: #fff;
  border-radius: 15px;
  overflow: hidden;
  position: relative;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border: 1px solid #f0f0f0;
  cursor: pointer;
}

.product-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.1);
}

.card-image img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  display: block;
}

.badge {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 900;
  color: white;
  letter-spacing: 0.5px;
}

.badge.hot {
  background: #e74c3c;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.4);
}

.badge.new {
  background: #3498db;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.4);
}

.card-content {
  padding: 15px;
  text-align: left;
}

.product-id {
  font-size: 0.75em;
  color: #bdc3c7;
  display: block;
}

h3 {
  margin: 5px 0;
  font-size: 1.1rem;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-price {
  margin-top: 6px;
  font-size: 1rem;
  font-weight: 800;
}

.price-ht {
  color: #7f8c8d;
}

.price-ttc {
  color: #2ecc71;
}

.no-results {
  grid-column: 1 / -1;
  text-align: center;
  padding: 50px;
  color: #95a5a6;
}
</style>
