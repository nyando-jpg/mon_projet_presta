// Axios prends les donnees du back
import axios from 'axios'; 

// XMLParser : XML en Json
// XMLBuilder : Json en XML
import { XMLParser, XMLBuilder } from 'fast-xml-parser'; 
import { postXml, putXml } from '@/service/api';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W'; 
const BASE_URL = 'http://localhost/prestashop1/api'; 

// ==========================================
// LES "NETTOYEURS" (FONCTIONS UTILITAIRES)
// ==========================================

/**
 * extractVal : La fonction "Anti-Crash"
 * Pourquoi ? PrestaShop gère plusieurs langues. Le nom d'un produit n'est pas "Chaise" 
 * mais un objet complexe : { language: { id: 1, #text: "Chaise" } }.
 * Cette fonction descend dans l'objet pour trouver le texte final, peu importe où il est caché.
 */
const extractVal = (node) => {
    // 1. Si la donnée n'existe pas (null/undefined), on renvoie du vide pour éviter de faire planter .toLowerCase() plus tard.
    if (!node) return '';
    
    // 2. Si c'est déjà une chaîne de caractères ou un nombre, on ne touche à rien.
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    
    // 3. Si c'est un objet (cas du XML traduit), on cherche à l'intérieur.
    if (typeof node === 'object') {
        // Cas PrestaShop standard : les données sont rangées sous la clé 'language'
        if (node.language) {
            // Si c'est un tableau (plusieurs langues), on prend la première langue par défaut.
            if (Array.isArray(node.language)) return extractVal(node.language[0]);
            // Sinon, on prend le contenu texte (#text) ou la valeur directe de language.
            return node.language['#text'] || node.language || '';
        }
        // Si l'objet contient directement #text (généré par fast-xml-parser)
        if ('#text' in node) return node['#text'];
    }
    return '';
};

/**
 * transformerProduit : Le "Décorateur"
 * Rôle : "brut" (XML bizarre) en produit "propre" 
 */
const transformerProduit = (p) => {
    const idProd = extractVal(p.id);

    // --- PARTIE IMAGE PRINCIPALE ---
    // const defaultImgId = p.id_default_image;
    // const mainImageUrl = defaultImgId 
    //     ? `${BASE_URL}/images/products/${idProd}/${defaultImgId}?ws_key=${WS_KEY}`
    //     : 'https://via.placeholder.com/300?text=Aucune+image';

    // --- PARTIE GALERIE (Toutes les images) ---
    // Le ?. vérifie si la boîte existe, le || [] donne un tableau vide par défaut
    const rawImages = p.associations?.images?.image || p.associations?.images || [];
    // On force la donnée à être un tableau (Array) pour pouvoir utiliser .map()
    const imagesArray = Array.isArray(rawImages) ? rawImages : [rawImages];
    
    const galerieUrls = imagesArray
        .filter(img => img && extractVal(img.id))
        .map(img => `${BASE_URL}/images/products/${idProd}/${extractVal(img.id)}?ws_key=${WS_KEY}`);

    // --- LOGIQUE COMBINATIONS ---
    const rawCombinations = p.associations?.combinations?.combination || p.associations?.combinations || [];
    const combinationsArray = Array.isArray(rawCombinations) ? rawCombinations : [rawCombinations];
    const combinations = combinationsArray
        .filter(c => c && c.id)
        .map(c => ({ id: extractVal(c.id) }));

    // --- LOGIQUE PRODUCT_OPTION_VALUES ---
    const rawOptionValues = p.associations?.product_option_values?.product_option_value
        || p.associations?.product_option_values
        || [];
    const optionValuesArray = Array.isArray(rawOptionValues) ? rawOptionValues : [rawOptionValues];
    const optionValues = optionValuesArray
        .filter(v => v && v.id)
        .map(v => ({ id: extractVal(v.id) }));

    // --- LOGIQUE CATÉGORIES ---
    const rawCats = p.associations?.categories?.category || p.associations?.categories || [];
    const catsArray = Array.isArray(rawCats) ? rawCats : [rawCats];
    const categoryIds = catsArray
        .map(c => String(extractVal(c.id)))
        .filter(id => id !== '');

    const rawStocks = p.associations?.stock_availables?.stock_available || p.associations?.stock_availables || [];
    const stocksArray = Array.isArray(rawStocks) ? rawStocks : [rawStocks];
    const stockAvailables = stocksArray
        .filter(stock => stock && extractVal(stock.id))
        .map(stock => ({
            id: extractVal(stock.id),
            id_product_attribute: extractVal(stock.id_product_attribute)
        }));

    // --- RETOUR DE L'OBJET PROPRE ---
    return {
        id: idProd, 
        reference: p.reference || "N/A",
        name: extractVal(p.name),
        // Conserver le prix HT brut: l'arrondir ici casse le calcul TTC (ex: 4.73 * 1.056 = 4.99)
        price: p.price ? parseFloat(extractVal(p.price)) : 0,
        wholesalePrice: p.wholesale_price ? parseFloat(extractVal(p.wholesale_price)) : 0,
        active: extractVal(p.active) === "1", 
        quantity: Number(extractVal(p.quantity)) || 0,
        condition: extractVal(p.condition) || "new", 
        description_short: extractVal(p.description_short), 
        date_add: p.date_add,
        // imageUrl: mainImageUrl, 
        galerie: galerieUrls,
        combinations: combinations,
        optionValues: optionValues,
        date_add: extractVal(p.date_add),
        categories: categoryIds,
        stockAvailables: stockAvailables,
        stockQuantity: Number(extractVal(p.quantity))
    };
};

const cleanLink = (input) => {
    const text = extractVal(input); 
    return text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .replace(/[^a-z0-9\s-]/g, "") // Enlève les symboles
        .trim()
        .replace(/\s+/g, '-') // Espaces -> Tirets
        .replace(/-+/g, '-'); // Évite les doubles tirets
};

const asArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

// Compare deux listes d'IDs (ex: [10, 11] vs [11, 10]) sans se soucier de l'ordre
const idsMatch = (left, right) => {
    const leftIds = asArray(left).map(String).sort();
    const rightIds = asArray(right).map(String).sort();

    if (leftIds.length !== rightIds.length) return false;
    return leftIds.every((id, index) => id === rightIds[index]);
};


//fonction pour avoir les détails d'une valeur d'option (ex: Rouge, Taille L) à partir des ID de product_option_values
const getOptionValueDetails = async (optionValues) => {
    return Promise.all(
        asArray(optionValues).map(async (optionValueRef) => {
            const optionValueId = optionValueRef?.id;
            if (!optionValueId) return null;

            try {
                const valueResponse = await axios.get(
                    `${BASE_URL}/product_option_values/${optionValueId}`,
                    { auth: { username: WS_KEY, password: '' }, responseType: 'text' }
                );

                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
                const parsed = parser.parse(valueResponse.data);
                const valueData = parsed?.prestashop?.product_option_value;

                return {
                    id: extractVal(valueData?.id) || extractVal(optionValueId),
                    name: extractVal(valueData?.name),
                    groupId: extractVal(valueData?.id_attribute_group)
                };
            } catch (error) {
                console.error(`Erreur lecture option_value ${optionValueId}:`, error.message);
                return null;
            }
        })
    );
};

// fonction pour avoir les noms des groupes d'options (Couleur, Taille, etc.) à partir ded ID de product_option (id_attribute_group)
// On utilise juste les IDs comme identifiants.
const getGroupDetails = async (groupIds) => {
    // Pas d'appel API - juste retourner les groupes avec les IDs comme noms
    return Array.from(groupIds).map(groupId => ({
        id: groupId,
        name: `Groupe ${groupId}`  // Noms génériques mais fonctionnels
    }));
};

// fonction pour récupérer les détails d'une combinaison (product_option_values ids + prix)
const getCombinationDetails = async (combinationId) => {
    try {
        const combinationResponse = await axios.get(
            `${BASE_URL}/combinations/${combinationId}`,
            { auth: { username: WS_KEY, password: '' }, responseType: 'text' }
        );

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
        const parsed = parser.parse(combinationResponse.data);
        const combination = parsed?.prestashop?.combination;
        
        // Récupérer la liste brute des product_option_values associés à cette combinaison
        const rawVals = combination?.associations?.product_option_values || [];
        let valuesArray = asArray(rawVals);
        // Parfois, PrestaShop envoie un objet unique au lieu d'un tableau si il n'y a qu'une seule valeur.
        if (valuesArray.length === 1 && typeof valuesArray[0] === 'object' && valuesArray[0].product_option_value) {
            valuesArray = asArray(valuesArray[0].product_option_value);
        }
        // Extraire les IDs des option_values associés à cette combinaison
        const optionValueIds = valuesArray
            .map((item) => extractVal(item?.id))
            .filter(id => id !== '');
        
        // Récupérer le prix de la combinaison
        let price = '';
        if (combination?.price) {
            price = String(combination.price);
        }
        
        return {
            optionValueIds: optionValueIds,
            price: price
        };
    } catch (error) {
        console.error(`Erreur lecture combinaison ${combinationId}:`, error.message);
        return { optionValueIds: [], price: '' };
    }
};

const buildCombinationLabel = (optionValueDetails) => {
    const labelParts = (optionValueDetails || [])
        .map((detail) => detail?.name || detail?.id)
        .filter(Boolean);

    return labelParts.length ? labelParts.join(' / ') : 'Combinaison sans libellé';
};

let cachedStockMovementEmployeeId = null;
let cachedStockMovementReasonIds = {
    1: null,
    '-1': null
};

const normalizeStockMovementList = (node) => {
    const raw = node?.stock_movement || node?.stock_movements || node || [];
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
};

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

const createStockMovement = async ({ stockData, oldQuantity, newQuantity }) => {
    const delta = newQuantity - oldQuantity;
    if (delta === 0) return null;

    const sign = delta > 0 ? 1 : -1;
    const physicalQuantity = Math.abs(delta);
    const idEmployee = await resolveStockMovementEmployeeId();
    const idStockMovementReason = await resolveStockMovementReasonId(sign);

    const movementPayload = {
        prestashop: {
            stock_movement: {
                id_employee: idEmployee,
                id_stock: extractVal(stockData?.id),
                physical_quantity: physicalQuantity,
                id_stock_mvt_reason: idStockMovementReason,
                sign,
                price_te: '0.000000',
                date_add: new Date().toISOString().slice(0, 19).replace('T', ' ')
            }
        }
    };

    return postXml('/stock_movements', movementPayload);
};

// ==========================================
// LE CŒUR DU SERVICE (MÉTHODES API)
// ==========================================

export default {
    
    /**
     * getProduits : Récupère la liste complète
     */
    async getProduits() {
        try {
            // display=full permet d'avoir tous les détails (prix, nom) et pas juste les IDs.
            const response = await axios.get(`${BASE_URL}/products?display=full`, {
                auth: { username: WS_KEY, password: '' }, // Auth Basic (clé en login, mot de passe vide)
                responseType: 'text' // Important : on veut le XML brut sous forme de texte
            });

            // On configure le traducteur XML -> JSON
            const parser = new XMLParser({
                ignoreAttributes: false, // On garde les IDs comme <product id="1">
                attributeNamePrefix: ""  // Pas de préfixe bizarre pour les attributs
            });

            const result = parser.parse(response.data);
            const listeBrute = result.prestashop.products.product;
            
            // Sécurité : si PrestaShop n'a qu'un seul produit, il n'envoie pas de liste [] mais un seul objet {}.
            // On force la conversion en tableau pour que .map() ne plante jamais.
            const tableauBrut = Array.isArray(listeBrute) ? listeBrute : (listeBrute ? [listeBrute] : []);

            return {
                products: tableauBrut.map(p => transformerProduit(p)) // On "nettoie" chaque produit
            };
        } catch (error) {
            console.error("Erreur de lecture :", error);
            throw error;
        }
    },

    /**
     * getProduitById : Récupère UN seul produit (pour la page détails ou modif)
     */
    async getProduitById(id) {
        try {
            const response = await axios.get(`${BASE_URL}/products/${id}`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            
            // AU LIEU DE RENVOYER LE BRUT :
            // On le passe dans la machine à nettoyer !
            return transformerProduit(result.prestashop.product);
        } catch (error) {
            console.error(`Erreur lecture produit ${id}:`, error);
            throw error;
        }
    },

    /**
     * ajouterProduit : Création (POST)
     */
    async ajouterProduit(donnees) {
        try {
            const builder = new XMLBuilder({
                ignoreAttributes: false,
                attributeNamePrefix: "@@", // On utilisera @@ pour dire "ceci est un attribut XML"
                format: true
            });

            // Construction de la structure XML exigée par PrestaShop
            const objetPourXML = {
                prestashop: {
                    product: {
                        active: 1,
                        state: 1,
                        price: donnees.price,
                        reference: donnees.reference,
                        name: { language: { "@@id": "1", "#text": donnees.name } },
                        // Le link_rewrite est l'URL simplifiée (ex: "mon-super-produit"). Obligatoire !
                        link_rewrite: { language: { "@@id": "1", "#text": cleanLink(donnees.name) } },
                        id_category_default: 2, // Catégorie Accueil par défaut
                        associations: { categories: { category: { id: 2 } } }
                    }
                }
            };

            const xmlData = builder.build(objetPourXML); // Transformation en texte XML

            const response = await axios.post(`${BASE_URL}/products`, xmlData, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' } // On prévient qu'on envoie du XML
            });

            return response.data;
        } catch (error) {
            console.error("Erreur de création :", error.response?.data || error);
            throw error;
        }
    },

    /**
     * modifierProduit : Mise à jour (PUT)
     */
    async modifierProduit(id, donnees) {
        try {
            const builder = new XMLBuilder({ 
                ignoreAttributes: false, 
                attributeNamePrefix: "@@", 
                format: true 
            });

            const nomNettoye = extractVal(donnees.name);

            // Pour un PUT, PrestaShop exige de renvoyer l'ID dans le XML
            const objetPourXML = {
                prestashop: {
                    product: {
                        id: id, 
                        active: 1,
                        state: 1,
                        price: donnees.price,
                        reference: donnees.reference,
                        name: { language: { "@@id": "1", "#text": nomNettoye } },
                        link_rewrite: { language: { "@@id": "1", "#text": cleanLink(nomNettoye) } }
                    }
                }
            };

            const xmlData = builder.build(objetPourXML);

            // La requête PUT se fait sur l'URL précise du produit (/api/products/ID)
            const response = await axios.put(`${BASE_URL}/products/${id}`, xmlData, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });

            return response.data;
        } catch (error) {
            console.error("Erreur de modification :", error.response?.data || error);
            throw error;
        }
    },

    /**
     * supprimerProduit : Suppression (DELETE)
     */
    async supprimerProduit(id) {
        try {
            // Le DELETE est simple : juste l'URL avec l'ID, pas de XML à envoyer.
            const response = await axios.delete(`${BASE_URL}/products/${id}`, {
                auth: { username: WS_KEY, password: '' }
            });
            return response.data;
        } catch (error) {
            console.error(`Erreur de suppression ${id}:`, error);
            throw error;
        }
    },

    /**
     * getOptionsGroupedByProductOption :
     * Accepte un produit (ou un ID) et regroupe ses product_option_values par product_option (Couleur, Taille, etc.)
    * {
        "1": {
            "id": "1",
            "name": "Couleur",
            "values": [
            { "id": "10", "name": "Rouge", "groupId": "1" },
            { "id": "11", "name": "Bleu", "groupId": "1" }
            ]
        },
        "2": {
            "id": "2",
            "name": "Taille",
            "values": [
            { "id": "20", "name": "S", "groupId": "2" },
            { "id": "21", "name": "M", "groupId": "2" },
            { "id": "22", "name": "L", "groupId": "2" }
            ]
        }
        }
     */
    async getOptionsGroupedByProductOption(product) {
        try {
            if (!product || !product.optionValues) return [];
            const optionValues = asArray(product.optionValues);

            // Paralléliser la récupération de tous les détails des option_values : product_option_value name et groupeoption { id: 1, name: 'Rouge', groupId: 2 }.
            const optionValueDetails = await getOptionValueDetails(optionValues);

            // Recupere une liste des IDs uniques de groupes d'options 
            const groupIds = new Set(
                optionValueDetails
                    .filter(detail => detail && detail.groupId)
                    .map(detail => detail.groupId)
            );
            // récupération des noms de idGroupes productDetails : { id: 2, name: 'Couleur' }
            const groupDetails = await getGroupDetails(groupIds);

            // transforme le tableau d'objets en un tableau de "paires" [id, name] pour faciliter la recherche du nom de groupe à partir de son ID
            const groupNamesById = Object.fromEntries(
                groupDetails.map(g => [String(g.id), g.name])
            );

            // Construire le résultat groupé et trié
            const groupsById = {};

            for (const detail of optionValueDetails) {
                const gid = detail && detail.groupId ? String(detail.groupId) : null;
                if (!detail || !gid) continue;
                // SI LA BOÎTE N'EXISTE PAS ENCORE, ON LA CRÉE
                if (!groupsById[gid]) {
                    groupsById[gid] = {
                        id: gid,
                        name: groupNamesById[gid] || `Option ${gid}`,
                        values: []
                    };
                }
                // ON RANGE LA VALEUR DANS LA BONNE BOÎTE
                groupsById[gid].values.push({
                    id: detail.id,
                    name: detail.name,
                    groupId: gid
                });
            }

            return Object.values(groupsById);
        } catch (error) {
            console.error(`Erreur lecture options:`, error.message);
            return [];
        }
    },

    /**
     * findCombinationBySelectedValues :
     * Cherche la combinaison qui correspond exactement aux valeurs sélectionnées.
     * Retourne { combinationId, price } ou null
     */
    async findCombinationBySelectedValues(product, selectedValueIds) {
        try {
            if (!product) return null;
            const combinations = asArray(product?.combinations);
            // On parcourt les combinaisons du produit pour trouver celle qui a exactement les mêmes option_value_ids que les selectedValueIds
            for (const combinationRef of combinations) {
                const combinationId = combinationRef?.id;
                if (!combinationId) continue;
                // On récupère les détails de la combinaison pour comparer les option_value_ids avec les selectedValueIds
                const details = await getCombinationDetails(combinationId);
                if (details.optionValueIds.length > 0 && idsMatch(details.optionValueIds, selectedValueIds)) {
                    return {
                        combinationId: combinationId,
                        price: details.price
                    };
                }
            }

            return null;
        } catch (error) {
            console.error(`Erreur recherche combinaison pour produit ${product?.id || 'unknown'}:`, error.message);
            return null;
        }
    },

    /**
     * getCombinationPriceImpact : retourne l'impact prix HT d'une déclinaison
     * (valeur pouvant être positive, nulle, ou négative)
     */
    async getCombinationPriceImpact(combinationId) {
        try {
            const id = String(combinationId || '').trim();
            if (!id || id === '0') return 0;

            const details = await getCombinationDetails(id);
            return Number.parseFloat(details?.price) || 0;
        } catch (error) {
            console.error(`Erreur lecture impact prix combinaison ${combinationId}:`, error.message);
            return 0;
        }
    },

    // Caches simples en mémoire pour éviter les appels redondants lors du calcul du total d'un panier
    async getStockManagementRows(product) {
        try {
            if (!product) {
                return { productStock: null, combinations: [] };
            }

            const stockRows = asArray(product.stockAvailables);
            const baseStockRow = stockRows.find((row) => String(row?.id_product_attribute || '0') === '0') || null;

            const productStock = {
                id: baseStockRow?.id || '',
                id_product_attribute: '0',
                label: 'Stock principal',
                quantity: baseStockRow?.id ? (await this.getStockQuantity(baseStockRow.id)).quantity : Number(product.quantity || 0),
                stockId: baseStockRow?.id || '',
                disabled: !baseStockRow?.id
            };

            const combinationRefs = asArray(product.combinations);
            const combinations = await Promise.all(
                combinationRefs.map(async (combinationRef) => {
                    const combinationId = String(combinationRef?.id || '').trim();
                    if (!combinationId) return null;

                    const details = await getCombinationDetails(combinationId);
                    const optionValueDetails = await getOptionValueDetails(
                        asArray(details.optionValueIds).map((optionValueId) => ({ id: optionValueId }))
                    );
                    const stockRow = stockRows.find((row) => String(row?.id_product_attribute || '') === combinationId) || null;
                    const quantity = stockRow?.id ? (await this.getStockQuantity(stockRow.id)).quantity : 0;

                    return {
                        id: combinationId,
                        label: buildCombinationLabel(optionValueDetails),
                        priceImpact: Number.parseFloat(details?.price) || 0,
                        quantity,
                        stockId: stockRow?.id || '',
                        disabled: !stockRow?.id
                    };
                })
            );

            return {
                productStock,
                combinations: combinations.filter(Boolean)
            };
        } catch (error) {
            console.error(`Erreur préparation stock pour le produit ${product?.id || 'unknown'}:`, error.message);
            return { productStock: null, combinations: [] };
        }
    },

    async updateStockQuantity(stockId, quantity) {
        try {
            const id = String(stockId || '').trim();
            if (!id) {
                throw new Error('ID de stock manquant');
            }

            const nextQuantity = Number(quantity);
            if (!Number.isFinite(nextQuantity)) {
                throw new Error('Quantité invalide');
            }

            const response = await axios.get(`${BASE_URL}/stock_availables/${id}`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            const stockData = result?.prestashop?.stock_available;
            const oldQuantity = parseInt(extractVal(stockData?.quantity), 10) || 0;

            if (!stockData) {
                throw new Error(`Stock introuvable pour l'ID ${id}`);
            }

            const stockPayload = {
                prestashop: {
                    stock_available: {
                        id: extractVal(stockData?.id) || id,
                        id_product: extractVal(stockData?.id_product),
                        id_product_attribute: extractVal(stockData?.id_product_attribute) || '0',
                        id_shop: extractVal(stockData?.id_shop),
                        id_shop_group: extractVal(stockData?.id_shop_group),
                        quantity: nextQuantity,
                        depends_on_stock: extractVal(stockData?.depends_on_stock) || 0,
                        out_of_stock: extractVal(stockData?.out_of_stock) || 2
                    }
                }
            };

            const updateResult = await putXml('/stock_availables', stockPayload);

            try {
                await createStockMovement({
                    stockData,
                    oldQuantity,
                    newQuantity: nextQuantity
                });
            } catch (movementError) {
                console.warn(`Stock mis à jour pour ${id}, mais mouvement non enregistré:`, movementError);
            }

            return updateResult;
        } catch (error) {
            console.error(`Erreur mise à jour stock ${stockId}:`, error.response?.data || error);
            throw error;
        }
    },

    async getCategories() {
        try {
            const response = await axios.get(`${BASE_URL}/categories`, {
                auth: { username: WS_KEY, password: '' },
                params: { 
                    display: 'full',
                    'filter[active]': '1'
                    // On retire le sort temporairement car il cause souvent des 500 sur certaines config
                },
                responseType: 'text' // INDISPENSABLE pour recevoir le XML
            });

            // Initialisation du parser (qui manquait dans ta fonction)
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: ""
            });

            const result = parser.parse(response.data);
            
            if (!result.prestashop || !result.prestashop.categories) return [];
            
            const categories = result.prestashop.categories.category;
            
            // Force le retour en tableau et nettoie les noms avec extractVal
            const tableauCategories = Array.isArray(categories) ? categories : [categories];
            
            return tableauCategories.map(c => ({
                id: extractVal(c.id),
                name: extractVal(c.name),
                level_depth: extractVal(c.level_depth),
                id_parent: extractVal(c.id_parent)
            }));

        } catch (error) {
            console.error("Erreur catégories détaillée :", error.response?.data || error);
            return [];
        }
    },

    // Dans produitsService.js
    async getStockByAttribute(stockId) {
        const response = await axios.get(`/stock_availables/${stockId}`);
        return response.data.stock_available;
    },

    /**
     * getStockQuantity : Récupère la quantité numérique pour un ID de stock donné
     * Essaye le per-id, puis fallback sur la collection si 404
     */
    async getStockQuantity(stockId) {
        try {
            const response = await axios.get(`${BASE_URL}/stock_availables/${stockId}`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const stockData = result?.prestashop?.stock_available;

            return {
                quantity: parseInt(extractVal(stockData?.quantity)) || 0
            };
        } catch (error) {
            // Fallback : si per-id retourne 404, essaye la collection
            try {
                console.log(`Stock ${stockId} non trouvé via per-id, essai collection...`);
                const collectionResp = await axios.get(`${BASE_URL}/stock_availables?display=full`, {
                    auth: { username: WS_KEY, password: '' },
                    responseType: 'text'
                });

                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
                const result = parser.parse(collectionResp.data);
                let stocks = result?.prestashop?.stock_availables?.stock_available || [];
                if (!Array.isArray(stocks)) stocks = stocks ? [stocks] : [];

                const found = stocks.find(s => extractVal(s.id) === String(stockId));
                if (found) {
                    return { quantity: parseInt(extractVal(found.quantity)) || 0 };
                }
            } catch (fallbackError) {
                // Silently ignore fallback errors
            }

            console.error(`Erreur lecture stock ${stockId}:`, error);
            return { quantity: 0 };
        }
    }
};