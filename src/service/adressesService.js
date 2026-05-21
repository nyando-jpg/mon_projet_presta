// Axios prend les données du back
import axios from 'axios'; 

// XMLParser : XML en Json
// XMLBuilder : Json en XML
import { XMLParser, XMLBuilder } from 'fast-xml-parser'; 

const WS_KEY = 'JIL969E9LBVRP7RUYHT3ZGWDVF9PDF4W';
const BASE_URL = 'http://localhost/prestashop1/api';

// ==========================================
// LES "NETTOYEURS" (FONCTIONS UTILITAIRES)
// ==========================================

/**
 * extractVal : La fonction "Anti-Crash"
 * Pourquoi ? PrestaShop gère plusieurs langues ou formats d'objets imbriqués.
 * Cette fonction descend dans l'objet pour trouver le texte final, peu importe où il est caché.
 */
const extractVal = (node) => {
    // 1. Si la donnée n'existe pas (null/undefined), on renvoie du vide pour éviter les crashs.
    if (!node) return '';
    
    // 2. Si c'est déjà une chaîne de caractères ou un nombre, on force en String.
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    
    // 3. Si c'est un objet (cas du XML traduit ou avec attributs), on cherche à l'intérieur.
    if (typeof node === 'object') {
        if (node.language) {
            if (Array.isArray(node.language)) return extractVal(node.language[0]);
            return node.language['#text'] || node.language || '';
        }
        if ('#text' in node) return node['#text'];
    }
    return '';
};

/**
 * transformerAdresse : Le "Décorateur"
 * Rôle : Convertir une adresse "brute" (XML bizarre) en objet JS "propre"
 * (TOUTES LES VALEURS SONT SÉCURISÉES ET NORMALISÉES EN STRINGS)
 */
const transformerAdresse = (a) => {
    if (!a) return null;
    
    return {
        id: extractVal(a.id),
        id_customer: extractVal(a.id_customer),
        alias: extractVal(a.alias),
        address1: extractVal(a.address1),
        postcode: extractVal(a.postcode),
        city: extractVal(a.city),
        phone: extractVal(a.phone),
        firstname: extractVal(a.firstname),
        lastname: extractVal(a.lastname)
    };
};

// ==========================================
// LE CŒUR DU SERVICE (MÉTHODES API)
// ==========================================

export default {
    
    /**
     * createAddress : Envoie les données au serveur et crée l'adresse
     */
    async createAddress(data) {
        try {
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

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            
            // On nettoie et structure l'adresse créée avant de la renvoyer
            return transformerAdresse(result?.prestashop?.address);
        } catch (error) {
            console.error('Erreur lors de la création de l\'adresse:', error);
            throw error;
        }
    },

    /**
     * getAddressesByCustomer : Récupère et nettoie la liste des adresses d'un client
     */
    async getAddressesByCustomer(customerId) {
        try {
            const response = await axios.get(`${BASE_URL}/addresses?filter[id_customer]=[${customerId}]&display=full`, {
                auth: { username: WS_KEY, password: '' },
                responseType: 'text' // On demande le XML brut
            });

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            
            const addressesNode = result?.prestashop?.addresses?.address || [];
            
            // Sécurité : si PrestaShop n'a qu'une seule adresse, il envoie un objet au lieu d'un tableau.
            // On force le passage en tableau pour que le .map() fonctionne à tous les coups.
            const array = Array.isArray(addressesNode) ? addressesNode : (addressesNode ? [addressesNode] : []);

            // On passe chaque adresse dans notre décorateur "transformerAdresse"
            return array.map(a => transformerAdresse(a));
        } catch (error) {
            console.error('Erreur récupération adresses client:', error);
            return [];
        }
    }
};