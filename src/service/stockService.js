import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { postXml, putXml } from '@/service/api';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop1/api';

const asArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

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

// Construit un libellé de combinaison à partir des détails de ses option_values (ex: "Rouge / Taille L")
const buildCombinationLabel = (optionValueDetails) => {
    const labelParts = (optionValueDetails || [])
        .map((detail) => detail?.name || detail?.id)
        .filter(Boolean);

    return labelParts.length ? labelParts.join(' / ') : 'Combinaison sans libellé';
};

// Normalise les différentes structures possibles de la liste de mouvements de stock retournée par l'API
const normalizeStockMovementList = (node) => {
    const raw = node?.stock_movement || node?.stock_movements || node || [];
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
};

let cachedStockMovementEmployeeId = null;
let cachedStockMovementReasonIds = {
    1: null,
    '-1': null
};

// Résout l'ID d'employé à associer aux mouvements de stock, en essayant de récupérer le premier employé existant via l'API, ou en retombant sur une valeur par défaut de 1
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

// Résout l'ID de raison de mouvement à associer aux mouvements de stock, en fonction du signe du mouvement (entrée ou sortie), en essayant d'abord de récupérer la configuration par défaut correspondante, puis en cherchant une raison de mouvement avec le signe correspondant, et enfin en retombant sur une erreur si aucune raison valide n'est trouvée
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

// Crée un mouvement de stock associé à une mise à jour de stock, en calculant la quantité physique à partir de la différence entre l'ancienne et la nouvelle quantité, et en associant les métadonnées nécessaires (employé, raison, date)
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

// Récupère les détails d'une liste d'option_values à partir de leurs références (ID), en gérant les différentes structures possibles de la réponse API et en appliquant une logique de fallback
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

                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
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

// Récupère les détails d'une combinaison à partir de son ID, en gérant les différentes structures possibles de la réponse API et en appliquant une logique de fallback pour extraire les IDs d'option_value associés et l'impact prix
const getCombinationDetails = async (combinationId) => {
    try {
        const combinationResponse = await axios.get(
            `${BASE_URL}/combinations/${combinationId}`,
            { auth: { username: WS_KEY, password: '' }, responseType: 'text' }
        );

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
        const parsed = parser.parse(combinationResponse.data);
        const combination = parsed?.prestashop?.combination;

        const rawVals = combination?.associations?.product_option_values || [];
        let valuesArray = asArray(rawVals);
        if (valuesArray.length === 1 && typeof valuesArray[0] === 'object' && valuesArray[0].product_option_value) {
            valuesArray = asArray(valuesArray[0].product_option_value);
        }

        const optionValueIds = valuesArray
            .map((item) => extractVal(item?.id))
            .filter(id => id !== '');

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

// Extrait les informations de stock d'un produit, en gérant les différentes structures possibles de la réponse API et en appliquant une logique de fallback pour trouver les stocks disponibles associés au produit et calculer la quantité totale
export const extractStockFieldsFromProduct = (product) => {
    const rawStocks = product?.associations?.stock_availables?.stock_available || product?.associations?.stock_availables || [];
    const stocksArray = asArray(rawStocks);
    const stockAvailables = stocksArray
        .filter((stock) => stock && extractVal(stock.id))
        .map((stock) => ({
            id: extractVal(stock.id),
            id_product_attribute: extractVal(stock.id_product_attribute)
        }));

    return {
        stockAvailables,
        stockQuantity: Number(extractVal(product?.quantity)) || 0
    };
};

export default {
    extractStockFieldsFromProduct,

    // Prépare les données de stock d'un produit pour l'affichage dans la gestion de stock, en récupérant les stocks disponibles associés au produit et à ses déclinaisons, et en calculant les quantités correspondantes
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

    // Met à jour la quantité de stock d'un stock_available donné, en récupérant d'abord les données de stock existantes pour calculer la différence de quantité et créer un mouvement de stock associé, et en gérant les différentes structures possibles de la réponse API
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

    //  Récupère les données de stock d'un stock_available donné, en gérant les différentes structures possibles de la réponse API
    async getStockByAttribute(stockId) {
        const response = await axios.get(`/stock_availables/${stockId}`);
        return response.data.stock_available;
    },

    // Récupère la quantité de stock disponible pour un stock_available donné, en gérant les différentes structures possibles de la réponse API et en appliquant une logique de fallback pour trouver le stock_available correspondant dans la collection si la requête par ID échoue
    async getStockQuantity(stockId) {
        try {
            const response = await axios.get(`${BASE_URL}/stock_availables/${stockId}`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            const stockData = result?.prestashop?.stock_available;

            return {
                quantity: parseInt(extractVal(stockData?.quantity)) || 0
            };
        } catch (error) {
            try {
                console.log(`Stock ${stockId} non trouvé via per-id, essai collection...`);
                const collectionResp = await axios.get(`${BASE_URL}/stock_availables?display=full`, {
                    auth: { username: WS_KEY, password: '' },
                    responseType: 'text'
                });

                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
                const result = parser.parse(collectionResp.data);
                let stocks = result?.prestashop?.stock_availables?.stock_available || [];
                if (!Array.isArray(stocks)) stocks = stocks ? [stocks] : [];

                const found = stocks.find((s) => extractVal(s.id) === String(stockId));
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