import { getXml, postXml, putXml, deleteXml } from './api';
import { runResetForTargets } from './resetService';

// ============================================================================
// CONFIGURATION DU ROLLBACK
// ============================================================================
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
    }
];

export const rollbackOrders = async (logCallback) => {
    logCallback('info', 'Lancement de la réinitialisation des commandes et paniers...');
    await runResetForTargets(resetOrderTargets, (type, message) => {
        logCallback(type, `Rollback Commande: ${message}`);
    });
    logCallback('info', 'Réinitialisation des commandes terminée.');
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================
function parseAchat(achatString) {
    if (!achatString || achatString.indexOf('[') === -1 || achatString.indexOf(']') === -1) {
        return [];
    }

    const start = achatString.indexOf('[');
    const end = achatString.lastIndexOf(']');
    const content = achatString.slice(start + 1, end);

    const tuples = content.match(/\(.*?\)/g);
    if (!tuples) return [];

    const items = [];
    for (let i = 0; i < tuples.length; i++) {
        const tuple = tuples[i];
        const cleanTuple = tuple.slice(1, -1);
        const parts = cleanTuple.split(';');

        const ref = parts[0] ? parts[0].replace(/["']/g, '').trim() : '';
        const qty = parts[1] ? parseInt(parts[1].trim(), 10) || 1 : 1;
        const variant = parts[2] ? parts[2].replace(/["']/g, '').trim() : '';

        if (ref) {
            items.push({ reference: ref, quantity: qty, variant: variant });
        }
    }
    return items;
}

function extractId(node) {
    if (!node) return null;
    if (typeof node === 'object') {
        return String(node['#text'] || node['@_id'] || node.id || '');
    }
    return String(node);
}

// ============================================================================
// FONCTION PRINCIPALE : IMPORTATION
// ============================================================================
export const processOrderImport = async (data, logCallback) => {

    if (data && data.length > 0) {
        data = data.map(row => {
            const newRow = {};
            for (const key in row) {
                newRow[key.trim().toLowerCase()] = row[key];
            }
            return newRow;
        });
    } else {
        logCallback('warn', 'Le fichier CSV des commandes est vide.');
        return;
    }

    const expectedColumns = ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat'];
    const actualColumns = Object.keys(data[0]);
    const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));

    if (missingColumns.length > 0) {
        logCallback('error', `CRITIQUE : Colonnes manquantes dans le CSV : ${missingColumns.join(', ')}`);
        logCallback('error', 'Annulation immédiate de l\'importation des commandes.');
        return;
    }

    try {
        const statesResp = await getXml('/order_states?display=full');
        const allStates = statesResp?.prestashop?.order_states?.order_state || [];
        const stateList = Array.isArray(allStates) ? allStates : [allStates];
        logCallback('info', `${stateList.length} états de commande chargés pour mapping.`);

        let activeCountryId = '1';
        try {
            const countrySearch = await getXml('/countries?filter[active]=[1]&display=[id]');
            const countries = countrySearch?.prestashop?.countries?.country;
            if (countries) {
                activeCountryId = extractId(Array.isArray(countries) ? countries[0].id : countries.id);
                logCallback('info', `Pays actif dynamique trouvé (ID: ${activeCountryId}).`);
            } else {
                logCallback('warn', 'Aucun pays actif trouvé, utilisation de l\'ID 1 par défaut.');
            }
        } catch (e) {
            logCallback('warn', 'Erreur lors de la recherche d\'un pays actif. Utilisation de l\'ID 1.');
        }

        for (const [index, row] of data.entries()) {
            logCallback('info', `Traitement de la ligne ${index + 1} (Client : ${row.nom || 'Inconnu'})...`);

            if (!row.email || String(row.email).trim() === '' ||
                !row.nom || String(row.nom).trim() === '' ||
                !row.adresse || String(row.adresse).trim() === '' ||
                !row.achat || String(row.achat).trim() === '' ||
                !row.date || String(row.date).trim() === '') {
                logCallback('error', `Ligne ${index + 1} ignorée : Des données vitales sont manquantes.`);
                continue;
            }

            const email = String(row.email).trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                logCallback('error', `Ligne ${index + 1} ignorée : L'adresse email fournie (${email}) n'est pas valide.`);
                continue;
            }

            const rawDate = String(row.date).trim();
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
            if (!dateRegex.test(rawDate)) {
                logCallback('error', `Ligne ${index + 1} ignorée : Format de date "${rawDate}" invalide. Attendu : DD/MM/YYYY.`);
                continue;
            }

            const dateParts = rawDate.split('/');
            const formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;

            const purchasedItems = parseAchat(row.achat);
            if (purchasedItems.length === 0) {
                logCallback('error', `Ligne ${index + 1} ignorée : Impossible de décoder la syntaxe de la colonne achat.`);
                continue;
            }

            let customerId = null;
            const customerSearch = await getXml(`/customers?filter[email]=[${email}]&display=[id]`);
            let customer = customerSearch?.prestashop?.customers?.customer;

            if (customer) {
                if (Array.isArray(customer)) customer = customer[0];
                customerId = extractId(customer.id);
            } else {
                logCallback('info', `Création du client ${row.nom} (${email})...`);
                const customerPayload = {
                    prestashop: {
                        customer: {
                            firstname: row.nom,
                            lastname: row.nom,
                            email: email,
                            passwd: row.pwd || 'DefaultPassword123!',
                            active: 1
                        }
                    }
                };
                const newCustomer = await postXml('/customers', customerPayload);
                customerId = extractId(newCustomer?.prestashop?.customer?.id);
            }

            let addressId = null;
            const addressSearch = await getXml(`/addresses?filter[id_customer]=[${customerId}]&filter[address1]=[${row.adresse.trim()}]&display=[id]`);
            let address = addressSearch?.prestashop?.addresses?.address;

            if (address) {
                if (Array.isArray(address)) address = address[0];
                addressId = extractId(address.id);
            } else {
                const addressPayload = {
                    prestashop: {
                        address: {
                            id_customer: customerId,
                            alias: 'Importé',
                            lastname: row.nom,
                            firstname: row.nom,
                            address1: row.adresse.trim(),
                            postcode: '101',
                            city: 'Antananarivo',
                            id_country: activeCountryId,
                            phone: '0340000000'
                        }
                    }
                };
                const newAddress = await postXml('/addresses', addressPayload);
                addressId = extractId(newAddress?.prestashop?.address?.id);
            }

            let cartRowsXml = '';
            let productCheckFailed = false;
            let cartTotal = 0;

            for (let i = 0; i < purchasedItems.length; i++) {
                const item = purchasedItems[i];

                const prodSearch = await getXml(`/products?filter[reference]=[${item.reference}]&display=[id,price]`);
                let foundProd = prodSearch?.prestashop?.products?.product;

                if (!foundProd) {
                    logCallback('error', `Ligne ${index + 1} stoppée : La référence "${item.reference}" n'existe pas en boutique.`);
                    productCheckFailed = true;
                    break;
                }

                if (Array.isArray(foundProd)) foundProd = foundProd[0];
                const idProduct = extractId(foundProd.id);

                const itemPrice = parseFloat(foundProd.price || 0);
                cartTotal += (itemPrice * item.quantity);

                let idProductAttribute = '0';

                if (item.variant && item.variant !== '') {
                    const exactCombinationRef = `${item.reference}_${item.variant}`;
                    const combSearch = await getXml(`/combinations?filter[id_product]=[${idProduct}]&filter[reference]=[${exactCombinationRef}]&display=[id]`);
                    let foundComb = combSearch?.prestashop?.combinations?.combination;
                    if (foundComb) {
                        if (Array.isArray(foundComb)) foundComb = foundComb[0];
                        idProductAttribute = extractId(foundComb.id);
                    } else {
                        logCallback('warn', `Avertissement: La variante ${exactCombinationRef} est introuvable.`);
                    }
                }

                cartRowsXml += `
                <cart_row>
                    <id_product>${idProduct}</id_product>
                    <id_product_attribute>${idProductAttribute}</id_product_attribute>
                    <id_address_delivery>${addressId}</id_address_delivery>
                    <id_customization>0</id_customization>
                    <quantity>${item.quantity}</quantity>
                </cart_row>`;
            }

            if (productCheckFailed) continue;

            const cartXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <cart>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_customer>${customerId}</id_customer>
        <id_lang>1</id_lang>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <id_carrier>1</id_carrier>
        <associations>
            <cart_rows nodeType="cart_row" virtualEntity="true">
${cartRowsXml}
            </cart_rows>
        </associations>
    </cart>
</prestashop>`;

            const newCartResp = await postXml('/carts', cartXmlPayload);
            const cartId = extractId(newCartResp?.prestashop?.cart?.id);

            if (!cartId) {
                logCallback('error', `Échec critique de la création du panier à la ligne ${index + 1}.`);
                continue;
            }

            const etatBrut = row.etat ? String(row.etat).trim().toLowerCase() : '';

            if (etatBrut === '' || etatBrut === 'null') {
                logCallback('info', `État vide détecté. Sauvegarde du Panier Abandonné #${cartId}...`);
                const updateCartDatePayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <cart>
        <id>${cartId}</id>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_currency>1</id_currency>
        <id_customer>${customerId}</id_customer>
        <id_lang>1</id_lang>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <id_carrier>1</id_carrier>
        <date_add>${formattedDate} 12:00:00</date_add>
        <date_upd>${formattedDate} 12:00:00</date_upd>
    </cart>
</prestashop>`;

                await putXml(`/carts/${cartId}`, updateCartDatePayload);
                logCallback('success', `Ligne ${index + 1} importée : Panier #${cartId} conservé (Aucune commande créée).`);
                continue;
            }

            let orderStateId = '2';

            for (let s = 0; s < stateList.length; s++) {
                const stateNode = stateList[s].name?.language;
                let textName = '';

                if (Array.isArray(stateNode)) {
                    textName = stateNode[0]['#text'] || '';
                } else if (stateNode) {
                    textName = stateNode['#text'] || stateNode;
                }

                if (textName.toLowerCase().indexOf(etatBrut) !== -1) {
                    orderStateId = extractId(stateList[s].id);
                    break;
                }
            }

            const orderXmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${cartId}</id_cart>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_customer>${customerId}</id_customer>
        <id_carrier>1</id_carrier>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <current_state>${orderStateId}</current_state>
        <payment>Paiement importé</payment>
        <module>ps_wirepayment</module>
        <total_paid>${cartTotal.toFixed(6)}</total_paid>
        <total_paid_real>${cartTotal.toFixed(6)}</total_paid_real>
        <total_products>${cartTotal.toFixed(6)}</total_products>
        <total_products_wt>${cartTotal.toFixed(6)}</total_products_wt>
        <conversion_rate>1.000000</conversion_rate>
    </order>
</prestashop>`;

            const newOrderResp = await postXml('/orders', orderXmlPayload);
            const orderId = extractId(newOrderResp?.prestashop?.order?.id);

            if (orderId) {
                logCallback('info', `Mise à jour de la date historique de la commande #${orderId}...`);

                // CORRECTION : Le payload PUT est désormais strictement identique au POST pour éviter l'erreur 400
                const updateOrderDatePayload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
    <order>
        <id>${orderId}</id>
        <id_address_delivery>${addressId}</id_address_delivery>
        <id_address_invoice>${addressId}</id_address_invoice>
        <id_cart>${cartId}</id_cart>
        <id_currency>1</id_currency>
        <id_lang>1</id_lang>
        <id_customer>${customerId}</id_customer>
        <id_carrier>1</id_carrier>
        <id_shop_group>1</id_shop_group>
        <id_shop>1</id_shop>
        <current_state>${orderStateId}</current_state>
        <payment>Paiement importé</payment>
        <module>ps_wirepayment</module>
        <total_paid>${cartTotal.toFixed(6)}</total_paid>
        <total_paid_real>${cartTotal.toFixed(6)}</total_paid_real>
        <total_products>${cartTotal.toFixed(6)}</total_products>
        <total_products_wt>${cartTotal.toFixed(6)}</total_products_wt>
        <conversion_rate>1.000000</conversion_rate>
        <date_add>${formattedDate} 12:00:00</date_add>
        <date_upd>${formattedDate} 12:00:00</date_upd>
    </order>
</prestashop>`;
                await putXml(`/orders/${orderId}`, updateOrderDatePayload);
                logCallback('success', `Ligne ${index + 1} importée avec succès. Commande ID : ${orderId}`);
            } else {
                logCallback('error', `La ligne ${index + 1} a échoué silencieusement (PrestaShop a rejeté la commande).`);
                logCallback('error', `Détail du refus API : ${JSON.stringify(newOrderResp)}`);
            }
        }

        logCallback('success', 'Importation des commandes et paniers terminée avec succès !');
    } catch (error) {
        logCallback('error', `CRITIQUE : Échec de l'importation des commandes : ${error.message}`);
        logCallback('error', 'Lancement automatique de la procédure de Rollback...');
        await rollbackOrders(logCallback);
    }
};