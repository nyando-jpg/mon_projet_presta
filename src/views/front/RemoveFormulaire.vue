<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import produitsService from '@/service/produitsService';
import stockService from '@/service/stockService';

const router = useRouter();
const categories = ref([]);
const nombre = ref('');
const categorieSelect = ref('');
const loading = ref(false);
const report = ref(null);
const produits = ref([]);
const detailsStock = ref([]);


onMounted(async () => {
  try {
    const cats = await produitsService.getCategories();
    categories.value = cats.filter(c => c.id > 2); 
  } catch (error) {
    console.error('Erreur chargement catégories:', error);
  }
});

const chargerProduits = async (catId) => {
  if (!catId) {
    produits.value = [];
    return;
  }
  try {
    const prods = await produitsService.getProduitsByCategory(catId);
    produits.value = prods;
  } catch (error) {
    console.error('Erreur chargement produits:', error);
    produits.value = [];
  }
};


const handleRemove = async () => {
  if (!nombre.value || !categorieSelect.value) {
    alert('Veuillez remplir tous les champs');
    return;
  }

  loading.value = true;
  report.value = null;
  detailsStock.value = [];

  try {
    const nb = parseInt(nombre.value, 10);
    const catId = categorieSelect.value;

  
    await chargerProduits(catId);
    const prodsInCategory = produits.value;

    if (prodsInCategory.length === 0) {
      alert('Aucun produit dans cette catégorie');
      loading.value = false;
      return;
    }

    let totalPrevu = 0;
    let totalRealise = 0;
    const details = [];

    
    for (const product of prodsInCategory) {
      const productId = product.id;
      let qtyEliminee = 0;

      
      const productFull = await produitsService.getProduitById(productId);
      if (!productFull) continue;

      
      const stockInfo = await stockService.getStockManagementRows(productFull);
      const { productStock, combinations } = stockInfo;
      
      const combinationStocks = (combinations || []).filter((stock) => stock && stock.stockId);
      const allStocks = combinationStocks.length > 0
        ? combinationStocks.map((stock) => ({ ...stock, isBase: false }))
        : (productStock && productStock.stockId ? [{ ...productStock, isBase: true }] : []);

      totalPrevu += nb * allStocks.length;
     
      for (const stock of allStocks) {
        if (!stock.stockId) continue;

        const currentStock = stock.quantity || 0;
        const reductionQty = Math.min(nb, currentStock);

        if (reductionQty > 0) {
          try {
            await stockService.updateStockQuantity(stock.stockId, currentStock - reductionQty);
            qtyEliminee += reductionQty;
          } catch (error) {
          }
        }
      }

      totalRealise += qtyEliminee;
      details.push({
        reference: productFull.reference,
        name: productFull.name,
        realise: qtyEliminee
      });
    }

    report.value = {
      totale: totalPrevu,
      realise: totalRealise,
      nombreProduits: prodsInCategory.length,
      nombreDemande: nb
    };

    detailsStock.value = details;
  } catch (error) {
    console.error('Erreur réduction stock:', error);
    alert('Erreur lors de la réduction du stock');
  } finally {
    loading.value = false;
  }
};


const onCategoryChange = () => {
  chargerProduits(categorieSelect.value);
};
</script>

<template>
  <div class="remove-container">
    <div class="remove-card">
      <h2>Réduction de Stock par Catégorie</h2>

      <form @submit.prevent="handleRemove">
        <div class="form-group">
          <label>Nombre à soustraire</label>
          <input 
            v-model="nombre" 
            type="number" 
            placeholder="ex: 7"
            min="0"
            required
          />
        </div>

        <div class="form-group">
          <label>Catégorie</label>
          <select v-model="categorieSelect" @change="onCategoryChange" class="filter-select" required>
            <option value="">-- Sélectionner une catégorie --</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
              {{ '—'.repeat(Math.max(0, parseInt(cat.level_depth) - 2)) }} {{ cat.name }}
            </option>
          </select>
        </div>

        <div v-if="produits.length > 0" class="produits-info">
          <p><strong>Produits trouvés:</strong> {{ produits.length }}</p>
        </div>

        <button type="submit" class="remove-btn" :disabled="loading">
          {{ loading ? 'En cours...' : 'Valider la réduction' }}
        </button>
      </form>

      <div v-if="report" class="report-section">
        <h3>Rapport de Réduction</h3>
        
        <div class="report-summary">
          <div class="report-card">
            <div class="report-label">Totale</div>
            <div class="report-value">{{ report.totale }}</div>
            <div class="report-detail">{{ report.nombreDemande }} × {{ report.nombreProduits }} produits</div>
          </div>

          <div class="report-card">
            <div class="report-label">Réalisé</div>
            <div class="report-value">{{ report.realise }}</div>
            <div class="report-detail">stock effectivement réduit</div>
          </div>

          <div class="report-card">
            <div class="report-label">Différence</div>
            <div class="report-value" :class="{ 'diff-warning': report.totale !== report.realise }">
              {{ report.totale - report.realise }}
            </div>
            <div class="report-detail">{{ report.totale - report.realise > 0 ? 'stock insuffisant' : 'ok' }}</div>
          </div>
        </div>

       
        <div class="details-table">
          <h4>Détails par produit</h4>
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Nom</th>
                <th>Quantité Réduite</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="detail in detailsStock" :key="detail.reference">
                <td>{{ detail.reference }}</td>
                <td>{{ detail.name }}</td>
                <td class="qty">{{ detail.realise }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button @click="report = null; detailsStock = []" class="reset-btn">
          Nouvelle réduction
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --theme-primary: #4E8EA2;
  --theme-primary-dark: #2f5d74;
  --theme-soft: #c8dde8;
}

.remove-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(180deg, #b8cfdb 0%, #a6c2d1 100%);
  font-family: 'Inter', sans-serif;
  padding: 20px;
}

.remove-card {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 600px;
}

h2 { 
  color: var(--theme-primary-dark);
  margin-bottom: 2rem;
  text-align: center;
  font-size: 1.8rem;
}

h3 {
  color: var(--theme-primary-dark);
  margin-top: 2rem;
  margin-bottom: 1.5rem;
  font-size: 1.3rem;
}

h4 {
  color: var(--theme-primary);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.6rem;
  color: var(--theme-primary-dark);
}

input,
select {
  width: 100%;
  padding: 0.9rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  transition: all 0.2s;
  box-sizing: border-box;
  font-family: 'Inter', sans-serif;
}

input:focus,
select:focus {
  outline: none;
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px rgba(78, 142, 162, 0.1);
}

.filter-select {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234E8EA2' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 0.8rem center;
  background-size: 1.2em 1.2em;
  padding-right: 2.5rem;
}

.produits-info {
  background: #e8f4f8;
  border-left: 4px solid var(--theme-primary);
  padding: 0.8rem 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  color: var(--theme-primary-dark);
  font-size: 0.9rem;
}

.remove-btn,
.reset-btn {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.remove-btn {
  background: linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-primary-dark) 100%);
  color: white;
  margin-bottom: 1.5rem;
}

.remove-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 142, 162, 0.3);
}

.remove-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reset-btn {
  background: #f0f2f5;
  color: var(--theme-primary-dark);
  border: 1px solid #ddd;
  margin-top: 1.5rem;
}

.reset-btn:hover {
  background: #e8eaed;
  border-color: var(--theme-primary);
}

/* Rapport */
.report-section {
  border-top: 2px solid #e8eaed;
  padding-top: 2rem;
}

.report-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.report-card {
  background: linear-gradient(135deg, #f5f9fb 0%, #e8f4f8 100%);
  border: 1px solid #d1e6ef;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
}

.report-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
}

.report-value {
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--theme-primary);
  margin-bottom: 0.5rem;
}

.report-value.diff-warning {
  color: #f59e0b;
}

.report-detail {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.5rem;
}

/* Tableau détails */
.details-table {
  margin-bottom: 1.5rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

thead {
  background: linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-primary-dark) 100%);
  color: white;
}

th {
  padding: 0.9rem;
  text-align: left;
  font-size: 0.9rem;
  font-weight: 600;
}

td {
  padding: 0.9rem;
  border-bottom: 1px solid #e8eaed;
  font-size: 0.9rem;
}

tbody tr:hover {
  background: #f9fafb;
}

td.qty {
  text-align: center;
  font-weight: 600;
  color: var(--theme-primary);
}

@media (max-width: 600px) {
  .remove-card {
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.4rem;
  }

  .report-summary {
    grid-template-columns: 1fr;
  }
}
</style>