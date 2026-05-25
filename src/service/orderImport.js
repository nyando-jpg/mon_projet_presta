import { getXml, postXml, putXml, deleteXml, getPrestaShopConfig, formatApiError } from './api';
import { runResetForTargets } from './resetService';
import { resetTargets } from './resetTargets';
import { getProductTaxRate } from './price';

export const resetOrderTargets = [
    { key: 'orders', label: 'Commandes', endpoint: '/orders', collectionKey: 'orders', itemKey: 'order', skipIds: [] },
    { key: 'addresses', label: 'Adresses Clients', endpoint: '/addresses', collectionKey: 'addresses', itemKey: 'address', skipIds: [] },
    { key: 'customers', label: 'Clients', endpoint: '/customers', collectionKey: 'customers', itemKey: 'customer', skipIds: [] }
];

export const rollbackOrders = async (logCallback) => {
    logCallback('info', 'Lancement de la réinitialisation des commandes...');
    await runResetForTargets(resetOrderTargets, (type, message) => {
        logCallback(type, `Rollback: ${message}`);
    });
    logCallback('info', 'Réinitialisation terminée.');
};

function cleanQuotes(str) {
    return str.replace(/[\u2018\u2019\u201A\u201B\u2032\u2039\u0027']/g, "'").replace(/[\u201C\u201D\u201E\u2033\u203A\u0022"]/g, '"').replace(/\u00A0/g, ' ').trim();
}

function parseAchat(achatString) {
    if (!achatString) return [];
    const cleanStr = cleanQuotes(achatString);
    if (!cleanStr.includes('[')) return [];
    const content = cleanStr.substring(cleanStr.indexOf('[') + 1, cleanStr.lastIndexOf(']')).trim();
    if (!content) return [];
    const items = [];
    let currentItem = '';
    let inTuple = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '(') { inTuple = true; currentItem = ''; }
        else if (char === ')') { inTuple = false; items.push(currentItem); }
        else if (inTuple) currentItem += char;
    }
    return items.map(item => {
        const parts = item.split(';').map(p => cleanQuotes(p).replace(/^"|"$/g, '').trim());
        return { reference: parts[0] || '', quantite: parseInt(parts[1], 10) || 1, variante: parts[2] || '' };
    });
}

function generateOrderReference() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 9; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function resolveOrderStateId(etatRaw) {
    const value = String(etatRaw || '').toLowerCase();
    if (value.includes('livr')) return 5;
    if (value.includes('annul') || value.includes('cancel')) return 6;
    if (value.includes('accept') || value.includes('pay') || value.includes('paiement')) return 2;
    return 6;
}

function extractId(node) {
    if (node === undefined || node === null) return '';
    if (typeof node === 'object') return String(node['#text'] || node['@_id'] || node.id || '');
    return String(node);
}

function getLangText(field) {
    if (!field || !field.language) return '';
    if (Array.isArray(field.language)) return field.language[0]['#text'];
    return field.language['#text'];
}

// ============================================================================
// TRACER LE MOUVEMENT SANS TOUCHER AU STOCK PHYSIQUE
// ============================================================================
async function logOrderMovement(pId, attributeId, quantity, orderId, employeeId, logCallback, customDate = '') {
    try {
        const dateAdd = customDate ? `${customDate} 12:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');
        const attrFilter = attributeId ? attributeId : 0;
        if (logCallback) logCallback('debug', `logOrderMovement called: order=${orderId} product=${pId} attr=${attrFilter} qty=${quantity} employee=${employeeId}`);

        // 1. Récupérer l'ID du stock_available correspondant pour pouvoir faire un mapping robuste
        const stockList = await getXml(`/stock_availables?filter[id_product]=[${pId}]&filter[id_product_attribute]=[${attrFilter}]&display=full`);
        const stockItems = stockList?.prestashop?.stock_availables?.stock_available;
        const stocks = Array.isArray(stockItems) ? stockItems : (stockItems ? [stockItems] : []);

        if (!stocks.length) {
            if (logCallback) logCallback('warn', `⚠️ Mouvement non tracé (stock introuvable) pour produit ${pId}.`);
            return;
        }

        const stockToUse = stocks.find(s => String(s.id_shop_group?.['#text'] ?? s.id_shop_group) === '0') || stocks[0];
        const stockAvailableId = String(stockToUse.id?.['#text'] ?? stockToUse.id ?? '0');
        if (logCallback) logCallback('debug', `Using stock_available id ${stockAvailableId} for product ${pId}`);

        if (!stockAvailableId || stockAvailableId === '0') {
            if (logCallback) logCallback('warn', `⚠️ Mouvement non tracé (stock_available invalide) pour produit ${pId}.`);
            return;
        }

        // 2. Eviter les doublons : vérifier si un mouvement identique existe déjà
        try {
            if (logCallback) logCallback('debug', `Checking existing stock_movements for order ${orderId}, product ${pId}, attr ${attrFilter}`);
            const existingList = await getXml(`/stock_movements?filter[id_order]=[${orderId}]&display=full`);
            const existingItems = existingList?.prestashop?.stock_movements?.stock_mvt || existingList?.prestashop?.stock_mvts?.stock_mvt || existingList?.prestashop?.stock_mvt;
            const existingArray = Array.isArray(existingItems) ? existingItems : (existingItems ? [existingItems] : []);
            if (logCallback) logCallback('debug', `Found ${existingArray.length} existing stock movement(s) for order ${orderId} product ${pId}`);

            const duplicate = existingArray.find(m => {
                const mStockId = String(m.id_stock?.['#text'] ?? m.id_stock ?? '');
                const mOrderId = String(m.id_order?.['#text'] ?? m.id_order ?? '');
                const mSupplyOrderId = String(m.id_supply_order?.['#text'] ?? m.id_supply_order ?? '0');

                const matchesStock = mStockId === String(stockAvailableId);
                const matchesLegacy = (mStockId === '0' || mStockId === '') && mOrderId === String(pId) && mSupplyOrderId === String(attrFilter);

                const sign = String(m.sign?.['#text'] ?? m.sign ?? '');
                const qty = Number(m.physical_quantity?.['#text'] ?? m.physical_quantity ?? 0);

                return (matchesStock || matchesLegacy) && sign === '-1' && qty === Number(quantity);
            });

            if (duplicate) {
                const dupDate = String(duplicate.date_add?.['#text'] ?? duplicate.date_add ?? '').substring(0, 10);
                const targetDateOnly = customDate || new Date().toISOString().slice(0, 10);
                if (dupDate !== targetDateOnly) {
                    if (logCallback) logCallback('info', `🔄 Remplacement du mouvement automatique (date: ${dupDate}) par le mouvement historique (date: ${targetDateOnly}).`);
                    const dupId = extractId(duplicate.id);
                    await deleteXml(`/stock_movements/${dupId}`);
                } else {
                    if (logCallback) logCallback('info', `⤴️ Mouvement existant détecté pour commande ${orderId}, produit ${pId} (var:${attrFilter}) — saut.`);
                    return;
                }
            }
        } catch (e) {
            console.error('Impossible de lire les mouvements existants:', e);
            if (logCallback) logCallback('warn', `Impossible de lire les mouvements existants pour vérification: ${formatApiError(e)}`);
            // en cas d'erreur sur la lecture des mouvements, continuer et tenter d'en créer un nouveau
        }

        const reasonConfig = await getPrestaShopConfig('PS_STOCK_CUSTOMER_ORDER_REASON');
        const reasonId = reasonConfig?.value ?? 3;

        const baseXml = `
            <id_order><![CDATA[${orderId}]]></id_order>
            <id_product><![CDATA[${pId}]]></id_product>
            <id_product_attribute><![CDATA[${attrFilter}]]></id_product_attribute>
            <id_employee><![CDATA[${employeeId}]]></id_employee>
            <id_stock><![CDATA[${stockAvailableId}]]></id_stock>
            <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
            <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
            <sign><![CDATA[-1]]></sign>
            <price_te><![CDATA[0.000000]]></price_te>
            <date_add><![CDATA[${dateAdd}]]></date_add>
        `;
        const resp = await postXml('/stock_movements', `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop><stock_mvt>${baseXml}</stock_mvt></prestashop>`);
        const createdId = extractId(resp?.prestashop?.stock_mvt?.id);

        if (createdId && customDate) {
            if (logCallback) logCallback('debug', `Updating date_add for stock movement ${createdId} to ${dateAdd}`);
            const putPayload = `<?xml version="1.0" encoding="UTF-8"?>
            <prestashop>
                <stock_mvt>
                    <id>${createdId}</id>
                    <id_employee><![CDATA[${employeeId}]]></id_employee>
                    <id_stock><![CDATA[${stockAvailableId}]]></id_stock>
                    <physical_quantity><![CDATA[${quantity}]]></physical_quantity>
                    <id_stock_mvt_reason><![CDATA[${reasonId}]]></id_stock_mvt_reason>
                    <sign><![CDATA[-1]]></sign>
                    <price_te><![CDATA[0.000000]]></price_te>
                    <date_add><![CDATA[${dateAdd}]]></date_add>
                </stock_mvt>
            </prestashop>`;
            await putXml(`/stock_movements/${createdId}`, putPayload);
        }

        if (logCallback) logCallback('success', `📦 Mouvement tracé dans l'historique pour le produit ${pId} (-${quantity}). id:${createdId || 'unknown'}`);
    } catch (e) {
        console.error('Impossible de tracer le mouvement:', e);
        if (logCallback) logCallback('warn', `⚠️ Impossible de tracer le mouvement : ${formatApiError(e)}`);
    }
}

async function forceOrderState(orderId, stateId, logCallback, options = {}) {
    const { employeeId = 0, date = '' } = options;

    const payload = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop>
        <order_history>
            <id_order><![CDATA[${orderId}]]></id_order>
            <id_order_state><![CDATA[${stateId}]]></id_order_state>
            ${date ? `<date_add><![CDATA[${date} 12:00:00]]></date_add>` : ''}
        </order_history>
    </prestashop>`;

    const legacyPayload = `<?xml version="1.0" encoding="UTF-8"?>
    <prestashop>
        <manual_order_state>
            <id_order><![CDATA[${orderId}]]></id_order>
            <id_order_state><![CDATA[${stateId}]]></id_order_state>
            <id_employee><![CDATA[${employeeId}]]></id_employee>
            <date><![CDATA[${date}]]></date>
        </manual_order_state>
    </prestashop>`;

    try {
        // Native PrestaShop path: this is the most portable way to set an order state.
        await postXml('/order_histories', payload);
        if (logCallback) logCallback('info', `✅ État de la commande #${orderId} forcé au statut ${stateId}.`);
    } catch (error) {
        // Legacy fallback kept for instances where a custom endpoint exists.
        try {
            await postXml('/custom_order_state', legacyPayload);
            if (logCallback) logCallback('info', `✅ État de la commande #${orderId} forcé via endpoint custom (${stateId}).`);
        } catch (customErr) {
            console.error("Impossible de forcer l'état de la commande:", customErr);
            if (logCallback) {
                logCallback('warn', `⚠️ Échec /order_histories puis /custom_order_state: ${formatApiError(error)} | Fallback: ${formatApiError(customErr)}`);
            }
        }
    }
}

export const processOrderImport = async (data, logCallback) => {
    if (!data || data.length === 0) { logCallback('warn', 'CSV vide.'); return; }
    data = data.map(row => { const newRow = {}; for (const key in row) newRow[key.trim().toLowerCase()] = row[key]; return newRow; });
    const employeeId = 1;

    try {
        for (const [index, row] of data.entries()) {
            const nom = row.nom ? String(row.nom).trim() : 'Client';
            const email = row.email ? String(row.email).trim() : '';
            const password = row.pwd ? String(row.pwd).trim() : '123456789';
            const adresseRaw = row.adresse ? String(row.adresse).trim() : 'Antananarivo';
            const dateRaw = row.date ? String(row.date).trim() : '';
            const etatRaw = row.etat ? String(row.etat).trim().toLowerCase() : '';
            const achats = parseAchat(row.achat);

            if (!email) continue;
            logCallback('info', `--- Ligne ${index + 1} (Client : ${nom}) ---`);

            let customerId = null;
            const customerSearch = await getXml(`/customers?filter[email]=[${email}]&display=[id]`);
            let existingCustomer = customerSearch?.prestashop?.customers?.customer;

            if (existingCustomer) {
                customerId = extractId(Array.isArray(existingCustomer) ? existingCustomer[0].id : existingCustomer.id);
            } else {
                const customerPayload = `<?xml version="1.0" encoding="UTF-8"?>
                <prestashop><customer>
                    <lastname><![CDATA[${nom}]]></lastname><firstname><![CDATA[Client]]></firstname>
                    <email><![CDATA[${email}]]></email><passwd><![CDATA[${password}]]></passwd>
                    <id_default_group><![CDATA[3]]></id_default_group><active><![CDATA[1]]></active>
                    <associations><groups><group><id><![CDATA[3]]></id></group></groups></associations>
                </customer></prestashop>`;
                const newCustomerResp = await postXml('/customers', customerPayload);
                customerId = extractId(newCustomerResp?.prestashop?.customer?.id);
            }

            let addressId = null;
            const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&display=[id]`);
            let existingAddress = addressSearch?.prestashop?.addresses?.address;

            if (existingAddress) {
                addressId = extractId(Array.isArray(existingAddress) ? existingAddress[0].id : existingAddress.id);
            } else {
                const addressPayload = `<?xml version="1.0" encoding="UTF-8"?>
                <prestashop><address>
                    <id_customer><![CDATA[${customerId}]]></id_customer><id_country><![CDATA[8]]></id_country>
                    <alias><![CDATA[Mon Adresse]]></alias><lastname><![CDATA[${nom}]]></lastname><firstname><![CDATA[Client]]></firstname>
                    <address1><![CDATA[${adresseRaw}]]></address1><city><![CDATA[Antananarivo]]></city><phone><![CDATA[0340000000]]></phone>
                </address></prestashop>`;
                const newAddressResp = await postXml('/addresses', addressPayload);
                addressId = extractId(newAddressResp?.prestashop?.address?.id);
            }

            let cartRowsXml = '';
            let orderRowsXml = '';
            let cartTotalHt = 0;
            let cartTotalTtc = 0;
            const linesToDecrement = [];

            const mergedAchats = [];
            for (const achat of achats) {
                const existing = mergedAchats.find(a => a.reference === achat.reference && a.variante === achat.variante);
                if (existing) {
                    existing.quantite += achat.quantite;
                } else {
                    mergedAchats.push({ ...achat });
                }
            }

            for (const achat of mergedAchats) {
                const prodSearch = await getXml(`/products?filter[reference]=[${achat.reference}]&display=[id,price,name]`);
                let prod = prodSearch?.prestashop?.products?.product;
                if (!prod) continue;
                if (Array.isArray(prod)) prod = prod[0];

                const pId = extractId(prod.id);
                let basePriceHt = parseFloat(prod.price) || 0;
                let prodName = getLangText(prod.name) || 'Produit';
                let attributeId = 0;

                if (achat.variante) {
                    const combSearch = await getXml(`/combinations?filter[id_product]=[${pId}]&filter[reference]=[${achat.reference}_${achat.variante}]&display=[id,price]`);
                    let comb = combSearch?.prestashop?.combinations?.combination;
                    if (comb) {
                        attributeId = extractId(Array.isArray(comb) ? comb[0].id : comb.id);
                        basePriceHt += parseFloat(Array.isArray(comb) ? comb[0].price : comb.price) || 0;
                        prodName += ` - ${achat.variante}`;
                    }
                }

                const taxRate = await getProductTaxRate(pId);
                const basePriceTtc = basePriceHt * (1 + taxRate / 100);

                const lineTotalHt = basePriceHt * achat.quantite;
                const lineTotalTtc = basePriceTtc * achat.quantite;

                cartTotalHt += lineTotalHt;
                cartTotalTtc += lineTotalTtc;

                linesToDecrement.push({ pId, attributeId, quantity: achat.quantite });

                cartRowsXml += `<cart_row><id_product><![CDATA[${pId}]]></id_product><id_product_attribute><![CDATA[${attributeId}]]></id_product_attribute><id_address_delivery><![CDATA[${addressId}]]></id_address_delivery><quantity><![CDATA[${achat.quantite}]]></quantity></cart_row>`;
                orderRowsXml += `<order_row><product_id><![CDATA[${pId}]]></product_id><product_attribute_id><![CDATA[${attributeId}]]></product_attribute_id><product_quantity><![CDATA[${achat.quantite}]]></product_quantity><product_name><![CDATA[${prodName}]]></product_name><product_reference><![CDATA[${achat.reference}]]></product_reference><product_price><![CDATA[${basePriceHt.toFixed(6)}]]></product_price><unit_price_tax_incl><![CDATA[${basePriceTtc.toFixed(6)}]]></unit_price_tax_incl><unit_price_tax_excl><![CDATA[${basePriceHt.toFixed(6)}]]></unit_price_tax_excl></order_row>`;
            }

            let formattedDate = null;
            if (dateRaw && dateRaw.trim() !== '') {
                const trimmedDate = dateRaw.trim();
                const dateRegexDmy = /^\d{2}\/\d{2}\/\d{4}$/;

                if (!dateRegexDmy.test(trimmedDate)) {
                    throw new Error(`La date ("${dateRaw}") ne respecte pas le format strict DD/MM/YYYY.`);
                }

                const parts = trimmedDate.split('/');
                formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                formattedDate = new Date().toISOString().slice(0, 10);
            }

            if (!cartRowsXml) { logCallback('warn', `Panier vide pour la ligne ${index + 1}, ignorée.`); continue; }

            const cartPayload = `<?xml version="1.0" encoding="UTF-8"?><prestashop><cart><id_customer><![CDATA[${customerId}]]></id_customer><id_address_delivery><![CDATA[${addressId}]]></id_address_delivery><id_address_invoice><![CDATA[${addressId}]]></id_address_invoice><id_currency><![CDATA[1]]></id_currency><id_lang><![CDATA[1]]></id_lang><associations><cart_rows>${cartRowsXml}</cart_rows></associations></cart></prestashop>`;
            const newCartResp = await postXml('/carts', cartPayload);
            const cartId = extractId(newCartResp?.prestashop?.cart?.id);

            if (!cartId) {
                if (logCallback) logCallback('error', `Erreur critique: Impossible de récupérer l'ID du panier pour la ligne ${index + 1}.`);
                continue;
            }

            if (!etatRaw || etatRaw === '') { logCallback('warn', `Ligne ${index + 1} : Panier Abandonné #${cartId} conservé.`); continue; }

            const orderStateId = resolveOrderStateId(etatRaw);
            if (logCallback) {
                logCallback('info', `État import: "${etatRaw}" -> ${orderStateId}`);
            }
            const orderRef = generateOrderReference();

            const orderPayload = `<?xml version="1.0" encoding="UTF-8"?><prestashop><order><id_address_delivery><![CDATA[${addressId}]]></id_address_delivery><id_address_invoice><![CDATA[${addressId}]]></id_address_invoice><id_cart><![CDATA[${cartId}]]></id_cart><id_currency><![CDATA[1]]></id_currency><id_lang><![CDATA[1]]></id_lang><id_customer><![CDATA[${customerId}]]></id_customer><id_carrier><![CDATA[1]]></id_carrier><id_shop_group><![CDATA[1]]></id_shop_group><id_shop><![CDATA[1]]></id_shop><current_state><![CDATA[${orderStateId}]]></current_state><reference><![CDATA[${orderRef}]]></reference><module><![CDATA[ps_wirepayment]]></module><payment><![CDATA[Paiement importé]]></payment><total_paid><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid><total_paid_tax_incl><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid_tax_incl><total_paid_tax_excl><![CDATA[${cartTotalHt.toFixed(6)}]]></total_paid_tax_excl><total_paid_real><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid_real><total_products><![CDATA[${cartTotalHt.toFixed(6)}]]></total_products><total_products_wt><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_products_wt><total_shipping><![CDATA[0.000000]]></total_shipping><total_shipping_tax_incl><![CDATA[0.000000]]></total_shipping_tax_incl><total_shipping_tax_excl><![CDATA[0.000000]]></total_shipping_tax_excl><total_discounts><![CDATA[0.000000]]></total_discounts><total_wrapping><![CDATA[0.000000]]></total_wrapping><conversion_rate><![CDATA[1.000000]]></conversion_rate><date_add><![CDATA[${formattedDate} 12:00:00]]></date_add><date_upd><![CDATA[${formattedDate} 12:00:00]]></date_upd><associations><order_rows>${orderRowsXml}</order_rows></associations></order></prestashop>`;

            const newOrderResp = await postXml('/orders', orderPayload);
            const orderId = extractId(newOrderResp?.prestashop?.order?.id);

            if (orderId) {
                if (logCallback) logCallback('debug', `Order created: id=${orderId} ref=${orderRef} cart=${cartId} state=${orderStateId}`);

                // Mettre à jour la date de la commande à la date historique du CSV via un PUT Webservice standard
                try {
                    if (logCallback) logCallback('debug', `Updating order date for order ${orderId} to ${formattedDate}`);
                    const putPayload = `<?xml version="1.0" encoding="UTF-8"?><prestashop><order><id>${orderId}</id><id_address_delivery><![CDATA[${addressId}]]></id_address_delivery><id_address_invoice><![CDATA[${addressId}]]></id_address_invoice><id_cart><![CDATA[${cartId}]]></id_cart><id_currency><![CDATA[1]]></id_currency><id_lang><![CDATA[1]]></id_lang><id_customer><![CDATA[${customerId}]]></id_customer><id_carrier><![CDATA[1]]></id_carrier><id_shop_group><![CDATA[1]]></id_shop_group><id_shop><![CDATA[1]]></id_shop><current_state><![CDATA[${orderStateId}]]></current_state><reference><![CDATA[${orderRef}]]></reference><module><![CDATA[ps_wirepayment]]></module><payment><![CDATA[Paiement importé]]></payment><total_paid><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid><total_paid_tax_incl><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid_tax_incl><total_paid_tax_excl><![CDATA[${cartTotalHt.toFixed(6)}]]></total_paid_tax_excl><total_paid_real><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_paid_real><total_products><![CDATA[${cartTotalHt.toFixed(6)}]]></total_products><total_products_wt><![CDATA[${cartTotalTtc.toFixed(6)}]]></total_products_wt><total_shipping><![CDATA[0.000000]]></total_shipping><total_shipping_tax_incl><![CDATA[0.000000]]></total_shipping_tax_incl><total_shipping_tax_excl><![CDATA[0.000000]]></total_shipping_tax_excl><total_discounts><![CDATA[0.000000]]></total_discounts><total_wrapping><![CDATA[0.000000]]></total_wrapping><conversion_rate><![CDATA[1.000000]]></conversion_rate><date_add><![CDATA[${formattedDate} 12:00:00]]></date_add><date_upd><![CDATA[${formattedDate} 12:00:00]]></date_upd><associations><order_rows>${orderRowsXml}</order_rows></associations></order></prestashop>`;
                    await putXml(`/orders/${orderId}`, putPayload);
                    if (logCallback) logCallback('info', `📅 Date de la commande #${orderId} mise à jour avec succès vers ${formattedDate}.`);
                } catch (dateErr) {
                    console.error(`Impossible de mettre à jour la date historique de la commande #${orderId}:`, dateErr);
                    if (logCallback) logCallback('warn', `⚠️ Impossible de mettre à jour la date historique de la commande #${orderId}: ${formatApiError(dateErr)}`);
                }

                if (logCallback) logCallback('debug', `Forcing state ${orderStateId} for order ${orderId}`);
                await forceOrderState(orderId, orderStateId, logCallback, {
                    employeeId,
                    date: formattedDate
                });

                if (orderStateId === 5) {
                    for (const line of linesToDecrement) {
                        if (logCallback) logCallback('debug', `Preparing movement check for order ${orderId} product ${line.pId} attr ${line.attributeId} qty ${line.quantity}`);
                        await logOrderMovement(line.pId, line.attributeId, line.quantity, orderId, employeeId, logCallback, formattedDate);
                    }
                }

                logCallback('success', `Commande ID ${orderId} importée avec succès.`);
            } else {
                logCallback('error', `Échec de création de la commande à la ligne ${index + 1}. Suppression du panier fantôme.`);
                try { await deleteXml(`/carts/${cartId}`); } catch (delErr) { logCallback('warn', `Impossible de supprimer le panier fantôme ${cartId}`); }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        logCallback('success', 'Importation terminée !');
    } catch (error) {
        console.error('Erreur critique lors de l\'import des commandes:', error);
        logCallback('error', `Erreur critique : ${formatApiError(error)}`);
        // Rollback global (tous les imports) en cas d'erreur critique durant l'import des commandes
        try {
            await runResetForTargets(resetTargets, (type, message) => logCallback(type, `Rollback global: ${message}`));
        } catch (e) {
            console.error('Échec du rollback global:', e);
            logCallback('warn', `Échec du rollback global : ${formatApiError(e)}`);
        }
    }
};