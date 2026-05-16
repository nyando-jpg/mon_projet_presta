<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import cartsService from '@/service/cartsService';
import produitsService from '@/service/produitsService';
import taxesService from '@/service/taxesService';
import { getActiveCartId, getCurrentCustomerId } from '@/utils/cartStorage';

const router = useRouter();
const panier = ref([]);
const loading = ref(true);

const enrichCartRows = async (rows) => {
    return Promise.all(rows.map(async (row) => {
        const prodId = String(row.id_product || '').trim();
        const productAttributeId = String(row.id_product_attribute || '').trim();

        if (!prodId || prodId === '0') {
            return {
                id_product: prodId,
                id_product_attribute: productAttributeId,
                quantity: Number(row.quantity) || 0,
                name: prodId ? `Produit #${prodId}` : 'Produit inconnu',
                priceHT: '0.00',
                priceTTC: '0.00',
                taxRate: 0,
                dimension: ''
            };
        }

        try {
            const pInfo = await produitsService.getProduitById(prodId);
            const taxRate = await taxesService.getProductTaxRate(prodId);
            const basePrice = Number.parseFloat(pInfo.price || 0) || 0;
            const impact = await produitsService.getCombinationPriceImpact(productAttributeId);
            const finalPrice = basePrice + impact;
            const priceHT = finalPrice.toFixed(2);
            const priceTTC = taxesService.calculatePriceTTC(finalPrice, taxRate || 0).toFixed(2);
            return {
                id_product: prodId,
                id_product_attribute: productAttributeId,
                quantity: Number(row.quantity) || 0,
                name: pInfo.name || `Produit #${prodId}`,
                priceHT,
                priceTTC,
                taxRate: taxRate || 0,
                dimension: ''
            };
        } catch (error) {
            return {
                id_product: prodId,
                id_product_attribute: productAttributeId,
                quantity: Number(row.quantity) || 0,
                name: 'Produit non trouvé',
                priceHT: '0.00',
                priceTTC: '0.00',
                taxRate: 0,
                dimension: ''
            };
        }
    }));
};

// Récupérer le panier depuis le serveur (PrestaShop)
const fetchPanierFromServer = async () => {
    loading.value = true;

    const cartId = getActiveCartId();
    if (!cartId) {
        panier.value = [];
        loading.value = false;
        return;
    }

    try {
        const result = await cartsService.getCart(cartId); 
        
        if (result && result.associations?.cart_rows?.cart_row) {
            const rows = Array.isArray(result.associations.cart_rows.cart_row) 
                ? result.associations.cart_rows.cart_row 
                : [result.associations.cart_rows.cart_row];

            panier.value = await enrichCartRows(rows);
        } else {
            panier.value = [];
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du panier :", error);
    } finally {
        loading.value = false;
    }
};

// Modifier la quantité sur le serveur
const updateQuantite = async (index, newQte) => {
    if (newQte <= 0) return;
    
    const item = panier.value[index];
    const diff = newQte - item.quantity; // On calcule la différence
    const cartId = getActiveCartId();
    const currentCustomerId = getCurrentCustomerId();

    try {
        await cartsService.addToCart({
            id_product: item.id_product,
            id_product_attribute: item.id_product_attribute,
            quantity: diff,
            id_customer: currentCustomerId || '0',
            id_cart: cartId
        });
        // On rafraîchit les données après succès
        await fetchPanierFromServer();
    } catch (e) {
        alert("Erreur lors de la mise à jour sur le serveur");
    }
};

// Sauvegarder la quantité après modification manuelle dans l'input
const savePanier = async (index) => {
    const newQte = parseInt(panier.value[index].quantity) || 1;
    if (newQte <= 0) return;
    await updateQuantite(index, newQte);
};

const removeItem = async (index) => {
    const item = panier.value[index];
    // Pour supprimer, on envoie la quantité négative totale dans ta logique actuelle
    const cartId = getActiveCartId();
    const currentCustomerId = getCurrentCustomerId();

    try {
        await cartsService.addToCart({
            id_product: item.id_product,
            id_product_attribute: item.id_product_attribute,
            quantity: -item.quantity,
            id_customer: currentCustomerId || '0',
            id_cart: cartId
        });
        await fetchPanierFromServer();
    } catch (e) {
        alert("Erreur lors de la suppression");
    }
};

// Calculer le sous-total
const getSubTotal = () => {
    return panier.value.reduce((sum, item) => sum + (parseFloat(item.priceHT) * item.quantity), 0).toFixed(2);
};

const getSubTotalTTC = () => {
    return panier.value.reduce((sum, item) => sum + (parseFloat(item.priceTTC) * item.quantity), 0).toFixed(2);
};

// Nombre total d'articles
const getTotalItems = () => {
    return panier.value.reduce((sum, item) => sum + item.quantity, 0);
};

// Commander
const commander = () => {
    if (panier.value.length === 0) {
        alert("Votre panier est vide !");
        return;
    }
    router.push('/frontend/commande');
};

onMounted(() => {
    fetchPanierFromServer();
    window.addEventListener('customer-update', fetchPanierFromServer);
});

onUnmounted(() => {
    window.removeEventListener('customer-update', fetchPanierFromServer);
});
</script>

<template>
    <div v-if="loading" class="panier-container">Chargement du panier...</div>
    <div v-else class="panier-container">
        <button class="btn-back" @click="router.back()">⬅ Retour</button>
        
        <h1>Mon Panier</h1>

        <div v-if="panier.length === 0" class="empty-cart">
            <p>Votre panier est vide</p>
            <button class="btn-shop" @click="router.push('/frontend/liste-produits')">Continuer les achats</button>
        </div>

        <div v-else>
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Produit</th>
                        <th>Prix</th>
                        <th>Quantité</th>
                        <th>Total</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(item, index) in panier" :key="index">
                        <td>
                            <div>
                                <strong>{{ item.name }}</strong>
                                <p class="item-detail">Dimension : {{ item.dimension }}</p>
                            </div>
                        </td>
                        <td class="price">
                            <div>HT: {{ item.priceHT }} €</div>
                            <div class="price-ttc">TTC: {{ item.priceTTC }} €</div>
                        </td>
                        <td>
                            <div class="qty-input">
                                <button @click="updateQuantite(index, item.quantity - 1)">-</button>
                                <input type="number" v-model.number="item.quantity" @change="savePanier(index)" min="1" />
                                <button @click="updateQuantite(index, item.quantity + 1)">+</button>
                            </div>
                        </td>
                        <td class="price">
                            <strong>HT: {{ (parseFloat(item.priceHT) * item.quantity).toFixed(2) }} €</strong>
                            <strong class="price-ttc">TTC: {{ (parseFloat(item.priceTTC) * item.quantity).toFixed(2) }} €</strong>
                        </td>
                        <td>
                            <button class="btn-remove" @click="removeItem(index)">Supprimer</button>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="cart-summary">
                <div class="summary-item">
                    <span>Nombre d'articles :</span>
                    <span>{{ getTotalItems() }}</span>
                </div>
                <div class="summary-item">
                    <span>Sous-total HT :</span>
                    <span>{{ getSubTotal() }} €</span>
                </div>
                <div class="summary-item">
                    <span>Transport :</span>
                    <span>gratuit</span>
                </div>
                <div class="summary-item total">
                    <span>Total TTC :</span>
                    <span>{{ getSubTotalTTC() }} €</span>
                </div>
            </div>

            <div class="buttons">
                <button class="btn-continue" @click="router.push('/frontend/liste-produits')">Continuer les achats</button>
                <button class="btn-order" @click="commander">Commander</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.panier-container {
    max-width: 900px;
    margin: 20px auto;
    padding: 20px;
}

h1 {
    margin-bottom: 25px;
}

.empty-cart {
    text-align: center;
    padding: 50px 20px;
}

.cart-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
}

.cart-table th,
.cart-table td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid #ddd;
}

.cart-table th {
    background: #f5f5f5;
    font-weight: bold;
}

.price {
    color: #e74c3c;
    font-weight: bold;
}

.price-ttc {
    display: block;
    color: #2ecc71;
    margin-top: 4px;
}

.qty-input {
    display: flex;
    gap: 5px;
}

.qty-input button {
    padding: 4px 8px;
    cursor: pointer;
}

.qty-input input {
    width: 50px;
}

.btn-remove {
    padding: 6px 12px;
    background: #e74c3c;
    color: white;
    border: none;
    cursor: pointer;
}

.cart-summary {
    background: #f9f9f9;
    padding: 15px;
    margin-bottom: 20px;
}

.summary-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
}

.summary-item.total {
    border-top: 2px solid #ddd;
    padding-top: 10px;
    font-weight: bold;
}

.buttons {
    display: flex;
    gap: 10px;
}

.btn-continue,
.btn-order,
.btn-shop,
.btn-back {
    padding: 10px 15px;
    cursor: pointer;
}

.btn-order,
.btn-continue,
.btn-shop {
    background: #42b983;
    color: white;
    border: none;
}

.btn-order {
    background: #3498db;
}
</style>
