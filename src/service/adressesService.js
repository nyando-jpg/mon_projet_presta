import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop_edition_classic_version_8.2.6/api';

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
};