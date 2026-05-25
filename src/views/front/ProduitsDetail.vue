<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import produitsService from '@/service/produitsService';
import taxesService from '@/service/taxesService';
import cartsService from '@/service/cartsService';
import { getActiveCartId, getCurrentCustomerId, setActiveCartId } from '@/utils/cartStorage';

const route = useRoute();
const router = useRouter();
const produit = ref(null);
const loading = ref(true);

const quantite = ref(1);
const optionGroups = ref([]);
const selectedOptions = ref({});
const combinationId = ref(null);
const displayPrice = ref(null);
const taxRate = ref(null);
const stockQuantity = ref(null);
const panier = ref([]);
const showSuccessModal = ref(false);
const showStockWarningModal = ref(false);
const pendingAddToCart = ref(false);
const lastAddedItem = ref(null);

const resolveStockRowForCurrentSelection = () => {
    const stockRows = Array.isArray(produit.value?.stockAvailables) ? produit.value.stockAvailables : [];

    if (!stockRows.length) {
        return null;
    }

    if (!optionGroups.value.length) {
        return stockRows.find((stock) => String(stock.id_product_attribute || '') === '0') || stockRows[0] || null;
    }

    if (!combinationId.value) {
        return null;
    }

    return stockRows.find((stock) => String(stock.id_product_attribute || '') === String(combinationId.value)) || null;
};

const loadStockQuantity = async () => {
    if (!produit.value) {
        stockQuantity.value = null;
        return;
    }

    const stockRow = resolveStockRowForCurrentSelection();

    if (!stockRow?.id) {
        stockQuantity.value = Number(produit.value.stockQuantity ?? produit.value.quantity ?? 0);
        return;
    }

    try {
        const stock = await produitsService.getStockQuantity(stockRow.id);
        stockQuantity.value = Number(stock?.quantity ?? 0);
    } catch (error) {
        stockQuantity.value = Number(produit.value.stockQuantity ?? produit.value.quantity ?? 0);
    }
};


// Fonction pour charger la combinaison correspondante aux options sélectionnées
const loadCombination = async () => {
    if (!produit.value) return;

    // Produit simple (sans déclinaison): on autorise l'ajout direct avec attribute=0.
    if (!optionGroups.value.length) {
        combinationId.value = '0';
        displayPrice.value = parseFloat(produit.value.price || 0).toFixed(2);
        await loadStockQuantity();
        return;
    }

    const selectedValueIds = Object.values(selectedOptions.value).filter(Boolean);
    
    if (selectedValueIds.length === 0) {
        combinationId.value = null;
        displayPrice.value = null;
        return;
    }

    const result = await produitsService.findCombinationBySelectedValues(
        produit.value,
        selectedValueIds
    );
    
    if (result) {
        combinationId.value = result.combinationId;
        const basePrice = parseFloat(produit.value.price || 0);
        const combinationImpact = parseFloat(result.price || 0);
        const finalPrice = Number.isFinite(basePrice) ? basePrice + (Number.isFinite(combinationImpact) ? combinationImpact : 0) : 0;
        displayPrice.value = finalPrice.toFixed(2);
        await loadStockQuantity();
    } else {
        combinationId.value = null;
        displayPrice.value = null;
        stockQuantity.value = null;
    }
};

const currentPriceHT = computed(() => {
    const price = displayPrice.value ?? produit.value?.price ?? 0;
    return parseFloat(price || 0).toFixed(2);
});

const currentPriceTTC = computed(() => {
    const rawPrice = displayPrice.value ?? produit.value?.price ?? 0;
    return taxesService.calculatePriceTTC(rawPrice, taxRate.value ?? 0).toFixed(2);
});

const hasEnoughStock = computed(() => {
    const availableStock = Number(stockQuantity.value ?? produit.value?.quantity ?? 0);
    const wantedQuantity = Number(quantite.value || 0);

    if (!Number.isFinite(availableStock) || !Number.isFinite(wantedQuantity)) {
        return true;
    }

    return wantedQuantity <= availableStock;
});

onMounted(async () => {
    try {
        const prodData = await produitsService.getProduitById(route.params.id);
        
        // On gère le déballage de l'objet si nécessaire
        produit.value = prodData.product ? prodData.product : prodData;

        taxRate.value = await taxesService.getProductTaxRate(produit.value.id);

        // Configuration des options
        optionGroups.value = await produitsService.getOptionsGroupedByProductOption(produit.value);
        optionGroups.value.forEach((group) => {
            if (group.values?.length > 0) {
                selectedOptions.value[group.id] = group.values[0].id;
            }
        });

        await loadCombination();
    } catch (error) {
        console.error("Erreur chargement détail :", error);
    } finally {
        loading.value = false;
    }
});

const ajouterAuPanier = async () => {
    // combinationId='0' est valide pour les produits simples.
    if (combinationId.value === null || combinationId.value === undefined || combinationId.value === '') return;

    const existingCartId = getActiveCartId();
    const currentCustomerId = getCurrentCustomerId();

    const payload = {
        id_product: produit.value.id,
        id_product_attribute: combinationId.value || '0',
        quantity: quantite.value,
        id_customer: currentCustomerId || '0',
        id_cart: existingCartId
    };

    try {
        const updatedCart = await cartsService.addToCart(payload);

        if (updatedCart?.id) {
            setActiveCartId(updatedCart.id);

            try {
                const serverCart = await cartsService.getCart(updatedCart.id);
                const rows = serverCart?.associations?.cart_rows?.cart_row || [];

                const enriched = await Promise.all(rows.map(async (r) => {
                    const prodId = String(r.id_product || '').trim();
                    const productAttributeId = String(r.id_product_attribute || '').trim();
                    if (!prodId || prodId === '0') {
                        return {
                            id_product: prodId,
                            id_product_attribute: productAttributeId,
                            quantity: Number(r.quantity) || 0,
                            name: 'Produit inconnu',
                            priceHT: '0.00',
                            priceTTC: '0.00'
                        };
                    }

                    try {
                        const pInfo = await produitsService.getProduitById(prodId);
                        const rowTaxRate = await taxesService.getProductTaxRate(prodId);
                        const basePrice = Number.parseFloat(pInfo.price || 0) || 0;
                        const impact = await produitsService.getCombinationPriceImpact(productAttributeId);
                        const rowPriceHT = (basePrice + impact).toFixed(2);
                        const rowPriceTTC = taxesService.calculatePriceTTC(basePrice + impact, rowTaxRate || 0).toFixed(2);
                        const pData = pInfo.product ? pInfo.product : pInfo;
                        return {
                            id_product: prodId,
                            id_product_attribute: productAttributeId,
                            quantity: Number(r.quantity) || 0,
                            name: pData.name || `Produit #${prodId}`,
                            priceHT: rowPriceHT,
                            priceTTC: rowPriceTTC
                        };
                    } catch (err) {
                        return {
                            id_product: prodId,
                            quantity: Number(r.quantity),
                            name: 'Erreur charge',
                            priceHT: '0.00',
                            priceTTC: '0.00'
                        };
                    }
                }));
                panier.value = enriched;
            } catch (err) {
                console.warn('Erreur synchro panier server:', err);
            }
        }

        window.dispatchEvent(new CustomEvent('panier-update'));
        lastAddedItem.value = { 
            name: produit.value.name, 
            priceHT: currentPriceHT.value,
            priceTTC: currentPriceTTC.value,
            quantity: quantite.value 
        };
        showSuccessModal.value = true;
    } catch (e) {
        alert("Erreur lors de l'ajout au panier");
    }
};

const commanderProduit = () => {
    if (!combinationId.value && combinationId.value !== '0') return;

    if (!hasEnoughStock.value) {
        pendingAddToCart.value = true;
        showStockWarningModal.value = true;
        return;
    }

    ajouterAuPanier();
};

const annulerStockWarning = () => {
    showStockWarningModal.value = false;
    pendingAddToCart.value = false;
};

const poursuivreStockWarning = async () => {
    showStockWarningModal.value = false;

    if (pendingAddToCart.value) {
        pendingAddToCart.value = false;
        await ajouterAuPanier();
    }
};

const getSubTotal = () => {
    return panier.value.reduce((sum, item) => sum + (parseFloat(item.priceHT) * item.quantity), 0).toFixed(2);
};

const getSubTotalTTC = () => {
    return panier.value.reduce((sum, item) => sum + (parseFloat(item.priceTTC) * item.quantity), 0).toFixed(2);
};

const getTotalItems = () => {
    return panier.value.reduce((sum, item) => sum + item.quantity, 0);
};

const closeModal = () => { showSuccessModal.value = false; };
const continuerAchats = () => { closeModal(); router.push('/frontend/liste-produits'); };
const allerAuPanier = () => { router.push('/frontend/panier'); };

</script>

<template>
  <div>
    <div v-if="loading">Chargement des détails...</div>
    
    <div v-else-if="produit">
      <button @click="router.back()">⬅ Retour à la liste</button>
      
      <h1>{{ produit.name }}</h1>
      
      <section>
        <p><strong>Référence :</strong> {{ produit.reference }}</p>
        <p><strong>Prix HT :</strong> <span>{{ currentPriceHT }} €</span></p>
        <p><strong>Prix TTC :</strong> <strong>{{ currentPriceTTC }} €</strong></p>
        <p><strong>Stock :</strong> <span>{{ stockQuantity ?? produit.quantity ?? 0 }}</span></p>
        <p><strong>État :</strong> {{ produit.condition }}</p>
      </section>

      <section>
        <div v-if="optionGroups.length > 0">
          <div v-for="group in optionGroups" :key="group.id">
            <label>{{ group.name }}</label>
            <select v-model="selectedOptions[group.id]" @change="loadCombination">
              <option v-for="value in group.values" :key="value.id" :value="value.id">
                {{ value.name }}
              </option>
            </select>
          </div>
        </div>

        <div>
          <label>Quantité :</label>
          <div>
            <button @click="quantite > 1 ? quantite-- : null"> - </button>
            <input type="number" v-model="quantite" min="1" style="width: 50px; text-align: center;"/>
            <button @click="quantite++"> + </button>
          </div>
        </div>

        <button @click="commanderProduit" :disabled="!combinationId" style="width: 100%; margin-top: 15px;">
          🛒 Commander
        </button>
      </section>
    </div>

    <dialog v-if="showStockWarningModal" @click="annulerStockWarning">
      <div @click.stop>
        <button @click="annulerStockWarning">✕</button>
        <h2>Stock insuffisant</h2>
        <p>
          La quantité demandée est de <strong>{{ quantite }}</strong> alors que le stock disponible est de
          <strong>{{ stockQuantity ?? produit.quantity ?? 0 }}</strong>.
        </p>
        <p>Voulez-vous annuler ou poursuivre quand même ?</p>

        <footer>
          <button @click="annulerStockWarning">Annuler</button>
          <button @click="poursuivreStockWarning" style="background: #000; color: #fff;">Poursuivre</button>
        </footer>
      </div>
    </dialog>

    <dialog v-if="showSuccessModal" @click="closeModal">
      <div @click.stop>
        <button @click="closeModal">✕</button>
        <h2>✓ Produit ajouté au panier</h2>
        
        <fieldset v-if="lastAddedItem">
          <h3>{{ lastAddedItem.name }}</h3>
          <p>HT: {{ lastAddedItem.priceHT }} €</p>
          <p><strong>TTC: {{ lastAddedItem.priceTTC }} €</strong></p>
          <p>Quantité : {{ lastAddedItem.quantity }}</p>
        </fieldset>

        <fieldset>
          <p>Il y a <strong>{{ getTotalItems() }}</strong> article(s) dans votre panier.</p>
          <div>
            <span>Total HT : </span>
            <span>{{ getSubTotal() }} €</span>
          </div>
          <div>
            <span><strong>Total TTC : </strong></span>
            <strong>{{ getSubTotalTTC() }} €</strong>
          </div>
        </fieldset>

        <footer>
          <button @click="continuerAchats">Continuer</button>
          <button @click="allerAuPanier" style="background: #000; color: #fff;">Commander</button>
        </footer>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
/* Blocs principaux d'informations (Sections de la fiche) */
section {
  border: 1px solid #ccc;
  padding: 20px;
  background: #fff;
  margin-top: 15px;
}

section p {
  margin: 8px 0;
}

/* Gestionnaires d'options et formulaires */
label {
  display: block;
  margin: 10px 0 5px;
  font-weight: bold;
  font-size: 0.9em;
}

select {
  width: 100%;
  max-width: 320px;
  padding: 6px;
  border: 1px solid #000;
  background: #fff;
}

/* Contrôles de quantité */
section div > div {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}

/* Boutons et Inputs neutres */
button, input {
  padding: 6px 12px;
  border: 1px solid #000;
  background: #fff;
  color: #000;
  cursor: pointer;
}

button:hover {
  background: #eee;
}

button:disabled {
  background: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

/* Fenêtres Modales (Remplacées par la balise sémantique <dialog>) */
dialog {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  border: none;
}

/* Conteneur interne de la modale */
dialog > div {
  background: #fff;
  padding: 25px;
  max-width: 450px;
  width: 90%;
  border: 1px solid #000;
  position: relative;
}

/* Bouton de fermeture de la modale (petite croix) */
dialog > div > button:first-child {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 20px;
  padding: 5px;
}

/* Encadrés récapitulatifs dans les modales */
fieldset {
  background: #f5f5f5;
  border: 1px solid #ccc;
  padding: 12px;
  margin: 15px 0;
}

fieldset div {
  display: flex;
  justify-content: space-between;
  margin: 6px 0;
}

/* Pied de la modale pour l'alignement des actions */
dialog footer {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

dialog footer button {
  flex: 1;
  padding: 10px;
}
</style>