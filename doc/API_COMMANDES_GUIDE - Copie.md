# 📋 Guide Complet - Gestion des Commandes PrestaShop 8.2.6 via API

## Table des matières
1. [Architecture Globale](#architecture-globale)
2. [Authentification API](#authentification-api)
3. [Pages et Interfaces à Créer](#pages-et-interfaces-à-créer)
4. [Endpoints API Détaillés](#endpoints-api-détaillés)
5. [Logiques Backend](#logiques-backend)
6. [Flux Complet des Commandes](#flux-complet-des-commandes)
7. [Exemples d'Appels API](#exemples-dappels-api)

---

## Architecture Globale

### Structure de l'Application Externe
```
Application Frontend (Vue.js / React)
    ↓ (Requêtes HTTP)
API Gateway / Middleware (Node.js / PHP)
    ↓ (Authentification + Transformation)
PrestaShop Webservice (API REST/XML)
    ↓ (Requêtes DB)
Base de Données PrestaShop
```

### Entités Principales
- **Order** : La commande (total, client, statut)
- **OrderDetail** : Les articles dans la commande
- **OrderPayment** : Les paiements effectués
- **OrderHistory** : L'historique des changements de statut
- **OrderInvoice** : Les factures PDF
- **Address** : Les adresses de livraison/facturation
- **Customer** : Les informations du client
- **Carrier** : Le transporteur et la livraison

---

## Authentification API

### Configuration Préalable
1. **Créer une clé API dans PrestaShop**
   - Aller à : Parametres > Avancé > Webservice
   - Créer une nouvelle clé
   - Permissions minimales requises :
     ```
     Orders (GET, POST, PUT)
     Order Details (GET, POST, PUT)
     Order Payments (GET, POST)
     Order History (GET)
     Order Invoices (GET)
     Addresses (GET)
     Customers (GET)
     Carriers (GET)
     ```

2. **Token d'authentification**
   ```javascript
   // Header requis pour chaque requête
   Authorization: "Basic " + btoa("API_KEY:") 
   // ou en GET : ?ws_key=API_KEY
   ```

### Exemple de Configuration (Frontend)
```javascript
// axios-instance.js
import axios from 'axios';

const PRESTASHOP_API_URL = 'http://localhost/prestashop_edition_classic_version_8.2.6/webservice';
const API_KEY = 'TON_API_KEY_ICI';

const axiosInstance = axios.create({
  baseURL: PRESTASHOP_API_URL,
  headers: {
    'Authorization': 'Basic ' + btoa(API_KEY + ':'),
    'Content-Type': 'application/xml',
    'Accept': 'application/json'
  }
});

export default axiosInstance;
```

---

## Pages et Interfaces à Créer

### 1. 📋 Page Liste des Commandes

#### Éléments UI
```
┌─────────────────────────────────────────────────────┐
│  🔍 COMMANDES                      [+ Nouvelle] [🔄] │
├─────────────────────────────────────────────────────┤
│ Filtre: [Statut ▼] [Période ▼] [Client ▼] [Chercher] │
├──────┬────────┬──────────┬─────────┬──────────┬──────┤
│ ID   │ Client │ Montant  │ Statut  │ Date     │ ⋮    │
├──────┼────────┼──────────┼─────────┼──────────┼──────┤
│ 1245 │ Jean D │ 250.50€  │ Payée   │ 11/05/26 │[👁️❌]│
│ 1244 │ Marie  │ 120.00€  │ En cours│ 10/05/26 │[👁️❌]│
│ 1243 │ Pierre │ 89.99€   │ Annulée │ 09/05/26 │[👁️❌]│
└──────┴────────┴──────────┴─────────┴──────────┴──────┘
```

#### API Appelées au Chargement
```bash
GET /orders?filter[id_order]=[filter]&filter[id_customer]=[filter]&sort=[id_order|DESC]&limit=50
GET /orders?filter[date_add]=[2024-01-01,2024-12-31]
GET /order_states (pour afficher les statuts)
```

#### Actions sur cette Page
- **Voir les détails** → Ouvre Page 2
- **Supprimer** → DELETE /orders/{id_order}
- **Nouvelle commande** → Ouvre Page 3
- **Recherche dynamique** → GET avec filtres en temps réel
- **Pagination** → Paramètres `limit` et `offset`

---

### 2. 📝 Page Détail d'une Commande

#### Éléments UI
```
┌───────────────────────────────────────────────────────┐
│ COMMANDE #1245                        [Modifier][PDF] │
├───────────────────────────────────────────────────────┤
│
│ 👤 CLIENT                    📍 ADRESSES
│ ├─ Nom: Jean Dupont          ├─ Livraison: 123 Rue X, 75000
│ ├─ Email: jean@mail.com      ├─ Facturation: Idem
│ ├─ Téléphone: 0612345678     └─
│ └─
│
│ 💳 PAIEMENT                  🚚 LIVRAISON
│ ├─ Mode: Carte               ├─ Transporteur: DHL
│ ├─ Montant: 250.50€          ├─ Statut: En cours
│ ├─ Statut: Payée             ├─ Tracking: FR123456789
│ └─ [+ Ajouter Paiement]      └─
│
│ 📦 ARTICLES
│ ├─ Produit A (SKU-001) × 2 = 100.00€
│ ├─ Produit B (SKU-002) × 1 = 50.00€
│ └─ [+ Ajouter Article]
│
│ RÉSUMÉ
│ ├─ Sous-total: 230.00€
│ ├─ Taxes: 20.50€
│ ├─ Livraison: 0.00€
│ └─ TOTAL: 250.50€
│
│ 📜 HISTORIQUE ACTIONS
│ ├─ [11/05 10:30] Statut changé: En attente → Payée (Admin)
│ ├─ [11/05 09:15] Commande créée (Client)
│ └─
│
│ 💬 MESSAGES CLIENT
│ ├─ Ajouter un message... [Envoyer]
│ └─
└───────────────────────────────────────────────────────┘
```

#### API Appelées au Chargement
```bash
# GET le détail de la commande
GET /orders/{id_order}

# GET les articles
GET /order_details?filter[id_order]={id_order}

# GET les paiements
GET /order_payments?filter[id_order]={id_order}

# GET l'historique
GET /order_history?filter[id_order]={id_order}

# GET le client
GET /customers/{id_customer}

# GET les adresses
GET /addresses/{id_address}

# GET les statuts possibles
GET /order_states

# GET les messages
GET /customer_threads?filter[id_order]={id_order}
```

#### Actions Possibles sur cette Page

**1. Changer le Statut**
```
Clic sur [Statut actuel] → Popup sélection
SELECT → Nouveau statut
CLICK [Valider]
→ PUT /orders/{id_order}
   Body: <order><current_state>{id_order_state}</current_state></order>
→ POST /order_history
   Body: Enregistrer le changement
→ Envoyer email au client (optionnel)
```

**2. Ajouter un Paiement**
```
CLICK [+ Ajouter Paiement]
Popup:
  - Montant: [input]
  - Mode: [Carte/Virement/Espèces]
  - Référence: [input]
  - Date: [date picker]
[Ajouter]
→ POST /order_payments
   Body: <order_payment>
         <order_reference>{order_ref}</order_reference>
         <amount>{amount}</amount>
         <payment_method>{method}</payment_method>
         <transaction_id>{ref}</transaction_id>
         <date_add>{date}</date_add>
         </order_payment>
```

**3. Ajouter un Article**
```
CLICK [+ Ajouter Article]
Modal:
  - Sélectionner Produit: [SELECT]
  - Quantité: [input]
  - Prix unitaire: [auto ou input]
[Ajouter]
→ POST /order_details
   Body: <order_detail>
         <id_order>{id_order}</id_order>
         <id_product>{id_product}</id_product>
         <product_quantity>{qty}</product_quantity>
         <product_price>{price}</product_price>
         </order_detail>
→ PUT /orders/{id_order}  (recalculer totaux)
```

**4. Générer Facture PDF**
```
CLICK [PDF]
→ GET /order_invoices?filter[id_order]={id_order}
→ Si existe: download du PDF
  Si n'existe pas:
    POST /order_invoices
    Body: <order_invoice><id_order>{id_order}</id_order></order_invoice>
→ Retourner le PDF au client
```

**5. Envoyer Message Client**
```
Saisir texte dans [Ajouter un message...]
CLICK [Envoyer]
→ POST /customer_messages
   Body: <customer_message>
         <id_customer_thread>{id}</id_customer_thread>
         <id_employee>{current_user}</id_employee>
         <message>{texte}</message>
         <private>0</private>
         <date_add>{now}</date_add>
         </customer_message>
→ Email d'notification au client
```

---

### 3. ➕ Page Créer Nouvelle Commande

#### Éléments UI
```
┌─────────────────────────────────────────────────────┐
│ CRÉER UNE NOUVELLE COMMANDE                         │
├─────────────────────────────────────────────────────┤
│
│ 1️⃣ SÉLECTIONNER CLIENT
│ Rechercher client: [Saisir nom/email]
│ → Résultats: [Client 1] [Client 2] [Créer nouveau]
│
│ 2️⃣ AJOUTER DES ARTICLES
│ Rechercher produit: [Saisir SKU/nom]  [Qty] [+ Ajouter]
│ ┌──────────────────────────────────────┐
│ │ Produit A (SKU-001)  × 2 = 100.00€  │
│ │ Produit B (SKU-002)  × 1 = 50.00€   │
│ │ [Supprimer] [Modifier]               │
│ └──────────────────────────────────────┘
│
│ 3️⃣ RÉDUCTION
│ Code promo: [input] [Appliquer]
│ OU Réduction manuelle: [montant] ou [%]
│
│ 4️⃣ LIVRAISON
│ Transporteur: [SELECT Transporteur]
│ Adresse: [SELECT ou créer nouvelle]
│
│ 5️⃣ PAIEMENT
│ Mode: [SELECT]
│ Montant: [auto-calculé]
│ Marquer comme payée: [✓]
│
│ ┌──────────────────────────────────────┐
│ │ Sous-total: 150.00€                  │
│ │ Taxes:      13.50€                   │
│ │ Livraison:  10.00€                   │
│ │ Réduction:  -5.00€                   │
│ │ TOTAL:      168.50€                  │
│ └──────────────────────────────────────┘
│
│                        [Annuler] [Créer]
└─────────────────────────────────────────────────────┘
```

#### API Appelées

**A. Recherche Client**
```bash
GET /customers?filter[firstname]={search}&filter[lastname]={search}
GET /customers?filter[email]={search}
```

**B. Recherche Produit**
```bash
GET /products?filter[name]={search}
GET /products?filter[reference]={search}
```

**C. Création de la Commande**
```bash
POST /orders
Body: <order>
      <id_customer>{id_customer}</id_customer>
      <id_address_delivery>{id_address}</id_address_delivery>
      <id_address_invoice>{id_address}</id_address_invoice>
      <id_carrier>{id_carrier}</id_carrier>
      <id_currency>{id_currency}</id_currency>
      <id_lang>{id_lang}</id_lang>
      <module>{payment_module}</module>
      <payment>{payment_method}</payment>
      <total_paid>{total}</total_paid>
      <total_paid_tax_incl>{total_ttc}</total_paid_tax_incl>
      <total_paid_tax_excl>{total_ht}</total_paid_tax_excl>
      <total_products>{product_total}</total_products>
      <total_products_wt>{product_total_ttc}</total_products_wt>
      <total_shipping>{shipping_cost}</total_shipping>
      <total_shipping_tax_incl>{shipping_ttc}</total_shipping_tax_incl>
      <total_shipping_tax_excl>{shipping_ht}</total_shipping_tax_excl>
      <total_discounts>{discount}</total_discounts>
      <current_state>{id_order_state}</current_state>
      </order>
```

**D. Ajouter Articles**
```bash
# Pour chaque article sélectionné:
POST /order_details
Body: <order_detail>
      <id_order>{id_order}</id_order>
      <id_product>{id_product}</id_product>
      <product_quantity>{qty}</product_quantity>
      <product_price>{price}</product_price>
      <product_name>{name}</product_name>
      <product_reference>{sku}</product_reference>
      </order_detail>
```

**E. Ajouter Paiement (si payée)**
```bash
POST /order_payments
Body: <order_payment>
      <order_reference>{order_ref}</order_reference>
      <amount>{amount}</amount>
      <payment_method>{method}</payment_method>
      </order_payment>
```

---

### 4. ✏️ Page Éditer Commande (Modal Pop-up)

#### Éléments Modifiables
- ✓ Articles (ajouter/supprimer/modifier quantité)
- ✓ Client (changer client)
- ✓ Adresses
- ✓ Transporteur
- ✓ Réductions manuelles
- ✓ Statut
- ✗ Paiements (voir historique, ajouter nouveau)

#### API Appelées
```bash
# Modifier un article existant
PUT /order_details/{id_order_detail}
Body: <order_detail>
      <product_quantity>{new_qty}</product_quantity>
      <product_price>{new_price}</product_price>
      </order_detail>

# Supprimer un article
DELETE /order_details/{id_order_detail}

# Modifier la commande
PUT /orders/{id_order}
Body: <order>
      <id_carrier>{new_carrier}</id_carrier>
      <id_address_delivery>{new_address}</id_address_delivery>
      </order>
```

---

## Endpoints API Détaillés

### 🔴 Commandes (Orders)

#### GET - Lister les commandes
```bash
GET /orders
GET /orders?filter[id_order]=123
GET /orders?filter[id_customer]=45
GET /orders?filter[current_state]=2
GET /orders?filter[date_add]=[2024-01-01,2024-12-31]
GET /orders?sort=[id_order|DESC]&limit=50&offset=0
```

**Réponse (JSON)**
```json
{
  "orders": [
    {
      "id_order": 1245,
      "id_customer": 42,
      "id_cart": 156,
      "id_address_delivery": 89,
      "id_address_invoice": 89,
      "id_carrier": 5,
      "id_currency": 1,
      "id_lang": 1,
      "current_state": 2,
      "payment": "Credit Card",
      "module": "ps_checkout",
      "total_paid": 250.50,
      "total_paid_tax_incl": 250.50,
      "total_paid_tax_excl": 208.75,
      "total_products": 150.00,
      "total_products_wt": 150.00,
      "total_shipping": 10.00,
      "total_shipping_tax_incl": 12.00,
      "total_shipping_tax_excl": 10.00,
      "total_discounts": -5.00,
      "invoice_number": 2025001,
      "invoice_date": "2026-05-11 10:30:00",
      "delivery_number": 0,
      "delivery_date": null,
      "valid": true,
      "date_add": "2026-05-11 09:15:00",
      "date_upd": "2026-05-11 10:30:00"
    }
  ]
}
```

#### GET - Détail d'une commande
```bash
GET /orders/1245
```

**Réponse**
```json
{
  "order": {
    "id": "1245",
    "associations": {
      "order_rows": [
        {
          "id": "1",
          "product_id": "15",
          "product_attribute_id": "0",
          "product_quantity": "2",
          "product_name": "Produit A",
          "product_reference": "SKU-001",
          "product_price": "50.00"
        }
      ],
      "payments": [
        {
          "id": "987",
          "order_reference": "PSABCD123456",
          "amount": "250.50",
          "payment_method": "Credit Card"
        }
      ],
      "customer": {
        "id": "42",
        "firstname": "Jean",
        "lastname": "Dupont",
        "email": "jean@example.com"
      }
    }
  }
}
```

#### POST - Créer une commande
```bash
POST /orders
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_customer>42</id_customer>
    <id_address_delivery>89</id_address_delivery>
    <id_address_invoice>89</id_address_invoice>
    <id_carrier>5</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <module>ps_checkout</module>
    <payment>Credit Card</payment>
    <total_paid>250.50</total_paid>
    <total_paid_tax_incl>250.50</total_paid_tax_incl>
    <total_paid_tax_excl>208.75</total_paid_tax_excl>
    <total_products>150.00</total_products>
    <total_products_wt>150.00</total_products_wt>
    <total_shipping>10.00</total_shipping>
    <total_shipping_tax_incl>12.00</total_shipping_tax_incl>
    <total_shipping_tax_excl>10.00</total_shipping_tax_excl>
    <total_discounts>-5.00</total_discounts>
    <current_state>1</current_state>
  </order>
</prestashop>
```

**Réponse (201 Created)**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id>1250</id>
    <id_customer>42</id_customer>
    ...
  </order>
</prestashop>
```

#### PUT - Modifier une commande
```bash
PUT /orders/1245
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <current_state>3</current_state>
    <id_carrier>6</id_carrier>
  </order>
</prestashop>
```

#### DELETE - Annuler une commande
```bash
DELETE /orders/1245
```

---

### 🟡 Détails de Commande (Order Details)

#### GET - Articles d'une commande
```bash
GET /order_details
GET /order_details?filter[id_order]=1245
GET /order_details?filter[id_product]=15
```

**Réponse**
```json
{
  "order_details": [
    {
      "id_order_detail": 1,
      "id_order": 1245,
      "id_product": 15,
      "product_quantity": 2,
      "product_price": 50.00,
      "product_name": "Produit A",
      "product_reference": "SKU-001"
    }
  ]
}
```

#### POST - Ajouter un article à une commande
```bash
POST /order_details
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_detail>
    <id_order>1245</id_order>
    <id_product>16</id_product>
    <product_quantity>1</product_quantity>
    <product_price>75.00</product_price>
    <product_name>Produit B</product_name>
  </order_detail>
</prestashop>
```

#### PUT - Modifier un article
```bash
PUT /order_details/2
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_detail>
    <product_quantity>3</product_quantity>
    <product_price>50.00</product_price>
  </order_detail>
</prestashop>
```

#### DELETE - Supprimer un article
```bash
DELETE /order_details/2
```

---

### 🔵 Paiements Commande (Order Payments)

#### GET - Paiements d'une commande
```bash
GET /order_payments
GET /order_payments?filter[id_order]=1245
```

**Réponse**
```json
{
  "order_payments": [
    {
      "id_order_payment": 987,
      "order_reference": "PSABCD123456",
      "amount": 250.50,
      "payment_method": "Credit Card",
      "transaction_id": "TXN12345678",
      "date_add": "2026-05-11 10:30:00"
    }
  ]
}
```

#### POST - Ajouter un paiement
```bash
POST /order_payments
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference>PSABCD123456</order_reference>
    <amount>250.50</amount>
    <payment_method>Credit Card</payment_method>
    <transaction_id>TXN12345678</transaction_id>
  </order_payment>
</prestashop>
```

---

### 🟢 Historique Commande (Order History)

#### GET - Historique des changements
```bash
GET /order_history
GET /order_history?filter[id_order]=1245
```

**Réponse**
```json
{
  "order_histories": [
    {
      "id_order_history": 1,
      "id_order": 1245,
      "id_order_state": 3,
      "id_employee": 1,
      "date_add": "2026-05-11 10:30:00"
    }
  ]
}
```

#### POST - Enregistrer un changement de statut
```bash
POST /order_history
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order>1245</id_order>
    <id_order_state>3</id_order_state>
    <id_employee>1</id_employee>
  </order_history>
</prestashop>
```

---

### 🟣 Factures (Order Invoices)

#### GET - Factures d'une commande
```bash
GET /order_invoices
GET /order_invoices?filter[id_order]=1245
```

**Réponse**
```json
{
  "order_invoices": [
    {
      "id_order_invoice": 1,
      "id_order": 1245,
      "number": 2025001,
      "date_add": "2026-05-11 10:30:00"
    }
  ]
}
```

#### POST - Générer une facture
```bash
POST /order_invoices
Content-Type: application/xml

<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_invoice>
    <id_order>1245</id_order>
  </order_invoice>
</prestashop>
```

---

### ⚫ Statuts de Commande (Order States)

#### GET - Liste des statuts disponibles
```bash
GET /order_states
```

**Réponse**
```json
{
  "order_states": [
    {
      "id_order_state": 1,
      "name": "En attente de paiement",
      "color": "#34209E"
    },
    {
      "id_order_state": 2,
      "name": "Paiement accepté",
      "color": "#32CD32"
    },
    {
      "id_order_state": 3,
      "name": "Préparation en cours",
      "color": "#4169E1"
    },
    {
      "id_order_state": 4,
      "name": "Expédié",
      "color": "#FF8C00"
    },
    {
      "id_order_state": 5,
      "name": "Livré",
      "color": "#228B22"
    },
    {
      "id_order_state": 6,
      "name": "Annulé",
      "color": "#DC143C"
    }
  ]
}
```

---

### 👥 Données Additionnelles

#### GET - Infos Client
```bash
GET /customers/42
```

#### GET - Adresses
```bash
GET /addresses/89
```

#### GET - Transporteurs
```bash
GET /carriers
GET /carriers/5
```

#### GET - Produits
```bash
GET /products
GET /products/15
GET /products?filter[reference]=SKU-001
```

---

## Logiques Backend

### 1. Calcul Automatique des Totaux

**Quand** : À chaque ajout/suppression/modification d'article

```javascript
function calculateOrderTotals(order) {
  // 1. Calculer le total des produits HT
  let total_products = 0;
  order.items.forEach(item => {
    total_products += (item.product_price * item.product_quantity);
  });

  // 2. Appliquer les réductions
  let total_after_discount = total_products;
  if (order.discount_type === 'fixed') {
    total_after_discount -= order.discount_value;
  } else if (order.discount_type === 'percentage') {
    total_after_discount -= (total_products * (order.discount_value / 100));
  }

  // 3. Ajouter la livraison
  let total_with_shipping = total_after_discount + order.shipping_cost;

  // 4. Ajouter les taxes
  let tax_rate = order.tax_rate || 0.20; // Par défaut 20%
  let total_taxes = total_with_shipping * tax_rate;
  let total_ht = total_with_shipping;
  let total_ttc = total_with_shipping + total_taxes;

  return {
    total_products: total_products,
    total_after_discount: total_after_discount,
    total_shipping: order.shipping_cost,
    total_taxes: total_taxes,
    total_ht: total_ht,
    total_ttc: total_ttc
  };
}
```

### 2. Gestion des Statuts de Commande

**Workflow typique**
```
En attente de paiement
    ↓ (Paiement reçu)
Paiement accepté
    ↓ (Préparation)
Préparation en cours
    ↓ (Expédition)
Expédié
    ↓ (Livraison)
Livré
    ↓ (Retour possible)
Retour accepté → Remboursé
```

**Backend Logic**
```javascript
async function updateOrderStatus(orderId, newStatusId) {
  try {
    // 1. Vérifier les règles de transition
    const currentOrder = await GET(`/orders/${orderId}`);
    const currentStatus = currentOrder.current_state;
    
    // Règles de transition autorisées
    const allowedTransitions = {
      1: [2, 6],        // En attente → Payée ou Annulée
      2: [3, 6],        // Payée → Préparation ou Annulée
      3: [4, 6],        // Préparation → Expédié ou Annulée
      4: [5, 7],        // Expédié → Livré ou Retour
      5: [7]            // Livré → Retour
    };

    if (!allowedTransitions[currentStatus].includes(newStatusId)) {
      throw new Error('Transition non autorisée');
    }

    // 2. Effectuer le changement
    await PUT(`/orders/${orderId}`, {
      current_state: newStatusId
    });

    // 3. Enregistrer dans l'historique
    await POST('/order_history', {
      id_order: orderId,
      id_order_state: newStatusId,
      id_employee: currentUserId
    });

    // 4. Envoyer email si configuré
    if (shouldSendEmail(newStatusId)) {
      await sendCustomerEmail(orderId, newStatusId);
    }

    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
```

### 3. Gestion des Paiements Multiples

```javascript
async function addPayment(orderId, amount, method) {
  // 1. Vérifier le montant restant
  const order = await GET(`/orders/${orderId}`);
  const payments = await GET(`/order_payments?filter[id_order]=${orderId}`);
  
  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const remainingAmount = order.total_paid - totalPaid;

  if (amount > remainingAmount) {
    throw new Error(`Montant trop élevé. Restant: ${remainingAmount}`);
  }

  // 2. Ajouter le paiement
  await POST('/order_payments', {
    order_reference: order.reference,
    amount: amount,
    payment_method: method,
    transaction_id: generateTransactionId()
  });

  // 3. Vérifier si commande entièrement payée
  if (totalPaid + amount === order.total_paid) {
    // Changer le statut à "Payée"
    await updateOrderStatus(orderId, 2);
  }

  return { success: true };
}
```

### 4. Gestion des Modifications d'Articles

```javascript
async function modifyOrderItem(orderId, itemId, newQuantity, newPrice = null) {
  // 1. Récupérer l'item actuel
  const item = await GET(`/order_details/${itemId}`);
  const oldTotal = item.product_price * item.product_quantity;

  // 2. Valider la modification
  if (newQuantity < 0) {
    throw new Error('Quantité invalide');
  }

  // 3. Si quantité = 0, supprimer l'item
  if (newQuantity === 0) {
    await DELETE(`/order_details/${itemId}`);
  } else {
    // Sinon, mettre à jour
    await PUT(`/order_details/${itemId}`, {
      product_quantity: newQuantity,
      product_price: newPrice || item.product_price
    });
  }

  // 4. Recalculer les totaux
  const newTotals = await calculateOrderTotals(orderId);
  await PUT(`/orders/${orderId}`, newTotals);

  // 5. Enregistrer dans l'historique
  await POST('/order_history', {
    id_order: orderId,
    note: `Article modifié: ${item.product_name} (qty: ${newQuantity})`
  });

  return { success: true };
}
```

---

## Flux Complet des Commandes

### Flux 1: Créer une Commande Manuelle

```
USER INTERFACE                  BACKEND LOGIC              API CALLS
────────────────────────────────────────────────────────────────────

1. Ouvre page Nouvelle cmd
   │
   ├─→ Récupère clients        ─→ Filtre clients        ─→ GET /customers
   │   & produits
   │
2. Recherche client "Jean"     ─→ Filtre résultats      ─→ GET /customers?filter[firstname]=Jean
   ├─→ Sélectionne Jean Dupont
   │
3. Ajoute articles
   ├─→ Saisit SKU ou nom       ─→ Recherche produit    ─→ GET /products?filter[reference]=SKU-001
   ├─→ Sélectionne Produit A
   ├─→ Quantité: 2             ─→ Récupère prix         ─→ Auto-complété
   ├─→ [+ Ajouter]
   │   └─→ Ajout à panier local
   │
4. Répète pour d'autres articles
   │
5. Applique réduction
   ├─→ Saisit code promo       ─→ Valide le code        ─→ GET /cart_rules?filter[code]=PROMO10
   │   ou montant              ─→ Applique réduction
   │
6. Sélectionne transporteur    ─→ Récupère tarif        ─→ GET /carriers
   │                           ─→ Ajoute frais           
   │
7. Sélectionne paiement        ─→ Accepte paiement      
   ├─→ Marque comme payée      ─→ Crée paiement
   │
8. [CRÉER] clique              ─→ VALIDATION:
   │                              • Vérifie montants
   │                              • Vérifie adresses
   │                              • Réserve stock
   │                           ─→ POST /orders
   │                               POST /order_details (×N articles)
   │                               POST /order_payments (si payée)
   │                               POST /order_history (statut initial)
   │                           ─→ Reçoit ID commande: 1250
   │
9. Affiche confirmation
   └─→ Commande créée #1250
       → Statut: En attente de paiement
       → Total: 250.50€
       → Client: Jean Dupont
```

### Flux 2: Changer le Statut de Commande

```
USER INTERFACE                  BACKEND LOGIC              API CALLS
────────────────────────────────────────────────────────────────────

1. Affiche commande #1245
   ├─→ Statut actuel: "Paiement accepté"
   │
2. [MODIFIER] Statut clique
   └─→ Popup statuts disponibles  ─→ Valide transitions    ─→ GET /order_states
       (selon règles)
       • Préparation en cours
       • Annulée
       │
3. Sélectionne "Préparation"    ─→ Vérifie règles
   │                               • Paiement accepté → Prépa: OK
   │
4. [Confirmer]                  ─→ PUT /orders/1245
   │                               {current_state: 3}
   │                            ─→ POST /order_history
   │                               {id_order: 1245,
   │                                id_order_state: 3}
   │                            ─→ Envoie email client
   │                               (si configuré)
   │
5. Actualise page
   └─→ Affiche nouveau statut
       "Préparation en cours"
```

### Flux 3: Ajouter un Paiement

```
USER INTERFACE                  BACKEND LOGIC              API CALLS
────────────────────────────────────────────────────────────────────

1. Affiche détail commande
   ├─→ Total: 250.50€
   ├─→ Payé: 150.00€
   └─→ Restant: 100.50€
   │
2. [+ Ajouter Paiement] clique
   └─→ Modal:
       • Montant: [100.50]  ─→ Auto-rempli (restant)
       • Mode: [Carte ▼]
       • Ref: [TXN123456]
       │
3. Saisit montant                ─→ Valide montant
   │ (modifie si besoin)         ─→ Montant ≤ Restant? ✓
   │
4. [Ajouter] clique              ─→ POST /order_payments
   │                                {order_reference: PSABCD,
   │                                 amount: 100.50,
   │                                 payment_method: Carte}
   │                             ─→ Récupère tous paiements
   │                                GET /order_payments?filter[id_order]=1245
   │                             ─→ Total payé = 250.50€?
   │                                OUI: PUT /orders/1245
   │                                     {current_state: 2} (Payée)
   │
5. Affiche confirmation
   └─→ Paiement ajouté: 100.50€
       Reste: 0.00€
       Statut → "Paiement accepté"
```

---

## Exemples d'Appels API

### 1. Exemple JavaScript (Fetch API)

```javascript
// Configuration
const API_BASE = 'http://localhost/prestashop_edition_classic_version_8.2.6/webservice';
const API_KEY = 'YOUR_API_KEY';

// Fonction authentification
function getAuthHeader() {
  const auth = btoa(API_KEY + ':');
  return {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/xml'
  };
}

// GET - Lister les commandes
async function getOrders() {
  const response = await fetch(
    `${API_BASE}/orders?sort=[id_order|DESC]&limit=50`,
    {
      method: 'GET',
      headers: getAuthHeader()
    }
  );
  return response.json();
}

// GET - Détail commande
async function getOrder(orderId) {
  const response = await fetch(
    `${API_BASE}/orders/${orderId}`,
    {
      method: 'GET',
      headers: getAuthHeader()
    }
  );
  return response.json();
}

// POST - Créer commande
async function createOrder(orderData) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_customer>${orderData.id_customer}</id_customer>
    <id_address_delivery>${orderData.id_address}</id_address_delivery>
    <id_address_invoice>${orderData.id_address}</id_address_invoice>
    <id_carrier>${orderData.id_carrier}</id_carrier>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <module>${orderData.payment_module}</module>
    <payment>${orderData.payment_method}</payment>
    <total_paid>${orderData.total}</total_paid>
    <total_paid_tax_incl>${orderData.total_ttc}</total_paid_tax_incl>
    <total_paid_tax_excl>${orderData.total_ht}</total_paid_tax_excl>
    <total_products>${orderData.product_total}</total_products>
    <total_products_wt>${orderData.product_total_ttc}</total_products_wt>
    <total_shipping>${orderData.shipping}</total_shipping>
    <total_shipping_tax_incl>${orderData.shipping_ttc}</total_shipping_tax_incl>
    <total_shipping_tax_excl>${orderData.shipping_ht}</total_shipping_tax_excl>
    <total_discounts>${orderData.discount}</total_discounts>
    <current_state>1</current_state>
  </order>
</prestashop>`;

  const response = await fetch(
    `${API_BASE}/orders`,
    {
      method: 'POST',
      headers: getAuthHeader(),
      body: xml
    }
  );
  
  if (response.status === 201) {
    return response.json();
  } else {
    throw new Error(`Erreur création: ${response.status}`);
  }
}

// PUT - Modifier statut
async function updateOrderStatus(orderId, newStatusId) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <current_state>${newStatusId}</current_state>
  </order>
</prestashop>`;

  const response = await fetch(
    `${API_BASE}/orders/${orderId}`,
    {
      method: 'PUT',
      headers: getAuthHeader(),
      body: xml
    }
  );
  return response.json();
}

// POST - Ajouter article
async function addOrderItem(orderId, productId, quantity, price) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_detail>
    <id_order>${orderId}</id_order>
    <id_product>${productId}</id_product>
    <product_quantity>${quantity}</product_quantity>
    <product_price>${price}</product_price>
  </order_detail>
</prestashop>`;

  const response = await fetch(
    `${API_BASE}/order_details`,
    {
      method: 'POST',
      headers: getAuthHeader(),
      body: xml
    }
  );
  return response.json();
}

// POST - Ajouter paiement
async function addPayment(orderId, amount, method) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference>PS123456</order_reference>
    <amount>${amount}</amount>
    <payment_method>${method}</payment_method>
  </order_payment>
</prestashop>`;

  const response = await fetch(
    `${API_BASE}/order_payments`,
    {
      method: 'POST',
      headers: getAuthHeader(),
      body: xml
    }
  );
  return response.json();
}

// DELETE - Supprimer commande
async function deleteOrder(orderId) {
  const response = await fetch(
    `${API_BASE}/orders/${orderId}`,
    {
      method: 'DELETE',
      headers: getAuthHeader()
    }
  );
  return response.status === 200;
}

// Utilisation exemple
(async () => {
  try {
    // Lister les commandes
    const orders = await getOrders();
    console.log('Commandes:', orders);

    // Créer une commande
    const newOrder = await createOrder({
      id_customer: 42,
      id_address: 89,
      id_carrier: 5,
      payment_module: 'ps_checkout',
      payment_method: 'Credit Card',
      total: 250.50,
      total_ttc: 250.50,
      total_ht: 208.75,
      product_total: 150.00,
      product_total_ttc: 150.00,
      shipping: 10.00,
      shipping_ttc: 12.00,
      shipping_ht: 10.00,
      discount: -5.00
    });
    console.log('Commande créée:', newOrder);

  } catch(error) {
    console.error('Erreur:', error);
  }
})();
```

### 2. Exemple PHP

```php
<?php

class PrestaShopOrderAPI {
    private $apiUrl = 'http://localhost/prestashop_edition_classic_version_8.2.6/webservice';
    private $apiKey = 'YOUR_API_KEY';

    private function getAuthHeader() {
        $auth = base64_encode($this->apiKey . ':');
        return [
            'Authorization: Basic ' . $auth,
            'Content-Type: application/xml'
        ];
    }

    // GET - Lister les commandes
    public function getOrders($filters = []) {
        $url = $this->apiUrl . '/orders';
        
        if (!empty($filters)) {
            foreach ($filters as $key => $value) {
                $url .= "?filter[$key]=$value";
            }
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getAuthHeader());
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response, true);
    }

    // POST - Créer une commande
    public function createOrder($orderData) {
        $xml = '<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id_customer>' . $orderData['id_customer'] . '</id_customer>
    <id_address_delivery>' . $orderData['id_address'] . '</id_address_delivery>
    <id_address_invoice>' . $orderData['id_address'] . '</id_address_invoice>
    <id_carrier>' . $orderData['id_carrier'] . '</id_carrier>
    <id_currency>1</id_currency>
    <module>' . $orderData['payment_module'] . '</module>
    <payment>' . $orderData['payment_method'] . '</payment>
    <total_paid>' . $orderData['total'] . '</total_paid>
    <total_paid_tax_incl>' . $orderData['total_ttc'] . '</total_paid_tax_incl>
    <total_products>' . $orderData['product_total'] . '</total_products>
    <total_shipping>' . $orderData['shipping'] . '</total_shipping>
    <current_state>1</current_state>
  </order>
</prestashop>';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->apiUrl . '/orders');
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getAuthHeader());
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $xml);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 201) {
            return json_decode($response, true);
        } else {
            throw new Exception("Erreur création commande: HTTP $httpCode");
        }
    }

    // PUT - Modifier le statut
    public function updateOrderStatus($orderId, $newStatusId) {
        $xml = '<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <current_state>' . $newStatusId . '</current_state>
  </order>
</prestashop>';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->apiUrl . '/orders/' . $orderId);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getAuthHeader());
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $xml);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response, true);
    }

    // DELETE - Supprimer une commande
    public function deleteOrder($orderId) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->apiUrl . '/orders/' . $orderId);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getAuthHeader());
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $httpCode === 200;
    }
}

// Utilisation
try {
    $api = new PrestaShopOrderAPI();
    
    // Lister les commandes
    $orders = $api->getOrders(['id_customer' => 42]);
    echo json_encode($orders, JSON_PRETTY_PRINT);

    // Créer une commande
    $newOrder = $api->createOrder([
        'id_customer' => 42,
        'id_address' => 89,
        'id_carrier' => 5,
        'payment_module' => 'ps_checkout',
        'payment_method' => 'Credit Card',
        'total' => 250.50,
        'total_ttc' => 250.50,
        'product_total' => 150.00,
        'shipping' => 10.00
    ]);
    echo "Commande créée: " . json_encode($newOrder);

} catch (Exception $e) {
    echo "Erreur: " . $e->getMessage();
}
?>
```

### 3. Exemple Vue.js (Composant)

```vue
<template>
  <div class="orders-container">
    <h1>Gestion des Commandes</h1>

    <!-- Onglets -->
    <div class="tabs">
      <button 
        :class="{ active: activeTab === 'list' }"
        @click="activeTab = 'list'">
        📋 Lister
      </button>
      <button 
        :class="{ active: activeTab === 'create' }"
        @click="activeTab = 'create'">
        ➕ Créer
      </button>
    </div>

    <!-- Onglet: Lister les commandes -->
    <div v-if="activeTab === 'list'" class="tab-content">
      <div class="filters">
        <input 
          v-model="filters.search"
          @input="fetchOrders"
          placeholder="Rechercher...">
        <select v-model="filters.status" @change="fetchOrders">
          <option value="">Tous les statuts</option>
          <option value="1">En attente</option>
          <option value="2">Payée</option>
          <option value="3">Préparation</option>
        </select>
      </div>

      <table class="orders-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Client</th>
            <th>Montant</th>
            <th>Statut</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id_order">
            <td>{{ order.id_order }}</td>
            <td>{{ order.customer_name }}</td>
            <td>{{ order.total_paid }}€</td>
            <td>{{ getStatusName(order.current_state) }}</td>
            <td>{{ formatDate(order.date_add) }}</td>
            <td>
              <button @click="viewOrder(order.id_order)">👁️</button>
              <button @click="deleteOrder(order.id_order)">❌</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Onglet: Créer une commande -->
    <div v-if="activeTab === 'create'" class="tab-content">
      <form @submit.prevent="submitNewOrder">
        
        <!-- Sélection Client -->
        <div class="form-group">
          <label>Client:</label>
          <input 
            v-model="newOrder.customer_search"
            @input="searchCustomers"
            placeholder="Nom ou email...">
          <ul v-if="customerResults.length" class="results">
            <li v-for="c in customerResults" :key="c.id_customer"
                @click="selectCustomer(c)">
              {{ c.firstname }} {{ c.lastname }}
            </li>
          </ul>
        </div>

        <!-- Ajout Articles -->
        <div class="form-group">
          <label>Articles:</label>
          <input 
            v-model="productSearch"
            @input="searchProducts"
            placeholder="SKU ou nom produit...">
          <ul v-if="productResults.length" class="results">
            <li v-for="p in productResults" :key="p.id_product"
                @click="selectProduct(p)">
              {{ p.name }} - {{ p.price }}€
            </li>
          </ul>
          
          <div class="added-items">
            <div v-for="(item, idx) in newOrder.items" :key="idx" class="item-row">
              <span>{{ item.product_name }} × {{ item.quantity }}</span>
              <button @click="removeItem(idx)" type="button">❌</button>
            </div>
          </div>
        </div>

        <!-- Montants -->
        <div class="form-group">
          <div class="totals">
            <p>Sous-total: {{ newOrder.subtotal }}€</p>
            <p>Taxes: {{ newOrder.taxes }}€</p>
            <p>Livraison: {{ newOrder.shipping }}€</p>
            <p class="total">TOTAL: {{ newOrder.total }}€</p>
          </div>
        </div>

        <!-- Bouttons -->
        <button type="submit" class="btn-primary">✓ Créer Commande</button>
        <button @click="activeTab = 'list'" type="button" class="btn-secondary">
          Annuler
        </button>
      </form>
    </div>

    <!-- Modal: Détail commande -->
    <OrderDetailModal 
      v-if="selectedOrderId"
      :order-id="selectedOrderId"
      @close="selectedOrderId = null"
      @updated="fetchOrders" />
  </div>
</template>

<script>
import api from '@/api/axios-instance';
import OrderDetailModal from '@/components/OrderDetailModal.vue';

export default {
  components: { OrderDetailModal },
  data() {
    return {
      activeTab: 'list',
      orders: [],
      orderStates: [],
      filters: { search: '', status: '' },
      newOrder: {
        id_customer: null,
        items: [],
        subtotal: 0,
        taxes: 0,
        shipping: 0,
        total: 0,
        customer_search: ''
      },
      customerResults: [],
      productSearch: '',
      productResults: [],
      selectedOrderId: null
    };
  },
  methods: {
    async fetchOrders() {
      try {
        const response = await api.get('/orders', {
          params: {
            'filter[id_customer]': this.filters.search,
            'filter[current_state]': this.filters.status
          }
        });
        this.orders = response.data.orders || [];
      } catch (error) {
        console.error('Erreur chargement commandes:', error);
      }
    },
    async searchCustomers() {
      if (this.newOrder.customer_search.length < 2) return;
      
      try {
        const response = await api.get('/customers', {
          params: {
            'filter[firstname]': this.newOrder.customer_search
          }
        });
        this.customerResults = response.data.customers || [];
      } catch (error) {
        console.error('Erreur recherche clients:', error);
      }
    },
    selectCustomer(customer) {
      this.newOrder.id_customer = customer.id_customer;
      this.newOrder.customer_search = customer.firstname + ' ' + customer.lastname;
      this.customerResults = [];
    },
    async searchProducts() {
      if (this.productSearch.length < 2) return;
      
      try {
        const response = await api.get('/products', {
          params: {
            'filter[name]': this.productSearch
          }
        });
        this.productResults = response.data.products || [];
      } catch (error) {
        console.error('Erreur recherche produits:', error);
      }
    },
    selectProduct(product) {
      const qty = prompt('Quantité?', '1');
      if (qty) {
        this.newOrder.items.push({
          id_product: product.id_product,
          product_name: product.name,
          quantity: qty,
          price: product.price
        });
        this.productResults = [];
        this.productSearch = '';
        this.calculateTotals();
      }
    },
    removeItem(idx) {
      this.newOrder.items.splice(idx, 1);
      this.calculateTotals();
    },
    calculateTotals() {
      let subtotal = 0;
      this.newOrder.items.forEach(item => {
        subtotal += item.price * item.quantity;
      });
      this.newOrder.subtotal = subtotal.toFixed(2);
      this.newOrder.taxes = (subtotal * 0.2).toFixed(2);
      this.newOrder.shipping = 10; // exemple
      this.newOrder.total = (parseFloat(this.newOrder.subtotal) + 
                             parseFloat(this.newOrder.taxes) + 
                             this.newOrder.shipping).toFixed(2);
    },
    async submitNewOrder() {
      try {
        // Créer la commande
        const orderResponse = await api.post('/orders', {
          id_customer: this.newOrder.id_customer,
          id_address_delivery: 1, // À récupérer
          id_address_invoice: 1,
          id_carrier: 5,
          total_paid: this.newOrder.total,
          total_paid_tax_incl: this.newOrder.total,
          total_products: this.newOrder.subtotal,
          current_state: 1
        });

        const orderId = orderResponse.data.order.id;

        // Ajouter les articles
        for (const item of this.newOrder.items) {
          await api.post('/order_details', {
            id_order: orderId,
            id_product: item.id_product,
            product_quantity: item.quantity,
            product_price: item.price
          });
        }

        alert('✓ Commande créée: #' + orderId);
        this.resetForm();
        this.fetchOrders();

      } catch (error) {
        console.error('Erreur création:', error);
        alert('❌ Erreur: ' + error.message);
      }
    },
    resetForm() {
      this.newOrder = {
        id_customer: null,
        items: [],
        subtotal: 0,
        taxes: 0,
        shipping: 0,
        total: 0,
        customer_search: ''
      };
      this.activeTab = 'list';
    },
    viewOrder(orderId) {
      this.selectedOrderId = orderId;
    },
    async deleteOrder(orderId) {
      if (confirm('Êtes-vous sûr de vouloir annuler cette commande?')) {
        try {
          await api.delete(`/orders/${orderId}`);
          alert('✓ Commande annulée');
          this.fetchOrders();
        } catch (error) {
          alert('❌ Erreur: ' + error.message);
        }
      }
    },
    getStatusName(statusId) {
      const status = this.orderStates.find(s => s.id_order_state === statusId);
      return status ? status.name : '?';
    },
    formatDate(date) {
      return new Date(date).toLocaleDateString('fr-FR');
    }
  },
  mounted() {
    this.fetchOrders();
    this.fetchOrderStates();
  },
  async fetchOrderStates() {
    try {
      const response = await api.get('/order_states');
      this.orderStates = response.data.order_states || [];
    } catch (error) {
      console.error('Erreur statuts:', error);
    }
  }
};
</script>

<style scoped>
.orders-container {
  padding: 20px;
  max-width: 1200px;
}

.tabs {
  display: flex;
  gap: 10px;
  margin: 20px 0;
}

.tabs button {
  padding: 10px 20px;
  background: #f0f0f0;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.tabs button.active {
  background: #007bff;
  color: white;
}

.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.filters input, .filters select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
}

.orders-table th, .orders-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.orders-table th {
  background: #f5f5f5;
  font-weight: bold;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

.form-group input, .form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.results {
  list-style: none;
  padding: 0;
  background: white;
  border: 1px solid #ddd;
  max-height: 200px;
  overflow-y: auto;
}

.results li {
  padding: 10px;
  cursor: pointer;
}

.results li:hover {
  background: #f0f0f0;
}

.totals {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  margin: 10px 0;
}

.totals .total {
  font-weight: bold;
  font-size: 1.2em;
  color: #007bff;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 10px;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}
</style>
```

---

## Récapitulatif des Points Clés

### ✅ À faire AVANT de commencer:
1. ✓ Créer une clé API dans PrestaShop (Paramètres > Webservice)
2. ✓ Configurer les permissions (Orders, Order Details, Payments, etc.)
3. ✓ Tester la connexion API (GET /orders)
4. ✓ Installer les dépendances (axios, vue, etc.)

### 📱 Pages à créer:
1. **Liste des Commandes** - Vue d'ensemble avec filtres
2. **Détail Commande** - Modal avec toutes les infos
3. **Créer Commande** - Formulaire complet
4. **Éditer Articles** - Ajouter/supprimer/modifier items

### 🔗 Endpoints clés:
- `GET /orders` - Lister
- `GET /orders/{id}` - Détail
- `POST /orders` - Créer
- `PUT /orders/{id}` - Modifier
- `POST /order_details` - Ajouter article
- `POST /order_payments` - Ajouter paiement
- `POST /order_history` - Enregistrer changement
- `GET /order_states` - Statuts disponibles

### 💡 Logiques importantes:
- Recalculer automatiquement les totaux
- Valider les transitions de statut
- Vérifier les montants restants pour paiements
- Envoyer emails de notification
- Gérer les erreurs API gracieusement

Voilà! Vous avez maintenant un guide complet pour construire votre application de gestion des commandes! 🚀
