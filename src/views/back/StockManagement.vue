<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';

const products = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const savingKey = ref('');
const draftQuantities = ref({});

const rowKey = (productId, stockId) => `${productId}:${stockId}`;

const ensureDraftsForProduct = (product) => {
  const baseRow = product.stockManagement?.productStock;

  if (baseRow?.stockId) {
    draftQuantities.value[rowKey(product.id, baseRow.stockId)] ??= 0;
  }

  for (const combination of product.stockManagement?.combinations || []) {
    if (combination?.stockId) {
      draftQuantities.value[rowKey(product.id, combination.stockId)] ??= 0;
    }
  }
};

const loadProducts = async () => {
  loading.value = true;
  error.value = '';

  try {
    const result = await produitsService.getProduits();
    const list = Array.isArray(result?.products) ? result.products : [];

    const enriched = await Promise.all(
      list.map(async (product) => {
        const stockManagement = await produitsService.getStockManagementRows(product);
        return { ...product, stockManagement };
      })
    );

    products.value = enriched;
    enriched.forEach(ensureDraftsForProduct);
  } catch (e) {
    console.error('Erreur chargement stocks:', e);
    error.value = 'Impossible de charger les produits et leurs stocks.';
  } finally {
    loading.value = false;
  }
};

const filteredProducts = computed(() => {
  const needle = search.value.trim().toLowerCase();

  if (!needle) return products.value;

  return products.value.filter((product) => {
    const haystack = [product.id, product.reference, product.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
});

const getEntryQuantity = (entry) => Number(entry?.quantity || 0);

const submitStockUpdate = async (product, entry) => {
  const key = rowKey(product.id, entry.stockId);
  const amount = Number(draftQuantities.value[key] || 0);

  if (!entry?.stockId || amount <= 0) return;

  savingKey.value = key;

  try {
    const newQuantity = getEntryQuantity(entry) + amount;
    await produitsService.updateStockQuantity(entry.stockId, newQuantity);
    draftQuantities.value[key] = 0;
    await loadProducts();
  } catch (e) {
    console.error('Erreur mise à jour stock:', e);
    error.value = 'La mise à jour du stock a échoué.';
  } finally {
    savingKey.value = '';
  }
};

onMounted(() => {
  loadProducts();
});
</script>
<template>
  <div>
    <header>
      <div>
        <small>Backend / Stock</small>
        <h1>Produits et combinaisons</h1>
        <p>Chaque ligne permet d’ajouter rapidement une quantité au stock correspondant.</p>
      </div>

      <div>
        <input v-model="search" type="text" placeholder="Rechercher un produit..." />
        <button @click="loadProducts" :disabled="loading">Rafraîchir</button>
      </div>
    </header>

    <div v-if="error">
      <strong>⚠️ {{ error }}</strong>
    </div>
    
    <div v-if="loading">Chargement des produits...</div>

    <main v-else>
      <article v-for="product in filteredProducts" :key="product.id">
        
        <section>
          <div>
            <small>#{{ product.id }} · {{ product.reference || 'Sans référence' }}</small>
            <h2>{{ product.name }}</h2>
          </div>

          <div>
            <small>STOCK TOTAL</small>
            <strong>{{ getEntryQuantity(product.stockManagement?.productStock) }}</strong>
          </div>
        </section>

        <ul>
          <li style="background: #f9f9f9; border-left: 3px solid #000;">
            <div>
              <strong>Stock principal</strong>
              <small>ID stock: {{ product.stockManagement?.productStock?.stockId || 'introuvable' }}</small>
            </div>

            <div>Actuel: {{ getEntryQuantity(product.stockManagement?.productStock) }}</div>

            <div>
              <input
                v-model.number="draftQuantities[rowKey(product.id, product.stockManagement?.productStock?.stockId)]"
                type="number"
                min="1"
                step="1"
                placeholder="+ quantité"
                :disabled="!product.stockManagement?.productStock?.stockId"
              />
              <button
                :disabled="!product.stockManagement?.productStock?.stockId || savingKey === rowKey(product.id, product.stockManagement?.productStock?.stockId)"
                @click="submitStockUpdate(product, product.stockManagement?.productStock)"
              >
                {{ savingKey === rowKey(product.id, product.stockManagement?.productStock?.stockId) ? 'En cours...' : 'Ajouter' }}
              </button>
            </div>
          </li>

          <p v-if="!product.stockManagement?.combinations?.length">
            Aucune combinaison disponible pour ce produit.
          </p>

          <li v-for="combination in product.stockManagement?.combinations || []" :key="combination.id">
            <div>
              <strong>Combinaison #{{ combination.id }}</strong>
              <span>{{ combination.label }}</span>
              <small>Impact prix: {{ combination.priceImpact.toFixed(2) }} €</small>
            </div>

            <div>Actuel: {{ getEntryQuantity(combination) }}</div>

            <div>
              <input
                v-model.number="draftQuantities[rowKey(product.id, combination.stockId)]"
                type="number"
                min="1"
                step="1"
                placeholder="+ quantité"
                :disabled="!combination.stockId"
              />
              <button
                :disabled="!combination.stockId || savingKey === rowKey(product.id, combination.stockId)"
                @click="submitStockUpdate(product, combination)"
              >
                {{ savingKey === rowKey(product.id, combination.stockId) ? 'En cours...' : 'Ajouter' }}
              </button>
            </div>
          </li>
        </ul>
      </article>

      <div v-if="!filteredProducts.length" style="text-align: center; padding: 40px; color: #999;">
        Aucun produit ne correspond à la recherche.
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Alignement et espacement de l'en-tête général */
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  padding-bottom: 25px;
  border-bottom: 1px solid #e5e5e5;
  margin-bottom: 35px;
}

header h1 {
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 5px 0;
}

header p {
  color: #666;
  font-size: 0.95rem;
  margin: 0;
}

header div:last-child {
  display: flex;
  gap: 12px;
}

/* Formulaires & Inputs modernes (Bordures fines, focus propre) */
input {
  padding: 10px 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  font-family: inherit;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #000;
}

/* Boutons épurés et interactifs */
button {
  padding: 10px 18px;
  border: 1px solid #000;
  border-radius: 6px;
  background: #000;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

button:hover {
  background: #222;
  border-color: #222;
}

button:disabled {
  background: #e5e5e5;
  border-color: #e5e5e5;
  color: #999;
  cursor: not-allowed;
}

/* Bouton secondaire (Rafraîchir) sélectionné par sa position dans le header */
header button {
  background: #fff;
  color: #000;
  border-color: #ccc;
}

header button:hover {
  background: #f9f9f9;
  border-color: #000;
}

/* Espacement de la liste principale */
main {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

/* Cartes produits blanches et épurées */
article {
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 25px;
}

/* Section titre / infos à l'intérieur de la carte */
article > section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

article > section h2 {
  margin: 4px 0 0 0;
  font-size: 1.3rem;
  font-weight: 600;
}

/* Badge de stock total à droite */
article > section > div:last-child {
  text-align: right;
  background: #f5f5f5;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
}

article > section > div:last-child strong {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.5px;
}

/* Listes de déclinaisons */
ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Lignes de tableau simulées */
li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
}

/* Conteneur d'informations à gauche dans la ligne */
li > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

li > div:first-child strong {
  font-size: 0.95rem;
}

li > div:first-child span {
  font-size: 0.9rem;
  color: #333;
}

/* Conteneur de saisie à droite dans la ligne */
li > div:last-child {
  display: flex;
  gap: 10px;
}

li > div:last-child input {
  width: 100px;
  text-align: center;
}

/* Textes secondaires (Méta, ID, Muted) */
small {
  font-size: 0.8rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

li > div:first-child small {
  text-transform: none;
  letter-spacing: normal;
}

/* Messages d'alerte */
p {
  margin: 5px 0 0 0;
  color: #666;
  font-size: 0.9rem;
}

/* Responsive fluide */
@media (max-width: 768px) {
  header, article > section, li {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  header div:last-child, li > div:last-child {
    width: 100%;
  }
  
  header div:last-child input, li > div:last-child input {
    flex: 1;
  }
  
  article > section > div:last-child {
    text-align: left;
  }
}
</style>