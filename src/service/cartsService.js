// Axios prends les donnees du back
import axios from 'axios';

// XMLParser : XML en Json
// XMLBuilder : Json en XML
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const WS_KEY = 's2ijjJ0QhGCniJ887IKfr1zgWPUp4y55';
const BASE_URL = import.meta.env.VITE_PRESTASHOP_API_BASE_URL || '/prestashop_edition_classic_version_8.2.6_test/api';

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

// Parser XML partagé pour les méthodes de ce service
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

// transformerCart : normalise et nettoie la structure du panier retournée par PrestaShop
const transformerCart = (cart) => {
    if (!cart) return null;

    const rawRows = cart?.associations?.cart_rows?.cart_row || [];
    const rowsArray = Array.isArray(rawRows) ? rawRows : [rawRows];

    const normalized = rowsArray.map(r => ({
        id: extractVal(r.id) || '',
        id_product: extractVal(r.id_product) || '',
        id_product_attribute: extractVal(r.id_product_attribute) || '',
        id_address_delivery: extractVal(r.id_address_delivery) || '0',
        quantity: Number(extractVal(r.quantity)) || 0
    }));

    return {
        id: extractVal(cart.id) || '',
        id_customer: extractVal(cart.id_customer) || '',
        id_lang: extractVal(cart.id_lang) || '',
        id_address_delivery: extractVal(cart.id_address_delivery) || '0',
        id_address_invoice: extractVal(cart.id_address_invoice) || '0',
        id_carrier: extractVal(cart.id_carrier) || '0',
        date_add: extractVal(cart.date_add) || '',
        associations: {
            cart_rows: {
                cart_row: normalized
            }
        }
    };
};

export default {
    /**
     * addToCart : Enregistre le produit dans le panier côté serveur (PrestaShop API)
     * Gère la création du panier (ps_cart) et l'ajout du produit (ps_cart_product)
     */
    async addToCart(payload) {
        const { id_product, id_product_attribute, quantity, id_customer, id_cart } = payload;
        const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@@', format: true });
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

        try {
            let existingRows = [];

            if (id_cart) {
                try {
                    const getRes = await axios.get(`${BASE_URL}/carts/${id_cart}`, {
                        auth: { username: WS_KEY, password: '' },
                        responseType: 'text'
                    });
                    const currentData = parser.parse(getRes.data);
                    const rows = currentData.prestashop?.cart?.associations?.cart_rows?.cart_row;

                    if (rows) {
                        existingRows = asArray(rows);
                    }
                } catch (e) {
                    console.warn('Panier introuvable ou erreur de lecture, on continuera sur un nouveau.');
                }
            }

            let productFound = false;
            const cleanedRows = existingRows.map(row => {
                const rowProdId = String(extractVal(row.id_product));
                const rowAttrId = String(extractVal(row.id_product_attribute));

                const isTarget = rowProdId === String(id_product) && rowAttrId === String(id_product_attribute);

                if (isTarget) productFound = true;

                return {
                    id_product: rowProdId,
                    id_product_attribute: rowAttrId,
                    id_address_delivery: extractVal(row.id_address_delivery) || '0',
                    quantity: isTarget ? (parseInt(extractVal(row.quantity)) + parseInt(quantity)) : extractVal(row.quantity)
                };
            });

            if (!productFound) {
                cleanedRows.push({
                    id_product: String(id_product),
                    id_product_attribute: String(id_product_attribute || 0),
                    id_address_delivery: '0',
                    quantity: String(quantity)
                });
            }

            const cartXMLObject = {
                prestashop: {
                    '@@xmlns:xlink': 'http://www.w3.org/1999/xlink',
                    cart: {
                        id: id_cart || undefined,
                        id_customer: id_customer || '0',
                        id_lang: '1',
                        id_shop: '1',
                        id_shop_group: '1',
                        id_currency: '1',
                        id_address_delivery: '0',
                        id_address_invoice: '0',
                        id_carrier: '0',
                        associations: {
                            cart_rows: {
                                cart_row: cleanedRows
                            }
                        }
                    }
                }
            };

            const xmlData = builder.build(cartXMLObject);
            const url = id_cart ? `${BASE_URL}/carts/${id_cart}` : `${BASE_URL}/carts`;
            const method = id_cart ? 'put' : 'post';

            const response = await axios({
                method,
                url,
                auth: { username: WS_KEY, password: '' },
                data: xmlData,
                headers: { 'Content-Type': 'application/xml' }
            });

            const result = parser.parse(response.data);
            return result.prestashop.cart;
        } catch (error) {
            console.error('Erreur Synchro Panier :', error.response?.data || error.message);
            throw error;
        }
    },
    /**
     * getCart : Récupère le contenu brut du panier depuis PrestaShop
     */
    async getCart(id_cart) {
        try {
            const response = await axios.get(`${BASE_URL}/carts/${id_cart}`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text',
                params: { display: 'full' } // Optionnel : force le détail complet
            });

            const data = parser.parse(response.data);
            const cart = data.prestashop?.cart;

            // Utiliser le transformer pour normaliser la structure
            return transformerCart(cart);
        } catch (error) {
            console.error("Erreur service getCart:", error);
            throw error;
        }
    },

    async updateCartAddresses(cartId, idAddress, idCarrier) {
        try {
            // 1. Récupération du panier
            const getRes = await axios.get(`${BASE_URL}/carts/${cartId}`, {
                auth: { username: WS_KEY, password: '' }
            });

            const parser = new XMLParser({ ignoreAttributes: false });
            const result = parser.parse(getRes.data);
            const cart = result.prestashop.cart;

            // 2. Nettoyage des lignes du panier (on retire les liens xlink)
            const rawRows = cart.associations?.cart_rows?.cart_row;
            const normalizedRows = Array.isArray(rawRows) ? rawRows : (rawRows ? [rawRows] : []);
            
            const cleanRows = normalizedRows.map(row => ({
                id_product: row.id_product['#text'] || row.id_product,
                id_product_attribute: row.id_product_attribute['#text'] || row.id_product_attribute,
                id_address_delivery: idAddress, // On aligne l'adresse de livraison du produit
                quantity: row.quantity
            }));

            // 3. Construction du XML avec le NAMESPACE xlink obligatoire
            const builder = new XMLBuilder({ ignoreAttributes: false });
            const xmlObject = {
                prestashop: {
                    // Ajout de l'attribut xmlns:xlink pour éviter l'erreur de namespace
                    '@_xmlns:xlink': 'http://www.w3.org/1999/xlink',
                    cart: {
                        id: cartId,
                        id_customer: cart.id_customer['#text'] || cart.id_customer,
                        id_address_delivery: idAddress,
                        id_address_invoice: idAddress,
                        id_currency: cart.id_currency['#text'] || cart.id_currency,
                        id_lang: cart.id_lang['#text'] || cart.id_lang,
                        id_carrier: idCarrier,
                        associations: {
                            cart_rows: {
                                cart_row: cleanRows
                            }
                        }
                    }
                }
            };

            const xmlUpdate = builder.build(xmlObject);

            // 4. Envoi
            return await axios.put(`${BASE_URL}/carts/${cartId}`, xmlUpdate, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });
        } catch (error) {
            console.error("Erreur détaillée Prestashop:", error.response?.data || error);
            throw error;
        }
    },

    /**
     * getCarts : Récupère la liste de tous les paniers
     */
    async getCarts() {
        try {
            const response = await axios.get(`${BASE_URL}/carts`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text',
                params: { display: 'full' } // Récupère tous les détails de chaque panier
            });

            const data = parser.parse(response.data);
            const carts = data.prestashop?.carts?.cart;

            if (!carts) return [];

            // Si PrestaShop retourne un seul panier, carts ne sera pas un tableau, on le transforme
            const cartsArray = asArray(carts);

            // On applique le transformer sur chaque panier pour avoir une structure propre
            return cartsArray.map(cart => transformerCart(cart));
        } catch (error) {
            console.error("Erreur service getCarts:", error.response?.data || error.message);
            throw error;
        }
    },
};

export { transformerCart };
