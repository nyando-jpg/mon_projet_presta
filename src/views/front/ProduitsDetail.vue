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
    <div v-if="loading">Chargement des détails...</div>
    <div v-else-if="produit" class="detail-container">
        <button @click="router.back()">⬅ Retour à la liste</button>
        
        <h1>{{ produit.name }}</h1>
        
        <div class="card">
            <p><strong>Référence :</strong> {{ produit.reference }}</p>
            <p>
                <strong>Prix HT :</strong> 
                <span class="price-ht">{{ currentPriceHT }} €</span>
            </p>
            <p>
                <strong>Prix TTC :</strong> 
                <span class="price-ttc">{{ currentPriceTTC }} €</span>
            </p>
            <p>
                <strong>Stock :</strong>
                <span class="stock-value">{{ stockQuantity ?? produit.quantity ?? 0 }}</span>
            </p>
            <p><strong>État :</strong> {{ produit.condition }}</p>
        </div>

        <div class="achat-box">
            <div v-if="optionGroups.length > 0" class="options">
                <div v-for="group in optionGroups" :key="group.id" class="option-group">
                    <label>{{ group.name }}</label>
                    <select v-model="selectedOptions[group.id]" @change="loadCombination">
                        <option v-for="value in group.values" :key="value.id" :value="value.id">
                            {{ value.name }}
                        </option>
                    </select>
                </div>
            </div>

            <div class="quantite-selector">
                <label>Quantité :</label>
                <div class="qty-controls">
                    <button @click="quantite > 1 ? quantite-- : null"> - </button>
                    <input type="number" v-model="quantite" min="1" style="width: 50px; text-align: center;"/>
                    <button @click="quantite++"> + </button>
                </div>
            </div>

            <button class="btn-panier" @click="commanderProduit" :disabled="!combinationId">
                🛒 Commander
            </button>
        </div>
    </div>

    <div v-if="showStockWarningModal" class="modal-overlay" @click="annulerStockWarning">
        <div class="modal-content stock-warning-modal" @click.stop>
            <button class="modal-close" @click="annulerStockWarning">✕</button>
            <h2 class="warning-title">Stock insuffisant</h2>
            <p>
                La quantité demandée est de <strong>{{ quantite }}</strong> alors que le stock disponible est de
                <strong>{{ stockQuantity ?? produit.quantity ?? 0 }}</strong>.
            </p>
            <p>Voulez-vous annuler ou poursuivre quand même ?</p>

            <div class="modal-buttons">
                <button class="btn-continue" @click="annulerStockWarning">Annuler</button>
                <button class="btn-order" @click="poursuivreStockWarning">Poursuivre</button>
            </div>
        </div>
    </div>

    <div v-if="showSuccessModal" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
            <button class="modal-close" @click="closeModal">✕</button>
            <h2 class="success-title">✓ Produit ajouté au panier</h2>
            
            <div class="cart-item-display" v-if="lastAddedItem">
                <h3>{{ lastAddedItem.name }}</h3>
                <p class="item-price item-price-ht">HT: {{ lastAddedItem.priceHT }} €</p>
                <p class="item-price item-price-ttc">TTC: {{ lastAddedItem.priceTTC }} €</p>
                <p class="item-qty">Quantité : {{ lastAddedItem.quantity }}</p>
            </div>

            <div class="cart-summary">
                <p>Il y a <strong>{{ getTotalItems() }}</strong> article(s) dans votre panier.</p>
                <div class="summary-row total">
                    <span>Total HT</span>
                    <span class="price-value">{{ getSubTotal() }} €</span>
                </div>
                <div class="summary-row total">
                    <span>Total TTC</span>
                    <span class="price-value">{{ getSubTotalTTC() }} €</span>
                </div>
            </div>

            <div class="modal-buttons">
                <button class="btn-continue" @click="continuerAchats">Continuer</button>
                <button class="btn-order" @click="allerAuPanier">Commander</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.card, .achat-box {
    border: 1px solid #ddd;
    padding: 20px;
    border-radius: 8px;
    margin-top: 15px;
}

.gallery {
    display: flex;
    gap: 10px;
    margin: 15px 0;
}

.thumb {
    width: 60px;
    height: 60px;
    object-fit: cover;
    cursor: pointer;
    border: 2px solid transparent;
    border-radius: 5px;
}

.thumb:hover {
    border-color: #42b983;
}

.price {
    font-size: 1.1em;
    font-weight: bold;
    color: #e74c3c;
}

.option-group {
    margin-bottom: 15px;
}

.option-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
}

.option-group select {
    width: 100%;
    max-width: 320px;
    padding: 8px;
}

.quantite-selector {
    margin: 15px 0;
}

.qty-controls {
    display: flex;
    gap: 10px;
    margin-top: 8px;
}

.qty-controls button {
    padding: 6px 12px;
    cursor: pointer;
}

.btn-panier {
    width: 100%;
    padding: 12px;
    background: #42b983;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    margin-top: 15px;
}

.btn-panier:hover {
    background: #359a73;
}

/* Modal */
.modal-overlay {
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
}

.modal-content {
    background: white;
    border-radius: 10px;
    padding: 30px;
    max-width: 450px;
    width: 90%;
    box-shadow: 0 5px 25px rgba(0, 0, 0, 0.2);
    position: relative;
}

.modal-close {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
}

.success-title {
    color: #27ae60;
    margin-bottom: 20px;
}

.cart-item-display {
    background: #f9f9f9;
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    border-left: 4px solid #42b983;
}

.cart-item-display h3 {
    margin: 0 0 10px 0;
}

.item-dimension, .item-qty {
    margin: 5px 0;
    font-size: 0.9em;
    color: #666;
}

.item-price {
    font-weight: bold;
    color: #e74c3c;
    font-size: 1.1em;
    margin: 10px 0;
}

.item-price-ht {
    color: #7f8c8d;
}

.item-price-ttc {
    color: #2ecc71;
}

.cart-summary {
    background: #f0f7ff;
    padding: 15px;
    border-radius: 6px;
    margin-bottom: 20px;
    font-size: 0.95em;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #ddd;
}

.summary-row.total {
    border: none;
    border-top: 2px solid #ddd;
    padding-top: 10px;
    margin-top: 5px;
    font-weight: bold;
}

.price-value {
    font-weight: bold;
    color: #e74c3c;
}

.btn-continue {
    width: 100%;
    padding: 12px;
    background: #42b983;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
}

.btn-continue:hover {
    background: #359a73;
}

.modal-buttons {
    display: flex;
    gap: 10px;
}


.stock-warning-modal {
    max-width: 520px;
}

.warning-title {
    margin-top: 0;
    color: #c0392b;
}
.btn-order {
    flex: 1;
    padding: 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
}

.btn-order:hover {
    background: #2980b9;
}

.btn-continue {
    flex: 1;
}

.price-ht {
    color: #7f8c8d;
    font-size: 0.9em;
    text-decoration: none;
}

.price-ttc {
    color: #2ecc71;
    font-weight: bold;
    font-size: 1.4em;
    margin-left: 10px;
}

.stock-value {
    font-weight: bold;
    color: #2c3e50;
    margin-left: 10px;
}
</style>