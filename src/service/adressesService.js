import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop1/api';

export default {
    async createAddress(data) {
        const builder = new XMLBuilder({ ignoreAttributes: false });
        const xmlData = builder.build({
            prestashop: {
                address: {
                    id_customer: data.id_customer,
                    id_country: 8, // France
                    alias: 'Mon adresse de livraison',
                    lastname: data.lastname,
                    firstname: data.firstname,
                    address1: data.address1,
                    postcode: data.postcode,
                    city: data.city,
                    phone: data.phone || '0000000000',
                }
            }
        });

        const response = await axios.post(`${BASE_URL}/addresses`, xmlData, {
            auth: { username: WS_KEY, password: '' },
            headers: { 'Content-Type': 'application/xml' }
        });

        const parser = new XMLParser({ ignoreAttributes: false });
        const result = parser.parse(response.data);
        return result.prestashop.address; // Retourne l'objet cree avec le nouvel ID
    }
,

    async getAddressesByCustomer(customerId) {
        try {
            const response = await axios.get(`${BASE_URL}/addresses?filter[id_customer]=[${customerId}]&display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text'
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            const addressesNode = result?.prestashop?.addresses?.address || [];
            const array = Array.isArray(addressesNode) ? addressesNode : (addressesNode ? [addressesNode] : []);

            // Helper pour extraire une valeur string d'un node XML
            const extractStringValue = (node) => {
                if (!node) return '';
                if (typeof node === 'string') return String(node);
                if (typeof node === 'number') return String(node);
                if (typeof node === 'object' && node['#text']) return String(node['#text']);
                return '';
            };

            // Normaliser en objets JS simples (TOUTES LES VALEURS SONT DES STRINGS)
            return array.map(a => ({
                id: extractStringValue(a.id),
                id_customer: extractStringValue(a.id_customer),
                alias: extractStringValue(a.alias),
                address1: extractStringValue(a.address1),
                postcode: extractStringValue(a.postcode),
                city: extractStringValue(a.city),
                phone: extractStringValue(a.phone),
                firstname: extractStringValue(a.firstname),
                lastname: extractStringValue(a.lastname)
            }));
        } catch (error) {
            console.error('Erreur récupération adresses client:', error);
            return [];
        }
    }
};