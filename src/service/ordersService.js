// src/service/ordersService.js
import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop1/api';

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

// Permet de s'assurer que les données sont toujours traitées comme des tableaux, même s'il n'y en a qu'un seul
const asArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

// Extrait les lignes de stock d'une commande, en normalisant les différentes structures possibles de la réponse API
const extractStockRowsFromOrder = (order) => {
    const rows = asArray(order?.products || order?.associations?.order_rows?.order_row || []);

    return rows
        .map((row) => ({
            id_product: extractVal(row?.product_id || row?.id_product),
            id_product_attribute: extractVal(row?.product_attribute_id || row?.id_product_attribute || '0') || '0',
            quantity: Number(extractVal(row?.product_quantity || row?.quantity || row?.product_quantity_refunded || 0)) || 0
        }))
        .filter((row) => row.id_product && row.quantity > 0);
};

// Récupère le stock disponible pour un produit et une déclinaison donnée, en appliquant la logique de priorité id_shop_group > id_shop > global
const getStockAvailableNode = async (productId, productAttributeId) => {
    const response = await axios.get(
        `${BASE_URL}/stock_availables?display=full&filter[id_product]=[${productId}]&filter[id_product_attribute]=[${productAttributeId}]`,
        {
            auth: { username: WS_KEY, password: '' },
            responseType: 'text'
        }
    );

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const result = parser.parse(response.data);
    const stockNodes = result?.prestashop?.stock_availables?.stock_available || [];
    const stocks = Array.isArray(stockNodes) ? stockNodes : [stockNodes];

    const preferredStock = stocks.find((stock) => String(stock?.id_shop_group || '0') === '1')
        || stocks.find((stock) => String(stock?.id_shop || '0') === '1')
        || stocks[0];

    return preferredStock || null;
};

// Met à jour la quantité disponible d'un stock et crée un mouvement de stock associé
const updateStockAvailableQuantity = async (stockNode, quantity) => {
    if (!stockNode?.id) {
        throw new Error('Stock disponible introuvable.');
    }

    // IMPORTANT: On utilise le comportement standard de fast-xml-parser pour les attributs (préfixe @_ )
    const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: false });
    
    const stockId = extractVal(stockNode.id);
    const idProductAttribute = extractVal(stockNode.id_product_attribute);
    const idShop = extractVal(stockNode.id_shop);
    const idShopGroup = extractVal(stockNode.id_shop_group);
    const dependsOnStock = extractVal(stockNode.depends_on_stock);
    const outOfStock = extractVal(stockNode.out_of_stock);

    const stockPayload = {
        prestashop: {
            stock_available: {
                // 👇 C'EST ÇA QUI FIXE L'ERREUR 90 : On force l'attribut id="..." sur la balise <stock_available>
                '@_id': stockId, 
                
                id: stockId,
                id_product: extractVal(stockNode.id_product),
                id_product_attribute: idProductAttribute !== '' ? idProductAttribute : '0',
                id_shop: idShop !== '' ? idShop : '1',
                id_shop_group: idShopGroup !== '' ? idShopGroup : '0',
                quantity: String(Math.max(0, quantity)),
                depends_on_stock: dependsOnStock !== '' ? dependsOnStock : '0',
                out_of_stock: outOfStock !== '' ? outOfStock : '2'
            }
        }
    };

    const xml = xmlBuilder.build(stockPayload);

    try {
        await axios.put(`${BASE_URL}/stock_availables/${stockId}`, xml, {
            auth: { username: WS_KEY, password: '' },
            headers: { 'Content-Type': 'application/xml' }
        });
    } catch (error) {
        if (error?.response?.data) {
            console.error(`❌ Échec PrestaShop stock ${stockId} :`, error.response.data);
        } else {
            console.error(`❌ Erreur réseau / Axios stock ${stockId} :`, error.message);
        }
        throw error;
    }
};

let cachedStockMovementEmployeeId = null;
let cachedStockMovementReasonIds = {
    1: null,
    '-1': null
};

// Normalise les différentes structures possibles de la réponse API pour les mouvements de stock
const normalizeStockMovementList = (node) => {
    const raw = node?.stock_movement || node?.stock_movements || node || [];
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
};

// Résout l'ID de l'employé à associer aux mouvements de stock (obligatoire pour la création)
const resolveStockMovementEmployeeId = async () => {
    if (cachedStockMovementEmployeeId) return cachedStockMovementEmployeeId;

    try {
        const response = await axios.get(`${BASE_URL}/employees?display=full&limit=1`, {
            auth: { username: WS_KEY, password: '' },
            responseType: 'text'
        });

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
        const result = parser.parse(response.data);
        const employees = result?.prestashop?.employees;
        const employeeList = employees?.employee || employees || [];
        const firstEmployee = Array.isArray(employeeList) ? employeeList[0] : employeeList;
        const employeeId = Number.parseInt(extractVal(firstEmployee?.id), 10);

        cachedStockMovementEmployeeId = Number.isFinite(employeeId) && employeeId > 0 ? employeeId : 1;
    } catch (error) {
        cachedStockMovementEmployeeId = 1;
    }

    return cachedStockMovementEmployeeId;
};

// Résout l'ID de la raison de mouvement de stock à utiliser en fonction du signe (entrée ou sortie)
const resolveStockMovementReasonId = async (sign) => {
    const normalizedSign = Number(sign) >= 0 ? 1 : -1;
    if (cachedStockMovementReasonIds[normalizedSign]) return cachedStockMovementReasonIds[normalizedSign];

    const defaultConfigKey = normalizedSign > 0
        ? 'PS_STOCK_MVT_INC_REASON_DEFAULT'
        : 'PS_STOCK_MVT_DEC_REASON_DEFAULT';

    try {
        const configResponse = await axios.get(`${BASE_URL}/configurations?display=full&filter[name]=[${defaultConfigKey}]`, {
            auth: { username: WS_KEY, password: '' },
            responseType: 'text'
        });

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
        const configResult = parser.parse(configResponse.data);
        const configNode = configResult?.prestashop?.configurations?.configuration;
        const configItem = Array.isArray(configNode) ? configNode[0] : configNode;
        const configValue = Number.parseInt(extractVal(configItem?.value), 10);

        if (Number.isFinite(configValue) && configValue > 0) {
            cachedStockMovementReasonIds[normalizedSign] = configValue;
            return configValue;
        }
    } catch (error) {
        // fallback below
    }

    try {
        const response = await axios.get(`${BASE_URL}/stock_movement_reasons?display=full`, {
            auth: { username: WS_KEY, password: '' },
            responseType: 'text'
        });

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
        const result = parser.parse(response.data);
        const reasons = normalizeStockMovementList(result?.prestashop?.stock_movement_reasons);
        const reason = reasons.find((item) => Number.parseInt(extractVal(item?.sign), 10) === normalizedSign) || reasons[0];
        const reasonId = Number.parseInt(extractVal(reason?.id_stock_mvt_reason || reason?.id), 10);

        if (Number.isFinite(reasonId) && reasonId > 0) {
            cachedStockMovementReasonIds[normalizedSign] = reasonId;
            return reasonId;
        }
    } catch (error) {
        // fallback below
    }

    throw new Error(`Impossible de résoudre la raison de mouvement pour le signe ${normalizedSign}`);
};

// Crée un mouvement de stock en fonction de la variation de quantité d'un produit
const createStockMovement = async ({ stockNode, oldQuantity, newQuantity, orderId = null }) => {
    const delta = newQuantity - oldQuantity;
    if (delta === 0) return null;

    const sign = delta > 0 ? 1 : -1;
    const physicalQuantity = Math.abs(delta);
    
    let idReasonRaw = await resolveStockMovementReasonId(sign);
    let idStockMovementReason = Number.parseInt(extractVal(idReasonRaw), 10);
    if (!idStockMovementReason || Number.isNaN(idStockMovementReason)) {
        idStockMovementReason = sign > 0 ? 1 : 2;
    }

    const builder = new XMLBuilder({ 
        ignoreAttributes: true, 
        format: false 
    });

    const movementPayload = {
        prestashop: {
            stock_movement: {
                id_stock: String(extractVal(stockNode?.id)),
                id_employee: "1", 
                id_stock_mvt_reason: String(idStockMovementReason),
                id_order: orderId ? String(orderId) : "0",
                physical_quantity: String(physicalQuantity),
                sign: String(sign),
                price_te: "0.000000",
                // 👇 ON REAJOUTE LA DATE REQUISE ICI
                date_add: new Date().toISOString().slice(0, 19).replace('T', ' ')
            }
        }
    };

    const xml = builder.build(movementPayload);

    // 🔬 ESPION : Affiche le XML généré dans ta console de dev
    console.log("--- XML ENVOYÉ À PRESTASHOP ---");
    console.log(xml);
    console.log("--------------------------------");

    try {
        await axios.post(`${BASE_URL}/stock_movements`, xml, {
            auth: { username: WS_KEY, password: '' },
            headers: { 'Content-Type': 'application/xml' }
        });
    } catch (error) {
        if (error?.response?.data) {
            console.error(`❌ Erreur critique Stock Movement :`, error.response.data);
        } else {
            console.error(`❌ Erreur réseau Stock Movement :`, error.message);
        }
        throw error;
    }
};

// Normalise les lignes de panier extraites pour les préparer à la mise à jour du panier avant création de commande
const normalizeDuplicateStockRows = (cart) => {
    const rows = asArray(cart?.associations?.cart_rows?.cart_row || []);

    return rows
        .map((row) => ({
            id_product: extractVal(row?.id_product),
            id_product_attribute: extractVal(row?.id_product_attribute || '0') || '0',
            quantity: Number(extractVal(row?.quantity || 0)) || 0
        }))
        .filter((row) => row.id_product && row.quantity > 0);
};

/**
 * transformerOrder : Le "Nettoyeur"
 * Transforme une commande XML brute en objet JS propre et utilisable.
 */
const transformerOrder = (o) => {
    // Extraire les totaux TTC et HT si disponibles
    const totalTTC = parseFloat(extractVal(o.total_paid_tax_incl || o.total_paid)) || 0;
    const totalHT = parseFloat(extractVal(o.total_paid_tax_excl || o.total_products)) || 0;
    const totalShipping = parseFloat(extractVal(o.total_shipping_tax_incl || o.total_shipping)) || 0;
    
    return {
        id: extractVal(o.id),
        reference: extractVal(o.reference),
        id_customer: extractVal(o.id_customer),
        id_cart: extractVal(o.id_cart),
        id_address_delivery: extractVal(o.id_address_delivery),
        id_address_invoice: extractVal(o.id_address_invoice),
        id_carrier: extractVal(o.id_carrier),
        // Montants TTC (Toutes Taxes Comprises) et HT (Hors Taxes)
        total_paid: totalTTC.toFixed(2), // TTC par défaut (montant réel payé)
        total_paid_tax_incl: totalTTC.toFixed(2), // TTC explicite
        total_paid_tax_excl: totalHT.toFixed(2), // HT explicite
        total_products: totalHT.toFixed(2),
        total_products_wt: totalTTC.toFixed(2),
        total_shipping: totalShipping.toFixed(2),
        total_shipping_tax_incl: totalShipping.toFixed(2),
        total_shipping_tax_excl: totalShipping.toFixed(2),
        payment: extractVal(o.payment),
        date_add: extractVal(o.date_add),
        current_state: extractVal(o.current_state),
        module: extractVal(o.module),
        // On peut même préparer les associations si besoin plus tard
        products: asArray(o.associations?.order_rows?.order_row || [])
    };
};

export default {
    // Récupère la liste des états de commande
    async getStockMovementsHistory() {
        try {
            const response = await axios.get(`${BASE_URL}/stock_movements`, {
                auth: { username: WS_KEY, password: '' },
                params: {
                    output_format: 'JSON',
                    display: 'full'
                }
            });

            const payload = response.data;
            const movementsNode = payload?.stock_mvts
                || payload?.stock_movements?.stock_movement
                || payload?.stock_movements
                || payload?.prestashop?.stock_movements?.stock_movement
                || [];

            const movements = Array.isArray(movementsNode) ? movementsNode : (movementsNode ? [movementsNode] : []);

            return movements.map((movement) => ({
                id: movement.id_stock_mvt ?? movement.id ?? '',
                id_stock: movement.id_stock ?? '',
                id_order: movement.id_order ?? '',
                id_stock_mvt_reason: movement.id_stock_mvt_reason ?? '',
                id_employee: movement.id_employee ?? '',
                employee_firstname: movement.employee_firstname ?? '',
                employee_lastname: movement.employee_lastname ?? '',
                physical_quantity: Number(movement.physical_quantity ?? 0),
                date_add: movement.date_add ?? '',
                sign: Number(movement.sign ?? 0),
                price_te: Number(movement.price_te ?? 0),
                last_wa: Number(movement.last_wa ?? 0),
                current_wa: Number(movement.current_wa ?? 0),
                referer: movement.referer ?? ''
            }));
        } catch (error) {
            console.error('Erreur récupération historique mouvements:', error);
            throw error;
        }
    },

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

    // Récupère la liste des états de commande
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

    // Récupère l'historique d'une commande (états précédents, dates, employés associés)
    async getOrderHistory(orderId) {
        try {
            const response = await axios.get(`${BASE_URL}/order_histories`, {
                auth: { username: WS_KEY, password: '' },
                params: {
                    output_format: 'JSON',
                    display: 'full'
                },
                responseType: 'json'
            });

            const payload = response.data;
            const historiesNode = payload?.order_histories?.order_history
                || payload?.order_histories
                || payload?.prestashop?.order_histories?.order_history
                || [];

            const histories = asArray(historiesNode).filter((history) => String(history?.id_order ?? '') === String(orderId));

            return asArray(histories).map((history) => ({
                id: String(history.id ?? history.id_order_history ?? ''),
                id_order: String(history.id_order ?? ''),
                id_order_state: String(history.id_order_state ?? ''),
                date_add: String(history.date_add ?? ''),
                employee_firstname: String(history.employee_firstname ?? ''),
                employee_lastname: String(history.employee_lastname ?? '')
            }));
        } catch (error) {
            console.error('Erreur récupération historique commande:', error);
            throw error;
        }
    },

    // Vérifie la disponibilité en stock des produits d'un panier avant création de commande
    async checkDuplicateStockAvailability(cart, multiplier = 1) {
        const stockRows = normalizeDuplicateStockRows(cart);
        const factor = Math.max(1, parseInt(multiplier, 10) || 1);
        const shortages = [];

        for (const row of stockRows) {
            const requestedQuantity = row.quantity * factor;
            const stockNode = await getStockAvailableNode(row.id_product, row.id_product_attribute);
            const availableQuantity = Number(extractVal(stockNode?.quantity)) || 0;

            if (availableQuantity < requestedQuantity) {
                shortages.push({
                    id_product: row.id_product,
                    id_product_attribute: row.id_product_attribute,
                    requested: requestedQuantity,
                    available: availableQuantity,
                    missing: requestedQuantity - availableQuantity
                });
            }
        }

        return {
            ok: shortages.length === 0,
            shortages
        };
    },

    // Met à jour l'état d'une commande en créant une nouvelle entrée dans l'historique
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
    },

    // Restaure le stock réservé d'une commande annulée ou retournée
    async restoreOrderReservedStock(order) {
        const stockRows = extractStockRowsFromOrder(order);

        if (!stockRows.length) {
            return { updated: 0 };
        }

        let updated = 0;

        for (const row of stockRows) {
            const stockNode = await getStockAvailableNode(row.id_product, row.id_product_attribute);
            if (!stockNode?.id) {
                continue;
            }

            const currentQuantity = Number(extractVal(stockNode.quantity)) || 0;
            await updateStockAvailableQuantity(stockNode, currentQuantity + row.quantity);
            updated += 1;
        }

        return { updated };
    },

    // Consomme le stock réservé d'une commande validée (passage de "en attente" à "validée")
    async consumeOrderReservedStock(order) {
        const stockRows = extractStockRowsFromOrder(order);

        if (!stockRows.length) {
            return { updated: 0, movements: 0 };
        }

        let updated = 0;
        let movements = 0;

        for (const row of stockRows) {
            const stockNode = await getStockAvailableNode(row.id_product, row.id_product_attribute);
            if (!stockNode?.id) {
                continue;
            }

            const currentQuantity = Number(extractVal(stockNode.quantity)) || 0;
            const nextQuantity = Math.max(0, currentQuantity - row.quantity);

            await updateStockAvailableQuantity(stockNode, nextQuantity);
            updated += 1;

            try {
                await createStockMovement({
                    stockNode,
                    oldQuantity: currentQuantity,
                    newQuantity: nextQuantity,
                    orderId: extractVal(order?.id)
                });
                movements += 1;
            } catch (movementError) {
                console.warn(
                    `Mouvement de stock non enregistré pour la commande ${extractVal(order?.id)}:`,
                    movementError?.response?.data || movementError?.message || movementError
                );
            }
        }

        return { updated, movements };
    }
};