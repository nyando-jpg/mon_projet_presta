import axios from 'axios'; 
import { XMLParser, XMLBuilder } from 'fast-xml-parser'; 

const WS_KEY = 's2ijjJ0QhGCniJ887IKfr1zgWPUp4y55'; 
const BASE_URL = import.meta.env.VITE_PRESTASHOP_API_BASE_URL || '/prestashop_edition_classic_version_8.2.6_test/api'; 

// Ta fonction utilitaire "Anti-Crash"
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

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

const parseCustomerResponse = (responseData) => {
    const parsed = typeof responseData === 'string' ? parser.parse(responseData) : responseData;
    const customerNode = parsed?.prestashop?.customer;

    if (!customerNode) {
        return responseData;
    }

    return transformerCustomer(customerNode);
};

// Transformation du client XML en objet JS propre
const transformerCustomer = (c) => {
    return {
        id: extractVal(c.id),
        firstname: extractVal(c.firstname),
        lastname: extractVal(c.lastname),
        email: extractVal(c.email),
        active: extractVal(c.active) === "1",
        date_add: extractVal(c.date_add),
        newsletter: extractVal(c.newsletter) === "1",
        is_guest: extractVal(c.is_guest)
    };
};

export default {
    async getCustomers() {
        try {
            // On demande explicitement du XML via responseType: 'text'
            const response = await axios.get(`${BASE_URL}/customers?display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text' 
            });

            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: ""
            });

            const result = parser.parse(response.data);
            const listeBrute = result.prestashop.customers.customer;
            
            // On force en tableau (cas où il n'y a qu'un seul client)
            const tableauBrut = Array.isArray(listeBrute) ? listeBrute : (listeBrute ? [listeBrute] : []);

            return tableauBrut.map(c => transformerCustomer(c));
        } catch (error) {
            console.error("Erreur de lecture des clients :", error);
            throw error;
        }
    },

    async createCustomer(donnees) {
        try {
            const builder = new XMLBuilder({
                ignoreAttributes: false,
                attributeNamePrefix: "@@",
                format: true
            });

            const isGuest = donnees.is_guest ? 1 : 0;

            // Construction de la structure XML pour un client
            const objetPourXML = {
                prestashop: {
                    customer: {
                        firstname: donnees.firstname,
                        lastname: donnees.lastname,
                        email: donnees.email,
                        passwd: donnees.password, // Obligatoire pour la création
                        active: 1, // On l'active par défaut
                        newsletter: donnees.newsletter ? 1 : 0,
                        is_guest: isGuest,
                        id_gender: 1, // 1 pour M, 2 pour Mme (optionnel mais conseillé)
                        id_default_group: 3, // Groupe "Client" par défaut dans PrestaShop
                        associations: {
                            groups: {
                                group: { id: 3 }
                            }
                        }
                    }
                }
            };

            const xmlData = builder.build(objetPourXML);

            const response = await axios.post(`${BASE_URL}/customers`, xmlData, {
                auth: { username: WS_KEY, password: '' },
                headers: { 'Content-Type': 'application/xml' }
            });

            return parseCustomerResponse(response.data);
        } catch (error) {
            // PrestaShop renvoie souvent des erreurs détaillées en XML dans error.response.data
            console.error("Erreur création client :", error.response?.data || error);
            throw error;
        }
    },

    // Nouvelle fonction qui utilise le filtre is_guest
    async getTrueCustomers() {
        try {
            const allCustomers = await this.getCustomers();
            // On ne garde que ceux dont is_guest est égal à "0"
            return allCustomers.filter(c => c.is_guest !== "1");
        } catch (error) {
            console.error("Erreur lors du filtrage des vrais clients :", error);
            throw error;
        }
    },

    //avoir les invites
    async getGuests() {
        try {
            const allCustomers = await this.getCustomers();
            // On ne garde que ceux dont is_guest est égal à "1"
            return allCustomers.filter(c => c.is_guest === "1");
        } catch (error) {
            console.error("Erreur lors du filtrage des clients invités :", error);
            throw error;
        }
    }
};