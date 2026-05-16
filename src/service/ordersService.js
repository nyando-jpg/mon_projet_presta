// src/service/ordersService.js
import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop_edition_classic_version_8.2.6/api';

// Utilitaires
const extractVal = (node) => {
    if (!node) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (typeof node === 'object') {
        if (node.language) {
            if (Array.isArray(node.language)) return extractVal(node.language[0]);
            return node.language['#text'] || node.language || '';
        }
        if ('#text' in node) return node['#text'];
    }
    return '';
};

const asArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

/**
 * transformerOrder : Le "Nettoyeur"
 * Transforme une commande XML brute en objet JS propre et utilisable.
 */
const transformerOrder = (o) => {
    return {
        id: extractVal(o.id),
        reference: extractVal(o.reference),
        id_customer: extractVal(o.id_customer),
        id_cart: extractVal(o.id_cart),
        total_paid: parseFloat(extractVal(o.total_paid)).toFixed(2), // Force 2 décimales
        payment: extractVal(o.payment),
        date_add: extractVal(o.date_add),
        current_state: extractVal(o.current_state),
        module: extractVal(o.module),
        // On peut même préparer les associations si besoin plus tard
        products: asArray(o.associations?.order_rows?.order_row || [])
    };
};

export default {
    /**
     * Récupère les infos complètes du panier
     */
    async getCartFull(cartId) {
        try {
            console.log(`📦 Récupération panier ${cartId}...`);
            const response = await axios.get(`${BASE_URL}/carts/${cartId}?display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });
            
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const cart = result?.prestashop?.cart;
            
            if (!cart) throw new Error('Panier non trouvé');
            
            console.log("✅ Panier récupéré");
            return cart;
        } catch (error) {
            console.error("❌ Erreur récupération panier:", error.message);
            throw error;
        }
    },

    /**
     * Prépare le panier AVANT création de commande
     * Ajoute l'adresse, le transporteur et met à jour les lignes
     */
    async prepareCartBeforeOrder(cartId, customerId, addressId, cartData) {
        try {
            console.log(`🔄 Préparation panier ${cartId} avec adresse ${addressId}...`);
            
            const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
            
            // Normaliser les lignes du panier
            const cartRows = asArray(cartData?.associations?.cart_rows?.cart_row || []);
            const normalizedRows = cartRows.map(row => ({
                id_product: extractVal(row.id_product),
                id_product_attribute: extractVal(row.id_product_attribute) || '0',
                id_address_delivery: addressId,
                quantity: extractVal(row.quantity)
            }));
            
            console.log(`📝 ${normalizedRows.length} lignes à envoyer au panier`);

            const cartXML = {
                prestashop: {
                    cart: {
                        id: cartId,
                        id_customer: customerId,
                        id_currency: extractVal(cartData?.id_currency) || '1',
                        id_lang: extractVal(cartData?.id_lang) || '1',
                        id_shop: '1',
                        id_shop_group: '1',
                        id_carrier: '1',
                        id_address_delivery: addressId,
                        id_address_invoice: addressId,
                        gift: '0',
                        recyclable: '0',
                        mobile_theme: '0',
                        allow_seperated_package: '0',
                        associations: {
                            cart_rows: {
                                cart_row: normalizedRows
                            }
                        }
                    }
                }
            };

            const xml = builder.build(cartXML);
            console.log(`🔷 XML PUT /api/carts:\n`, xml.substring(0, 500) + "...");
            
            const response = await axios.put(`${BASE_URL}/carts/${cartId}`, xml, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            
            console.log("✅ Panier préparé et mis à jour");
            return result?.prestashop?.cart;
        } catch (error) {
            console.error("❌ Erreur préparation panier:", error.message);
            throw error;
        }
    },

    /**
     * Crée la commande une fois le panier préparé
     */
    async createOrder(orderData) {
        try {
            console.log("🔷 [ordersService] Données reçues:", orderData);
            
            // Valider que les IDs sont des nombres valides
            if (!orderData.id_address || parseInt(orderData.id_address) <= 0) {
                throw new Error("❌ ID adresse invalide: " + orderData.id_address);
            }
            if (!orderData.id_customer || parseInt(orderData.id_customer) <= 0) {
                throw new Error("❌ ID customer invalide: " + orderData.id_customer);
            }
            if (!orderData.id_cart || parseInt(orderData.id_cart) <= 0) {
                throw new Error("❌ ID cart invalide: " + orderData.id_cart);
            }
            
            // Assurer que les totaux sont des nombres valides
            const totalPaidTaxIncl = parseFloat(orderData.total_paid_tax_incl ?? orderData.total_paid) || 0;
            const totalPaidTaxExcl = parseFloat(orderData.total_paid_tax_excl ?? orderData.total_products) || 0;
            const totalProductsHT = parseFloat(orderData.total_products ?? orderData.total_paid_tax_excl) || 0;
            const totalProductsTTC = parseFloat(orderData.total_products_wt ?? orderData.total_paid_tax_incl) || 0;
            const shippingTotal = parseFloat(orderData.shipping_cost) || 0;
            
            if (totalPaidTaxIncl <= 0 || totalProductsHT <= 0) {
                throw new Error("❌ Total invalide - total_paid_tax_incl: " + totalPaidTaxIncl + ", total_products: " + totalProductsHT);
            }
            
            // 🆕 ÉTAPE 1 : Récupérer le panier complet
            console.log("🟡 [1/3] Récupération panier complet...");
            const cartData = await this.getCartFull(orderData.id_cart);
            
            // 🆕 ÉTAPE 2 : Préparer le panier AVANT création commande
            console.log("🟡 [2/3] Préparation panier avec adresse...");
            await this.prepareCartBeforeOrder(
                orderData.id_cart, 
                orderData.id_customer, 
                orderData.id_address, 
                cartData
            );
            
            console.log("🔷 Totaux calculés:", {
                totalPaidTaxIncl,
                totalPaidTaxExcl,
                totalProductsHT,
                totalProductsTTC,
                shippingTotal
            });
            console.log("🔷 IDs valides:", { 
                id_address: parseInt(orderData.id_address),
                id_customer: parseInt(orderData.id_customer),
                id_cart: parseInt(orderData.id_cart)
            });
            
            const builder = new XMLBuilder({ 
                ignoreAttributes: false,
                processEntities: true,
                format: false
            });
            
            // 🆕 ÉTAPE 3 : Créer la commande
            console.log("🟡 [3/3] Création commande...");
            const secureKey = cartData?.secure_key || "00000000000000000000000000000000"; // à récupérer idéalement
            const xmlObject = {
                prestashop: {
                    order: {
                        id_address_delivery: parseInt(orderData.id_address),
                        id_address_invoice: parseInt(orderData.id_address),
                        id_customer: parseInt(orderData.id_customer),
                        id_cart: parseInt(orderData.id_cart),
                        id_currency: 1,
                        id_lang: 1,
                        id_shop_group: 1,
                        id_shop: 1,
                        id_carrier: 1,
                        current_state: 2,
                        module: 'ps_cashondelivery',
                        payment: 'Paiement à la livraison',
                        secure_key: secureKey,
                        
                        // Utiliser exactement 2 décimales
                        total_paid: totalPaidTaxIncl.toFixed(2),
                        total_paid_tax_incl: totalPaidTaxIncl.toFixed(2),
                        total_paid_tax_excl: totalPaidTaxExcl.toFixed(2),
                        total_paid_real: totalPaidTaxIncl.toFixed(2),
                        total_products: totalProductsHT.toFixed(2),
                        total_products_wt: totalProductsTTC.toFixed(2),
                        total_shipping: shippingTotal.toFixed(2),
                        total_shipping_tax_incl: shippingTotal.toFixed(2),
                        total_shipping_tax_excl: shippingTotal.toFixed(2),
                        total_discounts: "0.00",
                        total_wrapping: "0.00",
                        conversion_rate: "1.00",
                        valid: "1"
                    }
                }
            };

            const xml = builder.build(xmlObject);
            console.log("🔷 XML à envoyer:\n", xml);
            
            const response = await axios.post(`${BASE_URL}/orders`, xml, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });
            
            // PARSER LA RÉPONSE XML
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const createdOrder = result?.prestashop?.order;
            
            const orderId = extractVal(createdOrder?.id);
            const orderReference = extractVal(createdOrder?.reference) || 'N/A';
            
            console.log("✅ Commande créée avec succès - ID:", orderId, "Référence:", orderReference);
            
            return {
                success: true,
                id: orderId,
                reference: orderReference,
                data: createdOrder
            };
        } catch (error) {
            console.error("❌ Erreur création commande:", error.message);
            if (error.response?.data) {
                console.error("📋 Détail serveur:", error.response.data);
            }
            throw error;
        }
    },
/**
     * Récupère la liste de toutes les commandes (Admin)
     */
    async getOrders() {
        try {
            const response = await axios.get(`${BASE_URL}/orders?display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const ordersData = result?.prestashop?.orders?.order;
            
            if (!ordersData) return [];

            // Utilisation du transformer sur chaque élément
            return asArray(ordersData).map(order => transformerOrder(order));
        } catch (error) {
            console.error("❌ Erreur récupération commandes:", error.message);
            throw error;
        }
    },

    /**
     * Récupère les commandes d'un client spécifique (Front)
     */
    async getOrdersByCustomer(customerId) {
        try {
            const response = await axios.get(`${BASE_URL}/orders`, {
                auth: { username: WS_KEY, password: '' },
                params: { 
                    display: 'full',
                    'filter[id_customer]': customerId,
                    'sort': '[id_DESC]' 
                }
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const ordersData = result?.prestashop?.orders?.order;

            if (!ordersData) return [];

            // Utilisation du transformer sur chaque élément
            return asArray(ordersData).map(order => transformerOrder(order));
        } catch (error) {
            console.error("Erreur récupération commandes client:", error);
            throw error;
        }
    },

    async getOrderStates() {
        try {
            const response = await axios.get(`${BASE_URL}/order_states?display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const states = result?.prestashop?.order_states?.order_state || [];
            
            const statesArray = Array.isArray(states) ? states : [states];

            return statesArray.map(s => ({
                id: String(s.id),
                // extractVal est ta fonction utilitaire définie plus haut dans ton fichier
                name: extractVal(s.name), 
                color: s.color || '#333'
            }));
        } catch (error) {
            console.error("Erreur service getOrderStates:", error);
            return [];
        }
    },

    async updateOrderState(orderId, newStateId) {
        try {
            // On crée une entrée dans l'historique (order_histories)
            // C'est ce qui fait changer l'état officiellement dans PrestaShop
            const xmlOutput = `
            <prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
                <order_history>
                    <id_order>${orderId}</id_order>
                    <id_order_state>${newStateId}</id_order_state>
                </order_history>
            </prestashop>`.trim();

            await axios.post(`${BASE_URL}/order_histories`, xmlOutput, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });

            return true;
        } catch (error) {
            console.error("Détails de l'erreur historique :", error.response?.data || error.message);
            // Si le POST échoue, vérifie que les permissions pour 'order_histories' sont activées dans PrestaShop
            throw error;
        }
    }
};