import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const BASE_URL = 'http://localhost/prestashop_edition_classic_version_8.2.6/api';
const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';

// Utilitaire pour forcer un tableau (PrestaShop XML quirk)
const asArray = (data) => {
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
};

const extractVal = (node) => {
    if (!node) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);

    if (typeof node === 'object') {
        if (node['#text']) return String(node['#text']);
        if (node.language) {
            if (Array.isArray(node.language)) return extractVal(node.language[0]);
            return extractVal(node.language);
        }
    }

    return '';
};

export async function getProductTaxRate(productId) {
    try {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

        const productRes = await axios.get(
            `${BASE_URL}/products/${productId}`,
            {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            }
        );

        const productJson = parser.parse(productRes.data);
        const product = productJson?.prestashop?.product;
        const taxGroupId = extractVal(product?.id_tax_rules_group);

        if (!taxGroupId || taxGroupId === '0') {
            return null;
        }

        const rulesRes = await axios.get(
            `${BASE_URL}/tax_rules?filter[id_tax_rules_group]=[${taxGroupId}]&display=full`,
            {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            }
        );

        const rulesJson = parser.parse(rulesRes.data);
        const rules = rulesJson?.prestashop?.tax_rules?.tax_rule;

        if (!rules) {
            return null;
        }

        const rule = Array.isArray(rules) ? rules[0] : rules;
        const taxId = extractVal(rule?.id_tax);

        if (!taxId) {
            return null;
        }

        const taxRes = await axios.get(
            `${BASE_URL}/taxes/${taxId}`,
            {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            }
        );

        const taxJson = parser.parse(taxRes.data);
        const rate = extractVal(taxJson?.prestashop?.tax?.rate);
        const parsedRate = parseFloat(rate);

        return Number.isFinite(parsedRate) ? parsedRate : null;
    } catch (error) {
        console.error('❌ Erreur récupération taxe produit :', error);
        return null;
    }
}

export function calculatePriceTTC(priceHT, taxRate) {
    const ht = parseFloat(priceHT);
    const rate = parseFloat(taxRate);

    if (!Number.isFinite(ht)) {
        return 0;
    }

    if (!Number.isFinite(rate)) {
        return parseFloat(ht.toFixed(2));
    }

    return parseFloat((ht * (1 + rate / 100)).toFixed(2));
}

export default {
    async getTaxes() {
        try {
            const response = await axios.get(`${BASE_URL}/taxes?display=full`, {
                auth: { username: WS_KEY, password: '' }
            });
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            return asArray(result?.prestashop?.taxes?.tax);
        } catch (error) {
            console.error("Erreur taxes:", error);
            return [];
        }
    },

    async getTaxRules() {
        try {
            const response = await axios.get(`${BASE_URL}/tax_rules?display=full`, {
                auth: { username: WS_KEY, password: '' }
            });
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            const result = parser.parse(response.data);
            const allRules = asArray(result?.prestashop?.tax_rules?.tax_rule);
            
            // On ne garde que la France (id_country = 8) dès le service
            return allRules.filter(r => String(r.id_country) === '8');
        } catch (error) {
            console.error("Erreur tax rules:", error);
            return [];
        }
    },

    getProductTaxRate,

    calculatePriceTTC(priceHT, taxRate) {
        return calculatePriceTTC(priceHT, taxRate);
    }
};