import { getXml, postXml, putXml, deleteXml } from '@/service/api';

export const resetOrderTargets = [
    {
        key: 'orders',
        label: 'Commandes',
        endpoint: '/orders',
        collectionKey: 'orders',
        itemKey: 'order',
        skipIds: []
    },
    {
        key: 'carts',
        label: 'Paniers',
        endpoint: '/carts',
        collectionKey: 'carts',
        itemKey: 'cart',
        skipIds: []
    },
];

function parseAchat(achatString) {
    if (!achatString || !achatString.startsWith('[') || !achatString.endsWith(']')) {
        return [];
    }
    const content = achatString.slice(1, -1);
    const tuples = content.match(/\(.*?\)/g);
    if (!tuples) return [];

    return tuples.map(tuple => {
        const parts = tuple.slice(1, -1).split(';').map(p => p.trim().replace(/"/g, ''));
        return {
            ref: parts[0],
            qty: parseInt(parts[1], 10),
            variantName: parts[2] || null,
        };
    });
}

function getNodeText(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'object') return value['#text'] ?? null;
    return null;
}

function toNumber(value, fallback = 0) {
    const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function findVariantId(productId, variantName, logCallback) {
    if (!variantName) return 0;
    try {
        const combinationsResp = await getXml(`/combinations?filter[id_product]=[${productId}]&display=full`);
        if (!combinationsResp?.prestashop?.combinations?.combination) return null;
        let combinations = combinationsResp.prestashop.combinations.combination;
        if (!Array.isArray(combinations)) combinations = [combinations];

        for (const combo of combinations) {
            const associations = combo.associations.product_option_values.product_option_value;
            if (Array.isArray(associations)) { // Multiple attributes - simplified
                // In a real-world scenario, you might need to check all names
            } else {
                const optionValueId = getNodeText(associations.id);
                const valueResp = await getXml(`/product_option_values/${optionValueId}?display=[name]`);
                const nameNode = valueResp?.prestashop?.product_option_value?.name?.language;
                if (nameNode && nameNode['#text'].toLowerCase() === variantName.toLowerCase()) {
                    return getNodeText(combo.id);
                }
            }
        }
        logCallback('warn', `Aucune déclinaison trouvée pour le nom "${variantName}" sur le produit ${productId}`);
        return null;
    } catch (error) {
        logCallback('error', `Erreur recherche déclinaison "${variantName}": ${error.message}`);
        return null;
    }
}

async function getOrderStates(logCallback) {
    const statesMap = new Map();
    try {
        const statesResp = await getXml('/order_states?display=[id,name]');
        const states = statesResp?.prestashop?.order_states?.order_state;
        if (states && Array.isArray(states)) {
            for (const state of states) {
                const nameNode = state.name.language;
                const stateName = (Array.isArray(nameNode) ? nameNode[0]['#text'] : nameNode['#text']).toLowerCase();
                statesMap.set(stateName, state.id);
            }
        }
        logCallback('info', `${statesMap.size} états de commande chargés.`);
        return statesMap;
    } catch (error) {
        logCallback('error', `Impossible de charger les états de commande : ${error.message}`);
        return statesMap;
    }
}

async function getTaxRateForGroup(taxRulesGroupId, taxRateCache, logCallback) {
    if (!taxRulesGroupId || taxRulesGroupId === '0') return 0;
    if (taxRateCache[taxRulesGroupId] != null) return taxRateCache[taxRulesGroupId];

    try {
        const rulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${taxRulesGroupId}]&display=[id,id_tax]`);
        const rulesNode = rulesResp?.prestashop?.tax_rules?.tax_rule;
        const rules = Array.isArray(rulesNode) ? rulesNode : (rulesNode ? [rulesNode] : []);
        if (rules.length === 0) return 0;

        const taxId = getNodeText(rules[0].id_tax);
        const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
        const rate = toNumber(getNodeText(taxResp?.prestashop?.tax?.rate));
        taxRateCache[taxRulesGroupId] = rate;
        return rate;
    } catch (error) {
        logCallback('warn', `Impossible de récupérer le taux de taxe pour le groupe ${taxRulesGroupId}: ${error.message}`);
        return 0;
    }
}

export const processOrderImport = async (data, logCallback) => {
    const customerCache = {};
    const productCache = {};
    const taxRateCache = {};
    const orderStates = await getOrderStates(logCallback);
    
    if (orderStates.size === 0) {
        logCallback('error', "Arrêt de l'import : impossible de récupérer les états de commande.");
        return;
    }

    for (const [index, row] of data.entries()) {
        const createdEntities = { customer: null, address: null, cart: null, order: null };
        const rollback = async () => {
            logCallback('info', '--- Début du Rollback ---');
            if (createdEntities.order) await deleteXml(`/orders/${createdEntities.order}`).catch(e => logCallback('warn', `Rollback commande échoué: ${e.message}`));
            if (createdEntities.cart) await deleteXml(`/carts/${createdEntities.cart}`).catch(e => logCallback('warn', 'Rollback panier échoué: ' + e.message));
            if (createdEntities.address) await deleteXml(`/addresses/${createdEntities.address}`).catch(e => logCallback('warn', 'Rollback adresse échoué: ' + e.message));
            if (createdEntities.customer) await deleteXml(`/customers/${createdEntities.customer}`).catch(e => logCallback('warn', 'Rollback client échoué: ' + e.message));
            logCallback('info', '--- Fin du Rollback ---');
        };

        try {
            logCallback('info', `Traitement de la ligne ${index + 1}...`);
            const { date, nom, email, pwd, adresse, achat, etat } = row;

            const articles = parseAchat(achat);
            if (!email || articles.length === 0) {
                logCallback('warn', `Ligne ${index + 1} ignorée : email ou articles manquants.`);
                continue;
            }

            let customerId, addressId, secureKey;
            const customerNames = nom.split(' ');
            const firstname = customerNames.slice(0, -1).join(' ') || customerNames[0];
            const lastname = customerNames.slice(-1)[0];

            if (customerCache[email]) {
                customerId = customerCache[email].id;
                addressId = customerCache[email].addressId;
                secureKey = customerCache[email].secureKey;
            } else {
                const customerSearch = await getXml(`/customers?filter[email]=[${encodeURIComponent(email)}]&display=[id,secure_key]`);
                const existingCustomer = customerSearch?.prestashop?.customers?.customer;

                if (existingCustomer) {
                    customerId = getNodeText(existingCustomer.id);
                    secureKey = getNodeText(existingCustomer.secure_key);
                } else {
                    const customerPayload = { prestashop: { customer: { firstname, lastname, email, passwd: pwd || 'password', active: 1 } } };
                    const newCustomer = await postXml('/customers', customerPayload);
                    customerId = getNodeText(newCustomer.prestashop.customer.id);
                    createdEntities.customer = customerId;
                }
                if (!secureKey) {
                    const customerDetail = await getXml(`/customers/${customerId}?display=[secure_key]`);
                    secureKey = getNodeText(customerDetail?.prestashop?.customer?.secure_key);
                }
                const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&display=[id]`);
                const existingAddress = addressSearch?.prestashop?.addresses?.address;
                if (existingAddress) {
                    const addrNode = Array.isArray(existingAddress) ? existingAddress[0].id : existingAddress.id;
                    addressId = getNodeText(addrNode);
                } else {
                    const addressPayload = { prestashop: { address: { id_customer: customerId, alias: 'Adresse Principale', firstname, lastname, address1: adresse, city: 'Ville', id_country: 8, phone: '0102030405' } } };
                    const newAddress = await postXml('/addresses', addressPayload);
                    addressId = getNodeText(newAddress.prestashop.address.id);
                    createdEntities.address = addressId;
                }
                customerCache[email] = { id: customerId, addressId, secureKey };
            }

            let cartRows = [];
            let totalProductsHT = 0;
            let totalProductsWT = 0;
            for (const article of articles) {
                let productInfo = productCache[article.ref];
                if (!productInfo) {
                    const productSearch = await getXml(`/products?filter[reference]=[${encodeURIComponent(article.ref)}]&display=[id,price,id_tax_rules_group]`);
                    let product = productSearch?.prestashop?.products?.product;
                    if (!product) throw new Error(`Produit introuvable pour la référence ${article.ref}.`);
                    if (Array.isArray(product)) product = product[0];
                    const productId = getNodeText(product.id);
                    const productPriceHT = toNumber(getNodeText(product.price));
                    const taxGroupId = getNodeText(product.id_tax_rules_group) || '0';
                    const taxRate = await getTaxRateForGroup(taxGroupId, taxRateCache, logCallback);
                    const productPriceWT = productPriceHT * (1 + (taxRate / 100));
                    productInfo = {
                        id: productId,
                        priceHT: productPriceHT,
                        priceWT: productPriceWT,
                        taxGroupId,
                        taxRate
                    };
                    productCache[article.ref] = productInfo;
                }
                const variantId = await findVariantId(productInfo.id, article.variantName, logCallback);
                cartRows.push({
                    id_product: productInfo.id,
                    id_product_attribute: variantId || 0,
                    id_address_delivery: addressId,
                    quantity: article.qty,
                });
                totalProductsHT += productInfo.priceHT * article.qty;
                totalProductsWT += productInfo.priceWT * article.qty;
            }

            if (!Number.isFinite(totalProductsWT) || totalProductsWT <= 0) {
                throw new Error(`Total commande invalide (${totalProductsWT}).`);
            }

            logCallback('info', 'Étape 1: Création d\'un panier vide...');
            const emptyCartPayload = { prestashop: { cart: {
                id_currency: 1,
                id_lang: 1,
                id_customer: customerId,
                id_address_delivery: addressId,
                id_address_invoice: addressId,
                id_carrier: 1,
                id_shop: 1,
                id_shop_group: 1,
            }}};
            const newCart = await postXml('/carts', emptyCartPayload);
            createdEntities.cart = newCart.prestashop.cart.id;

            logCallback('info', `Étape 2: Ajout des produits au panier ${createdEntities.cart} (via Schéma Vierge)...`);

            const cleanPayload = {
                prestashop: {
                    cart: {
                        id: createdEntities.cart,
                        id_address_delivery: addressId,
                        id_address_invoice: addressId,
                        id_customer: customerId,
                        id_currency: 1,
                        id_lang: 1,
                        id_carrier: 1,
                        id_shop: 1,
                        id_shop_group: 1,
                        associations: {
                            cart_rows: {
                                cart_row: cartRows
                            }
                        }
                    }
                }
            };

            await putXml(`/carts/${createdEntities.cart}`, cleanPayload);

            logCallback('info', 'Étape 3: Création de la commande...');
            const currentStateId = orderStates.get(etat.toLowerCase()) || 2;
            const totalPaidWT = totalProductsWT.toFixed(6);
            const totalPaidHT = totalProductsHT.toFixed(6);
            logCallback('info', `Résumé panier: lignes=${cartRows.length}, total_ht=${totalPaidHT}, total_ttc=${totalPaidWT}`);
            logCallback('info', `Résumé commande: client=${customerId}, adresse=${addressId}, panier=${createdEntities.cart}, transporteur=1, état=${currentStateId}`);
            const orderPayload = {
                prestashop: {
                    order: {
                        id_customer: customerId,
                        id_address_delivery: addressId,
                        id_address_invoice: addressId,
                        id_cart: createdEntities.cart,
                        id_carrier: 1,
                        id_currency: 1,
                        id_lang: 1,
                        id_shop: 1,
                        id_shop_group: 1,
                        module: 'ps_checkpayment',
                        payment: 'Import CSV',
                        total_paid: totalPaidWT,
                        total_paid_real: '0.000000',
                        total_paid_tax_incl: totalPaidWT,
                        total_paid_tax_excl: totalPaidHT,
                        total_products: totalPaidHT,
                        total_products_wt: totalPaidWT,
                        total_shipping: '0.000000',
                        total_shipping_tax_excl: '0.000000',
                        total_shipping_tax_incl: '0.000000',
                        total_discounts: '0.000000',
                        total_discounts_tax_excl: '0.000000',
                        total_discounts_tax_incl: '0.000000',
                        total_wrapping: '0.000000',
                        total_wrapping_tax_excl: '0.000000',
                        total_wrapping_tax_incl: '0.000000',
                        conversion_rate: '1.000000',
                        current_state: currentStateId,
                        secure_key: secureKey || undefined
                    }
                }
            };
            
            const newOrder = await postXml('/orders', orderPayload);
            createdEntities.order = newOrder.prestashop.order.id;
            
            logCallback('info', `Étape 4: Mise à jour de la date de la commande ${createdEntities.order}...`);
            const [day, month, year] = date.split('/');
            const orderDatesPayload = {
                prestashop: {
                    order: {
                        id: createdEntities.order,
                        id_address_delivery: addressId,
                        id_address_invoice: addressId,
                        id_customer: customerId,
                        id_cart: createdEntities.cart,
                        id_currency: 1,
                        id_lang: 1,
                        id_carrier: 1,
                        id_shop: 1,
                        id_shop_group: 1,
                        module: 'ps_checkpayment',
                        payment: 'Import CSV',
                        current_state: currentStateId,
                        total_paid: totalPaidWT,
                        total_paid_real: '0.000000',
                        total_paid_tax_incl: totalPaidWT,
                        total_paid_tax_excl: totalPaidHT,
                        total_products: totalPaidHT,
                        total_products_wt: totalPaidWT,
                        total_shipping: '0.000000',
                        total_shipping_tax_excl: '0.000000',
                        total_shipping_tax_incl: '0.000000',
                        total_discounts: '0.000000',
                        total_discounts_tax_excl: '0.000000',
                        total_discounts_tax_incl: '0.000000',
                        total_wrapping: '0.000000',
                        total_wrapping_tax_excl: '0.000000',
                        total_wrapping_tax_incl: '0.000000',
                        conversion_rate: '1.000000',
                        secure_key: secureKey || undefined,
                        date_add: `${year}-${month}-${day} 12:00:00`,
                        invoice_date: `${year}-${month}-${day} 12:00:00`,
                        delivery_date: `${year}-${month}-${day} 12:00:00`
                    }
                }
            };
            await putXml(`/orders/${createdEntities.order}`, orderDatesPayload);

            logCallback('success', `Ligne ${index + 1} importée avec succès. Commande ID: ${createdEntities.order}`);

        } catch (error) {
            const apiError = error.response?.data || error.message;
            logCallback('error', `Erreur critique Ligne ${index + 1}: ${error.message}`);
            if(apiError) logCallback('error', `Détails API: ${apiError}`);
            await rollback();
        }
    }
    logCallback('success', 'Import des commandes terminé avec succès !');
};