<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { XMLParser } from 'fast-xml-parser';
import cartsService from '@/service/cartsService';
import produitsService from '@/service/produitsService';
import taxesService from '@/service/taxesService';
import { getActiveCartId } from '@/utils/cartStorage';
import { migrateGuestCartToCustomer } from '@/utils/cartStorage';
import customersService from '@/service/customersService';
import addressesService from '@/service/adressesService';
import ordersService from '@/service/ordersService';

const router = useRouter();
const currentStep = ref(1);
const panier = ref([]);
const createdAddressId = ref(null);

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

const extractNodeValue = (node) => {
    if (!node) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (typeof node === 'object') {
        if ('#text' in node) return String(node['#text'] || '');
        if (node.language) {
            if (Array.isArray(node.language)) return extractNodeValue(node.language[0]);
            return extractNodeValue(node.language);
        }
    }
    return '';
};

const normalizeCustomerNode = (customerNode) => ({
    id: extractNodeValue(customerNode?.id),
    id_gender: extractNodeValue(customerNode?.id_gender),
    firstname: extractNodeValue(customerNode?.firstname),
    lastname: extractNodeValue(customerNode?.lastname),
    email: extractNodeValue(customerNode?.email),
    is_guest: extractNodeValue(customerNode?.is_guest)
});

const parseStoredCustomer = () => {
    const rawCustomer = localStorage.getItem('customer');
    if (!rawCustomer) return null;

    try {
        if (rawCustomer.trim().startsWith('<')) {
            const parsed = xmlParser.parse(rawCustomer);
            return normalizeCustomerNode(parsed?.prestashop?.customer);
        }

        const parsed = JSON.parse(rawCustomer);
        return {
            id: String(parsed?.id || ''),
            id_gender: String(parsed?.id_gender || ''),
            firstname: String(parsed?.firstname || ''),
            lastname: String(parsed?.lastname || ''),
            email: String(parsed?.email || ''),
            is_guest: String(parsed?.is_guest || '')
        };
    } catch (error) {
        console.error('Erreur lecture customer localStorage :', error);
        return null;
    }
};

const form = ref({
    // Étape 1: Infos personnelles
    titre: 'M.',
    prenom: '',
    nom: '',
    email: '',
    password: '',
    newsletter: false,
    
    // Étape 2: Adresses
    adresse: '',
    codePostal: '',
    ville: '',
    pays: 'France',
    telephone: '',
    
    // Étape 3: Livraison
    modeLivraison: 'gratuit',
    message: '',
    
    // Étape 4: Paiement
    modePaiement: 'livraison',
    accepteConditions: false
});

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
                dimension: ''
            };
        }
    }));
};

const loadPanier = async () => {
    const cartId = getActiveCartId();

    if (!cartId) {
        panier.value = [];
        return;
    }

    try {
        const result = await cartsService.getCart(cartId);
        const rows = result?.associations?.cart_rows?.cart_row;

        if (!rows) {
            panier.value = [];
            return;
        }

        const normalizedRows = Array.isArray(rows) ? rows : [rows];
        panier.value = await enrichCartRows(normalizedRows);
    } catch (error) {
        panier.value = [];
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

const prevStep = () => {
    if (currentStep.value > 1) {
        currentStep.value--;
    }
};

/**
 * Valide TOUS les champs obligatoires avant de créer la commande
 * @returns {boolean} true si tout est valide
 */
const validateAllStepsBeforeFinalize = () => {
    // Étape 1: Infos personnelles
    if (!form.value.prenom?.trim()) {
        alert("❌ Étape 1: Le prénom est obligatoire");
        currentStep.value = 1;
        return false;
    }
    if (!form.value.nom?.trim()) {
        alert("❌ Étape 1: Le nom est obligatoire");
        currentStep.value = 1;
        return false;
    }
    if (!form.value.email?.trim()) {
        alert("❌ Étape 1: L'email est obligatoire");
        currentStep.value = 1;
        return false;
    }

    // Vérifier que le customer a bien été créé
    const customer = parseStoredCustomer();
    if (!customer) {
        alert("❌ Étape 1: Le client n'a pas été créé. Veuillez remplir les infos personnelles.");
        currentStep.value = 1;
        return false;
    }

    // Étape 2: Adresse
    if (!form.value.adresse?.trim()) {
        alert("❌ Étape 2: L'adresse est obligatoire");
        currentStep.value = 2;
        return false;
    }
    if (!form.value.codePostal?.trim()) {
        alert("❌ Étape 2: Le code postal est obligatoire");
        currentStep.value = 2;
        return false;
    }
    if (!form.value.ville?.trim()) {
        alert("❌ Étape 2: La ville est obligatoire");
        currentStep.value = 2;
        return false;
    }

    // Vérifier que l'adresse a bien été créée
    if (!createdAddressId.value) {
        alert("❌ Étape 2: L'adresse n'a pas été enregistrée. Veuillez cliquer sur 'Suivant' à l'étape 2.");
        currentStep.value = 2;
        return false;
    }

    // Étape 3: Mode de livraison
    if (!form.value.modeLivraison) {
        alert("❌ Étape 3: Veuillez choisir un mode de livraison");
        currentStep.value = 3;
        return false;
    }

    // Étape 4: Mode de paiement et conditions
    if (!form.value.modePaiement) {
        alert("❌ Étape 4: Veuillez choisir un mode de paiement");
        currentStep.value = 4;
        return false;
    }
    if (!form.value.accepteConditions) {
        alert("❌ Étape 4: Vous devez accepter les conditions générales");
        currentStep.value = 4;
        return false;
    }

    // Vérifier le panier
    if (!panier.value || panier.value.length === 0) {
        alert("❌ Votre panier est vide. Impossible de créer une commande.");
        return false;
    }

    return true;
};

const finaliserCommande = async () => {
    // ✅ VALIDATION GLOBALE D'ABORD
    if (!validateAllStepsBeforeFinalize()) {
        return; // Affiche une alerte et se repositionne à l'étape fautive
    }
    try {
        const rawCustomer = parseStoredCustomer();
        if (!rawCustomer) throw new Error("Client non trouvé");

        const customer = rawCustomer;
        const customerId = customer.id; // ID client utilisé pour la commande

        // On va chercher la clé dynamique dans le localStorage
        const cartId = localStorage.getItem(`active_cart_id_customer_${customerId}`);

        console.log("Données trouvées :", { customerId, cartId });

        if (!cartId) {
            alert("Panier introuvable. Vérifiez que vous avez des articles.");
            return;
        }

        // Vérifier que l'adresse a bien été créée/enregistrée
        if (!createdAddressId.value) {
            alert("❌ ERREUR : L'adresse n'a pas été enregistrée. Veuillez compléter l'étape 2 (Adresse)");
            currentStep.value = 2;
            return;
        }

        const totalHT = getSubTotal();
        const totalTTC = getSubTotalTTC();
        const shipping = form.value.modeLivraison === 'gratuit' ? 0 : 8.40;
        const shippingValue = shipping.toFixed(2);
        const totalWithShippingTTC = (parseFloat(totalTTC) + parseFloat(shippingValue)).toFixed(2);
        
        // VÉRIFIER QUE TOTAL EST VALIDE
        if (!totalTTC || parseFloat(totalTTC) <= 0) {
            alert("❌ ERREUR : Total TTC invalide (" + totalTTC + "). Vérifiez que votre panier n'est pas vide.");
            return;
        }

        console.log("✅ Tous les préalables OK:", { customerId, cartId, addressId: createdAddressId.value, totalHT, totalTTC });
        
        // OBJET SIMPLE - PAS DE XML ICI
        const orderPayload = {
            id_customer: customerId,
            id_cart: cartId,
            id_address: createdAddressId.value, // Assure-toi que l'ID existe dans ps_address
            id_carrier: 1,
            total_paid_tax_excl: totalHT,
            total_paid_tax_incl: totalWithShippingTTC,
            total_paid: totalWithShippingTTC,
            total_products: totalHT,
            total_products_wt: totalTTC,
            shipping_cost: shippingValue
        };

        console.log("📦 Payload envoyé à ordersService:", orderPayload);

        // On appelle le service
        const result = await ordersService.createOrder(orderPayload);
        
        // ✅ Utiliser l'objet parsé retourné par le service
        if (result.success) {
            alert("✅ Commande n°" + result.id + " créée avec succès !");
            console.log("📋 Détail commande:", { id: result.id, reference: result.reference });
            
            // Nettoyage
            localStorage.removeItem(`active_cart_id_customer_${customerId}`);
            router.push('/frontend/liste-produits');
        } else {
            throw new Error("Erreur: Commande non créée");
        }

    } catch (error) {
        console.error("❌ --- ERREUR LORS DE LA CRÉATION DE COMMANDE ---");
        console.error("Message d'erreur:", error.message);
        console.error("Code statut HTTP:", error.response?.status);
        
        // Ceci va afficher la réponse XML détaillée de PrestaShop dans ta console
        if (error.response && error.response.data) {
            console.error("📋 DÉTAIL SERVEUR:", error.response.data);
            alert("❌ Erreur serveur PrestaShop:\n" + error.response.data);
        } else {
            alert("❌ Erreur: " + error.message);
        }
    }
};

const retourPanier = () => {
    router.push('/frontend/panier');
};

const nextStep = async () => {
    // ÉTAPE 1 -> 2
    if (currentStep.value === 1) {
        if (!form.value.prenom || !form.value.nom || !form.value.email) {
            alert("Veuillez remplir les champs obligatoires (*)");
            return;
        }

        try {
            const storedCustomer = parseStoredCustomer();
            if (!storedCustomer) {
                const newCustomer = await customersService.createCustomer({
                    firstname: form.value.prenom,
                    lastname: form.value.nom,
                    email: form.value.email,
                    password: form.value.password || 'password123',
                    newsletter: form.value.newsletter,
                    is_guest: true
                });
                localStorage.setItem('customer', JSON.stringify(newCustomer));
                migrateGuestCartToCustomer(newCustomer.id);
            } else {
                localStorage.setItem('customer', JSON.stringify(storedCustomer));
                migrateGuestCartToCustomer(storedCustomer.id);
            }
            
            currentStep.value = 2; // On change la valeur et ON S'ARRÊTE LÀ
        } catch (error) {
            console.error("Erreur à l'étape 1:", error);
            alert("Impossible de créer votre profil client.");
        }
    } 
    // ÉTAPE 2 -> 3 (On ajoute un ELSE ici)
    else if (currentStep.value === 2) {
        if (!form.value.adresse || !form.value.codePostal || !form.value.ville) {
            alert("L'adresse est incomplète");
            return;
        }

        try {
            const customer = parseStoredCustomer();
            migrateGuestCartToCustomer(customer?.id);
            const newAddr = await addressesService.createAddress({
                id_customer: customer.id,
                lastname: form.value.nom,
                firstname: form.value.prenom,
                address1: form.value.adresse,
                postcode: form.value.codePostal,
                city: form.value.ville,
                phone: form.value.telephone
            });

            const cartId = getActiveCartId();
            const carrierId = form.value.modeLivraison === 'gratuit' ? 1 : 2; 
            
            await cartsService.updateCartAddresses(cartId, newAddr.id, carrierId);

            // On stocke l'ID pour la commande finale
            createdAddressId.value = newAddr.id; 

            currentStep.value = 3; 
        } catch (error) {
            console.error("Erreur étape 2:", error);
            alert("Erreur lors de l'enregistrement de l'adresse.");
        }
    } 
    // ÉTAPE 3 -> 4 (Ajoute validation)
    else if (currentStep.value === 3) {
        if (!form.value.modeLivraison) {
            alert("Veuillez choisir un mode de livraison");
            return;
        }
        currentStep.value = 4;
    }
    // ÉTAPE 4 -> Prêt à finaliser (Ajoute validation)
    else if (currentStep.value === 4) {
        if (!form.value.modePaiement) {
            alert("Veuillez choisir un mode de paiement");
            return;
        }
        if (!form.value.accepteConditions) {
            alert("Vous devez accepter les conditions générales");
            return;
        }
        // L'étape 4 est la dernière, on peut finaliser
        // Le bouton "Finaliser" appellera finaliserCommande()
    }
};

onMounted(() => {
    loadPanier();
    window.addEventListener('customer-update', loadPanier);

    // Récupération du client connecté
    const storedCustomer = parseStoredCustomer();
    if (storedCustomer) {
        try {
            // On remplit le formulaire avec les données existantes
            if (storedCustomer.id_gender === "1") form.value.titre = "M.";
            if (storedCustomer.id_gender === "2") form.value.titre = "Mme";
            form.value.prenom = storedCustomer.firstname || '';
            form.value.nom = storedCustomer.lastname || '';
            form.value.email = storedCustomer.email || '';
            
            // Optionnel : Si l'utilisateur est déjà connecté, 
            // on peut passer directement à l'étape 2 (Adresses)
            // currentStep.value = 2; 
            
        } catch (e) {
            console.error("Erreur lors de la lecture du client :", e);
        }
    }
});

onUnmounted(() => {
    window.removeEventListener('customer-update', loadPanier);
});


</script>

<template>
    <div class="commande-container">
        <h1>Commande</h1>

        <!-- Steps indicator -->
        <div class="steps">
            <div :class="['step', { active: currentStep >= 1, current: currentStep === 1 }]">1. Infos</div>
            <div :class="['step', { active: currentStep >= 2, current: currentStep === 2 }]">2. Adresses</div>
            <div :class="['step', { active: currentStep >= 3, current: currentStep === 3 }]">3. Livraison</div>
            <div :class="['step', { active: currentStep >= 4, current: currentStep === 4 }]">4. Paiement</div>
        </div>

        <div class="layout">
            <div class="form-container">
                <!-- Étape 1: Informations personnelles -->
                <div v-if="currentStep === 1" class="form-step">
                    <h2>1. Informations personnelles</h2>
                    
                    <div class="form-group">
                        <label>Titre</label>
                        <select v-model="form.titre">
                            <option value="M.">M.</option>
                            <option value="Mme">Mme</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Prénom *</label>
                        <input v-model="form.prenom" type="text" placeholder="Votre prénom" required />
                    </div>

                    <div class="form-group">
                        <label>Nom *</label>
                        <input v-model="form.nom" type="text" placeholder="Votre nom" required />
                    </div>

                    <div class="form-group">
                        <label>E-mail *</label>
                        <input v-model="form.email" type="email" placeholder="Votre email" required />
                    </div>

                    <div class="form-group">
                        <label>Mot de passe (optionnel)</label>
                        <input v-model="form.password" type="password" placeholder="Créer un compte" />
                        <small>Gagnez du temps pour votre prochaine commande</small>
                    </div>

                    <div class="checkbox">
                        <input v-model="form.newsletter" type="checkbox" id="newsletter" />
                        <label for="newsletter">Recevoir notre newsletter</label>
                    </div>
                </div>

                <!-- Étape 2: Adresses -->
                <div v-if="currentStep === 2" class="form-step">
                    <h2>2. Adresses</h2>

                    <div class="form-group">
                        <label>Adresse *</label>
                        <input v-model="form.adresse" type="text" placeholder="Votre adresse" required />
                    </div>

                    <div class="form-group">
                        <label>Code postal *</label>
                        <input v-model="form.codePostal" type="text" placeholder="Code postal" required />
                    </div>

                    <div class="form-group">
                        <label>Ville *</label>
                        <input v-model="form.ville" type="text" placeholder="Ville" required />
                    </div>

                    <div class="form-group">
                        <label>Pays</label>
                        <input v-model="form.pays" type="text" />
                    </div>

                    <div class="form-group">
                        <label>Téléphone</label>
                        <input v-model="form.telephone" type="text" placeholder="Optionnel" />
                    </div>
                </div>

                <!-- Étape 3: Mode de livraison -->
                <div v-if="currentStep === 3" class="form-step">
                    <h2>3. Mode de livraison</h2>

                    <div class="radio-group">
                        <div class="radio-option">
                            <input v-model="form.modeLivraison" type="radio" id="gratuit" value="gratuit" />
                            <label for="gratuit">
                                <strong>Retrait en magasin</strong><br>
                                Gratuit
                            </label>
                        </div>

                        <div class="radio-option">
                            <input v-model="form.modeLivraison" type="radio" id="payant" value="payant" />
                            <label for="payant">
                                <strong>Livraison My Carrier</strong><br>
                                8,40 € TTC - Livraison le lendemain
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Message pour la commande</label>
                        <textarea v-model="form.message" placeholder="Optionnel"></textarea>
                    </div>
                </div>

                <!-- Étape 4: Paiement -->
                <div v-if="currentStep === 4" class="form-step">
                    <h2>4. Paiement</h2>

                    <div class="radio-group">
                        <div class="radio-option">
                            <input v-model="form.modePaiement" type="radio" id="livraison" value="livraison" />
                            <label for="livraison">Payer comptant à la livraison</label>
                        </div>

                        <div class="radio-option">
                            <input v-model="form.modePaiement" type="radio" id="cheque" value="cheque" />
                            <label for="cheque">Payer par chèque</label>
                        </div>

                        <div class="radio-option">
                            <input v-model="form.modePaiement" type="radio" id="virement" value="virement" />
                            <label for="virement">Payer par virement bancaire</label>
                        </div>
                    </div>

                    <div class="checkbox">
                        <input v-model="form.accepteConditions" type="checkbox" id="conditions" required />
                        <label for="conditions">J'accepte les conditions générales de vente</label>
                    </div>
                </div>
            </div>

            <!-- Résumé du panier -->
            <div class="panier-summary">
                <h3>Résumé ({{ getTotalItems() }} article)</h3>
                <table>
                    <tr v-for="(item, idx) in panier" :key="idx">
                        <td>{{ item.name }}</td>
                        <td class="right">x{{ item.quantity }}</td>
                        <td class="right">
                            HT: {{ (parseFloat(item.priceHT) * item.quantity).toFixed(2) }} €<br />
                            TTC: {{ (parseFloat(item.priceTTC) * item.quantity).toFixed(2) }} €
                        </td>
                    </tr>
                </table>

                <div class="totals">
                    <div>Sous-total HT: <strong>{{ getSubTotal() }} €</strong></div>
                    <div>Sous-total TTC: <strong>{{ getSubTotalTTC() }} €</strong></div>
                    <div>Livraison: <strong>{{ form.modeLivraison === 'gratuit' ? 'gratuit' : '8,40 €' }}</strong></div>
                    <div class="total">Total TTC: <strong>{{ form.modeLivraison === 'gratuit' ? getSubTotalTTC() : (parseFloat(getSubTotalTTC()) + 8.4).toFixed(2) }} €</strong></div>
                </div>
            </div>
        </div>

        <!-- Boutons de navigation -->
        <div class="buttons">
            <button v-if="currentStep > 1" @click="prevStep" class="btn-prev">← Retour</button>
            <button v-if="currentStep < 4" @click="nextStep" class="btn-next">Suivant →</button>
            <button v-if="currentStep === 4" @click="finaliserCommande" class="btn-order">Finaliser la commande</button>
            <button @click="retourPanier" class="btn-cancel">Annuler</button>
        </div>
    </div>
</template>

<style scoped>
.commande-container {
    margin: 20px;
    padding: 20px;
    width: 100%; /* Force la largeur totale */
    max-width: none; /* Annule toute limite imposée par un parent */
}

h1 {
    text-align: center;
    margin-bottom: 20px;
}

.steps {
    display: flex;
    justify-content: space-between;
    margin-bottom: 30px;
    gap: 10px;
}

.step {
    flex: 1;
    padding: 10px;
    text-align: center;
    border: 2px solid #ddd;
    background: #f9f9f9;
}

.step.active {
    border-color: #42b983;
    background: #e8f7ed;
}

.step.current {
    background: #42b983;
    color: white;
}

.layout {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
}

.form-container {
    flex: 1;
    background: white;
    padding: 20px;
    border: 1px solid #ddd;
}

.form-step h2 {
    margin-bottom: 20px;
    font-size: 1.3em;
}

.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    box-sizing: border-box;
}

.form-group small {
    display: block;
    margin-top: 3px;
    font-size: 0.85em;
    color: #666;
}

.checkbox {
    margin: 15px 0;
}

.checkbox input {
    width: auto;
    margin-right: 10px;
}

.radio-group {
    margin-bottom: 15px;
}

.radio-option {
    margin-bottom: 10px;
    padding: 10px;
    border: 1px solid #ddd;
}

.radio-option input {
    width: auto;
    margin-right: 10px;
}

.radio-option label {
    display: inline;
    font-weight: normal;
    margin: 0;
}

.panier-summary {
    width: 300px;
    background: #f9f9f9;
    padding: 15px;
    border: 1px solid #ddd;
    height: fit-content;
}

.panier-summary h3 {
    margin-bottom: 15px;
}

.panier-summary table {
    width: 100%;
    margin-bottom: 15px;
    border-collapse: collapse;
    font-size: 0.9em;
}

.panier-summary table tr {
    border-bottom: 1px solid #ddd;
}

.panier-summary table td {
    padding: 5px;
}

.right {
    text-align: right;
}

.totals {
    padding-top: 10px;
    border-top: 2px solid #ddd;
    font-size: 0.9em;
}

.totals div {
    margin: 8px 0;
}

.totals .total {
    font-weight: bold;
    color: #e74c3c;
}

.buttons {
    display: flex;
    gap: 10px;
}

.buttons button {
    padding: 10px 20px;
    border: none;
    cursor: pointer;
}

.btn-next,
.btn-order {
    background: #42b983;
    color: white;
}

.btn-prev {
    background: #95a5a6;
    color: white;
}

.btn-cancel {
    background: #e74c3c;
    color: white;
}

@media (max-width: 768px) {
    .layout {
        flex-direction: column;
    }
    
    .panier-summary {
        width: 100%;
    }
}
</style>