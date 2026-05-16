# 🛒 Guide Complet - Flux Front-End (Produits & Panier)

## Table des matières
1. [Flux de Navigation](#flux-de-navigation)
2. [Pages à Créer](#pages-à-créer)
3. [APIs à Appeler](#apis-à-appeler)
4. [Gestion du Panier](#gestion-du-panier)
5. [Exemples Complets](#exemples-complets)
6. [Architecture Stockage](#architecture-stockage)

---

## Flux de Navigation

```
┌─────────────────┐
│  1. LISTE       │
│  Produits       │
└────────┬────────┘
         │ (Click sur produit)
         ↓
┌─────────────────────────────────┐
│  2. DÉTAIL PRODUIT              │
│  - Infos complètes              │
│  - Images                       │
│  - Prix                         │
│  - Variantes (si existe)        │
│  [+ Ajouter au Panier]          │
└────────┬────────────────────────┘
         │ (Click sur bouton)
         ↓
┌─────────────────────────────────┐
│  3. POP-UP CONFIRMATION         │
│  "Article ajouté au panier"     │
│  [Continuer les achats] [Panier]│
└────┬──────────────────────────┬─┘
     │                          │
     │ (Continue)               │ (Panier)
     ↓                          ↓
┌─────────────────┐      ┌──────────────────┐
│ Retour à liste  │      │ 4. MON PANIER    │
│ de produits     │      │ - Articles       │
└─────────────────┘      │ - Quantités      │
                         │ - Prix           │
                         │ [Commander]      │
                         └──────┬───────────┘
                                │
                                ↓
                    ┌─────────────────────────┐
                    │ 5. PAGE COMMANDE        │
                    │ (voir guide précédent)  │
                    └─────────────────────────┘
```

---

## Pages à Créer

### 📋 Page 1: Liste des Produits

#### Éléments UI
```
┌─────────────────────────────────────────────────────┐
│ 🛒 NOTRE BOUTIQUE              [🔍 Rechercher] [🛒] │
├─────────────────────────────────────────────────────┤
│ Filtres:                                            │
│ Catégorie: [Toutes ▼]  Prix: [Min] - [Max] [🔄]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │          │  │          │  │          │          │
│  │ Produit1 │  │ Produit2 │  │ Produit3 │  ...    │
│  │          │  │          │  │          │          │
│  │ 49.99€   │  │ 79.99€   │  │ 29.99€   │          │
│  │[Détails] │  │[Détails] │  │[Détails] │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                     │
│  ┌──────────┐  ┌──────────┐                        │
│  │ Produit4 │  │ Produit5 │                        │
│  │ 120.00€  │  │ 39.99€   │                        │
│  │[Détails] │  │[Détails] │                        │
│  └──────────┘  └──────────┘                        │
│                                                     │
│  Pagination: [< Prev] [1] [2] [3] [Next >]         │
└─────────────────────────────────────────────────────┘
```

#### API Appelée au Chargement
```bash
GET /products
GET /products?filter[active]=1
GET /products?filter[category]=5
GET /products?sort=price&sort_order=asc&limit=12&offset=0
```

**Réponse (JSON)**
```json
{
  "products": [
    {
      "id_product": 1,
      "name": "Produit A",
      "description_short": "Description courte",
      "price": 49.99,
      "id_category": 5,
      "image_url": "http://example.com/img/product1.jpg",
      "reference": "SKU-001",
      "stock": 15
    },
    {
      "id_product": 2,
      "name": "Produit B",
      "price": 79.99,
      "image_url": "http://example.com/img/product2.jpg",
      "reference": "SKU-002",
      "stock": 8
    }
  ],
  "pagination": {
    "total": 42,
    "per_page": 12,
    "current_page": 1
  }
}
```

#### Actions
- **Click sur [Détails]** → Navigue vers Page 2 avec `id_product`
- **Recherche** → Appelle GET /products avec filtre `name`
- **Filtre catégorie** → GET /products avec filtre `category`
- **Pagination** → GET /products avec paramètres `offset` et `limit`

---

### 📝 Page 2: Détail du Produit

#### Éléments UI
```
┌───────────────────────────────────────────────────────┐
│ [← Retour]                                    [🛒] (3) │
├───────────────────────────────────────────────────────┤
│
│ ┌─────────────────┐      ┌──────────────────────────┐
│ │                 │      │ PRODUIT A                │
│ │   Image 1 (big) │      │ SKU: SKU-001             │
│ │                 │      │ ⭐⭐⭐⭐⭐ (42 avis)      │
│ ├─────────────────┤      │                          │
│ │ Thumb1 Thumb2  │      │ PRIX: 49.99€             │
│ │ Thumb3 Thumb4  │      │ Stock: 15 pièces ✓       │
│ └─────────────────┘      │                          │
│                          │ DESCRIPTION:             │
│                          │ Lorem ipsum dolor sit... │
│                          │                          │
│                          │ CARACTÉRISTIQUES:       │
│                          │ ├─ Couleur: [🔴🟢🔵]    │
│                          │ ├─ Taille: [S] [M] [L]  │
│                          │ └─ Quantité: [1] ↑↓      │
│                          │                          │
│                          │ PRIX TOTAL: 49.99€      │
│                          │ [+ Ajouter au Panier]   │
│                          │                          │
│                          │ LIVRAISON GRATUITE       │
│                          │ À partir de 50€          │
│                          └──────────────────────────┘
│
│ PRODUITS ASSOCIÉS:
│ ┌──────┐ ┌──────┐ ┌──────┐
│ │ Prod │ │ Prod │ │ Prod │
│ └──────┘ └──────┘ └──────┘
│
└───────────────────────────────────────────────────────┘
```

#### APIs Appelées au Chargement
```bash
# Détail produit
GET /products/1

# Images du produit
GET /products/1/images

# Attributs/Variantes
GET /product_attributes?filter[id_product]=1

# Avis clients (si existe)
GET /product_reviews?filter[id_product]=1

# Produits similaires
GET /products?filter[category]=5&exclude[id_product]=1&limit=4
```

**Réponse GET /products/1**
```json
{
  "product": {
    "id_product": 1,
    "name": "Produit A",
    "description_short": "Description courte du produit",
    "description": "Description longue avec plus de détails...",
    "price": 49.99,
    "price_with_tax": 59.99,
    "reference": "SKU-001",
    "ean13": "1234567890123",
    "weight": 0.5,
    "stock": 15,
    "id_category": 5,
    "category_name": "Électronique",
    "manufacturer_name": "Brand XYZ",
    "images": [
      {
        "id_image": 101,
        "url": "http://example.com/img/p1_1.jpg"
      },
      {
        "id_image": 102,
        "url": "http://example.com/img/p1_2.jpg"
      }
    ],
    "attributes": [
      {
        "id_attribute": 1,
        "name": "Couleur",
        "values": ["Rouge", "Vert", "Bleu"]
      },
      {
        "id_attribute": 2,
        "name": "Taille",
        "values": ["S", "M", "L", "XL"]
      }
    ]
  }
}
```

#### Actions
- **Click sur [+ Ajouter au Panier]**
  ```javascript
  // Récupère:
  // - id_product: 1
  // - variante sélectionnée (couleur, taille)
  // - quantité: 1
  
  // Appelle:
  // POST /carts/{cart_id}/items
  // Body: { id_product, quantity, variant_data }
  
  // Affiche: POP-UP CONFIRMATION (Page 3)
  ```

---

### 🎯 Page 3: Pop-Up Confirmation

#### Éléments UI
```
╔═══════════════════════════════════════════════════╗
║ ✓ ARTICLE AJOUTÉ AU PANIER                        ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  ┌───────────────┐                                ║
║  │               │  Produit A (Rouge, S)          ║
║  │   Image       │  Quantité: 1                   ║
║  │               │  Prix: 49.99€                  ║
║  └───────────────┘                                ║
║                                                   ║
║  Panier: 1 article (49.99€)                       ║
║                                                   ║
║  [Continuer les achats]  [Voir le Panier →]      ║
╚═══════════════════════════════════════════════════╝
```

#### Logique (pas d'API, juste UI)
```javascript
// Au clic sur [+ Ajouter au Panier] (Page 2):
// 1. Sauvegarder dans le panier (voir section 4)
// 2. Afficher ce pop-up
// 3. Attendre l'action utilisateur:

if (clickContinuer) {
  // Fermer pop-up
  // Rester sur Page 2 (détail produit)
  // ou retourner à Page 1 (liste)
} 
else if (clickPanier) {
  // Fermer pop-up
  // Naviguer vers Page 4 (Panier)
}
```

---

### 🛒 Page 4: Mon Panier

#### Éléments UI
```
┌───────────────────────────────────────────────────────┐
│ [← Continuer les achats]  MON PANIER          [🛒] (3) │
├───────────────────────────────────────────────────────┤
│
│ ┌─────────┬──────────────┬────────┬────────┬─────────┐
│ │ Produit │ Attribut     │ Qté    │ P.U.   │ Total   │
│ ├─────────┼──────────────┼────────┼────────┼─────────┤
│ │ Prod A  │ Rouge, Petit │  2  ↑↓ │ 49.99€ │ 99.98€  │ [❌]
│ │ Prod B  │ Bleu, Large  │  1  ↑↓ │ 79.99€ │ 79.99€  │ [❌]
│ │ Prod C  │ -            │  3  ↑↓ │ 29.99€ │ 89.97€  │ [❌]
│ └─────────┴──────────────┴────────┴────────┴─────────┘
│
│ RÉSUMÉ:
│ ├─ Sous-total:       269.94€
│ ├─ Frais de port:     0.00€ (Gratuit à partir de 50€)
│ ├─ Taxes:            54.00€
│ └─ TOTAL:           323.94€
│
│ CODES PROMO:
│ Entrez code: [__________] [Appliquer]
│
│ ┌─────────────────────────────────────────────────┐
│ │ Code "PROMO10" appliqué: -32.39€                │
│ │                                                  │
│ │ TOTAL FINAL: 291.55€                            │
│ └─────────────────────────────────────────────────┘
│
│ [← Continuer]    [Commander →]
│
└───────────────────────────────────────────────────────┘
```

#### APIs Appelées au Chargement
```bash
# Récupérer le contenu du panier
GET /carts/{cart_id}
GET /carts/current

# Recalculer avec codes promo
GET /cart_rules?filter[code]=PROMO10
```

**Réponse GET /carts/current**
```json
{
  "cart": {
    "id_cart": 156,
    "items": [
      {
        "id_product": 1,
        "name": "Produit A",
        "quantity": 2,
        "unit_price": 49.99,
        "total": 99.98,
        "attributes": {
          "couleur": "Rouge",
          "taille": "S"
        }
      },
      {
        "id_product": 2,
        "name": "Produit B",
        "quantity": 1,
        "unit_price": 79.99,
        "total": 79.99,
        "attributes": {
          "couleur": "Bleu",
          "taille": "L"
        }
      },
      {
        "id_product": 3,
        "name": "Produit C",
        "quantity": 3,
        "unit_price": 29.99,
        "total": 89.97,
        "attributes": null
      }
    ],
    "subtotal": 269.94,
    "shipping_cost": 0.00,
    "taxes": 54.00,
    "total": 323.94,
    "currency": "EUR"
  }
}
```

#### Actions sur Page 4

**1. Modifier Quantité**
```bash
# Click sur ↑ ou ↓ à côté de la quantité
PUT /carts/{cart_id}/items/{id_product}
Body: { quantity: 3 }

# Recalcule automatiquement les totaux
```

**2. Supprimer Article**
```bash
# Click sur [❌]
DELETE /carts/{cart_id}/items/{id_product}

# Retire l'article et recalcule
```

**3. Appliquer Code Promo**
```bash
# Saisir "PROMO10" et click [Appliquer]
POST /carts/{cart_id}/apply-coupon
Body: { code: "PROMO10" }

# Réponse:
{
  "success": true,
  "discount": 32.39,
  "new_total": 291.55
}

# Ou erreur si code invalide:
{
  "success": false,
  "error": "Code promo expiré ou invalide"
}
```

**4. Continuer Shopping**
```bash
# Click [← Continuer]
# Retour à Page 1 (liste produits)
```

**5. Commander**
```bash
# Click [Commander →]
# Valide le panier
# Navigue vers page de paiement/commande
# (Voir guide précédent: API_COMMANDES_GUIDE.md)
```

---

## APIs à Appeler

### 📦 PRODUITS (Products)

#### GET - Lister les produits
```bash
GET /products
GET /products?limit=12&offset=0
GET /products?filter[active]=1
GET /products?filter[category]=5
GET /products?filter[name]=Produit
GET /products?sort=price&sort_order=asc
```

**Réponse**
```json
{
  "products": [
    {
      "id_product": 1,
      "name": "Produit A",
      "description_short": "...",
      "price": 49.99,
      "id_category": 5,
      "image_url": "...",
      "reference": "SKU-001",
      "stock": 15,
      "active": 1
    }
  ],
  "pagination": {
    "total": 150,
    "per_page": 12,
    "current_page": 1
  }
}
```

#### GET - Détail d'un produit
```bash
GET /products/1
```

**Réponse**
```json
{
  "product": {
    "id_product": 1,
    "name": "Produit A",
    "description_short": "...",
    "description": "...",
    "price": 49.99,
    "price_with_tax": 59.99,
    "reference": "SKU-001",
    "weight": 0.5,
    "stock": 15,
    "id_category": 5,
    "manufacturer": "Brand XYZ",
    "images": [
      { "id_image": 101, "url": "..." },
      { "id_image": 102, "url": "..." }
    ],
    "attributes": [
      {
        "id_attribute": 1,
        "name": "Couleur",
        "values": ["Rouge", "Vert", "Bleu"]
      }
    ]
  }
}
```

---

### 🛒 PANIER (Cart)

#### GET - Récupérer le panier
```bash
GET /carts/current
GET /carts/{cart_id}
```

**Réponse**
```json
{
  "cart": {
    "id_cart": 156,
    "id_customer": 42,
    "items": [
      {
        "id_product": 1,
        "name": "Produit A",
        "quantity": 2,
        "unit_price": 49.99,
        "total": 99.98,
        "attributes": {
          "couleur": "Rouge",
          "taille": "S"
        }
      }
    ],
    "subtotal": 269.94,
    "shipping_cost": 0.00,
    "taxes": 54.00,
    "total": 323.94
  }
}
```

#### POST - Créer/Récupérer panier
```bash
POST /carts
# Réponse: { "id_cart": 156 }
```

#### POST - Ajouter un article
```bash
POST /carts/{cart_id}/items
Content-Type: application/json

{
  "id_product": 1,
  "quantity": 2,
  "id_product_attribute": 5
}
```

**Réponse**
```json
{
  "success": true,
  "message": "Article ajouté",
  "cart": { ... }
}
```

#### PUT - Modifier quantité
```bash
PUT /carts/{cart_id}/items/{id_product}
{
  "quantity": 3
}
```

#### DELETE - Supprimer un article
```bash
DELETE /carts/{cart_id}/items/{id_product}
```

---

### 🎟️ COUPONS/CODES PROMO (Cart Rules)

#### GET - Récupérer les règles de panier
```bash
GET /cart_rules
GET /cart_rules?filter[code]=PROMO10
```

**Réponse**
```json
{
  "cart_rules": [
    {
      "id_cart_rule": 1,
      "code": "PROMO10",
      "name": "Réduction 10%",
      "discount_type": "percentage",
      "discount_value": 10,
      "minimum_amount": 50,
      "minimum_amount_currency": "EUR",
      "active": 1,
      "date_from": "2026-01-01",
      "date_to": "2026-12-31"
    }
  ]
}
```

#### POST - Appliquer un coupon
```bash
POST /carts/{cart_id}/apply-coupon
{
  "code": "PROMO10"
}
```

**Réponse (succès)**
```json
{
  "success": true,
  "discount": 32.39,
  "new_total": 291.55,
  "cart": { ... }
}
```

**Réponse (erreur)**
```json
{
  "success": false,
  "error": "Code promo expiré",
  "error_code": "EXPIRED_COUPON"
}
```

---

### 🏷️ CATÉGORIES (Categories)

#### GET - Lister les catégories
```bash
GET /categories
```

**Réponse**
```json
{
  "categories": [
    {
      "id_category": 1,
      "name": "Racine",
      "parent_id": 0
    },
    {
      "id_category": 5,
      "name": "Électronique",
      "parent_id": 1
    },
    {
      "id_category": 6,
      "name": "Informatique",
      "parent_id": 5
    }
  ]
}
```

---

## Gestion du Panier

### 📝 Structure du Panier (Frontend)

Le panier doit être stocké **localement** (dans le navigateur) ET **sur le serveur**.

#### Option 1: LocalStorage (Simple)
```javascript
// Sauvegarder le panier
localStorage.setItem('cart', JSON.stringify({
  id_cart: 156,
  items: [
    {
      id_product: 1,
      quantity: 2,
      attributes: { couleur: 'Rouge' }
    }
  ]
}));

// Récupérer le panier
const cart = JSON.parse(localStorage.getItem('cart'));

// Vider le panier
localStorage.removeItem('cart');
```

#### Option 2: Cookies (Compatible serveur)
```javascript
// Sauvegarder avec librairie js-cookie
import Cookies from 'js-cookie';

Cookies.set('cart_id', '156');
Cookies.set('cart_count', '3'); // Nombre d'articles
```

### 🔄 Synchronisation avec Serveur

```javascript
// Chaque fois que le panier change:
async function syncCartToServer(cart) {
  try {
    // 1. Si pas de cart_id, créer un panier
    if (!cart.id_cart) {
      const response = await fetch('/api/carts', {
        method: 'POST'
      });
      cart.id_cart = (await response.json()).id_cart;
    }

    // 2. Synchroniser chaque article
    for (const item of cart.items) {
      await fetch(`/api/carts/${cart.id_cart}/items`, {
        method: 'POST',
        body: JSON.stringify(item)
      });
    }

    // 3. Sauvegarder localement
    localStorage.setItem('cart', JSON.stringify(cart));
    
    return true;
  } catch(e) {
    console.error('Erreur sync panier:', e);
    return false;
  }
}
```

### 🧮 Calcul Automatique des Totaux

```javascript
function calculateTotals(items) {
  let subtotal = 0;
  
  // 1. Calculer sous-total
  items.forEach(item => {
    subtotal += (item.unit_price * item.quantity);
  });

  // 2. Appliquer remises
  let after_discount = subtotal;
  if (cart.discount) {
    if (cart.discount.type === 'percentage') {
      after_discount -= (subtotal * (cart.discount.value / 100));
    } else {
      after_discount -= cart.discount.value;
    }
  }

  // 3. Ajouter livraison
  let shipping = 0;
  if (after_discount < 50) {
    shipping = 9.99; // Livraison payante si < 50€
  }

  // 4. Appliquer taxes (20% par défaut)
  let taxes = (after_discount + shipping) * 0.20;
  let total = after_discount + shipping + taxes;

  return {
    subtotal: subtotal.toFixed(2),
    shipping: shipping.toFixed(2),
    taxes: taxes.toFixed(2),
    total: total.toFixed(2)
  };
}
```

---

## Exemples Complets

### 1️⃣ Exemple Vue.js - Page 1 (Liste Produits)

```vue
<template>
  <div class="products-container">
    <h1>🛒 Notre Boutique</h1>

    <!-- Filtres -->
    <div class="filters">
      <input 
        v-model="searchQuery"
        @input="fetchProducts"
        placeholder="🔍 Rechercher un produit...">
      
      <select v-model="selectedCategory" @change="fetchProducts">
        <option value="">Toutes les catégories</option>
        <option v-for="cat in categories" :key="cat.id_category" :value="cat.id_category">
          {{ cat.name }}
        </option>
      </select>

      <select v-model="sortBy" @change="fetchProducts">
        <option value="newest">Plus récent</option>
        <option value="price_asc">Prix: Croissant</option>
        <option value="price_desc">Prix: Décroissant</option>
      </select>
    </div>

    <!-- Grille produits -->
    <div class="products-grid">
      <div v-for="product in products" :key="product.id_product" class="product-card">
        <img :src="product.image_url" :alt="product.name" 
             @click="viewProduct(product.id_product)">
        
        <h3>{{ product.name }}</h3>
        <p class="price">{{ product.price }}€</p>
        <p class="stock" :class="{ low: product.stock < 5 }">
          Stock: {{ product.stock }}
        </p>

        <button @click="viewProduct(product.id_product)" class="btn-details">
          👁️ Détails
        </button>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button @click="previousPage" :disabled="currentPage === 1">← Précédent</button>
      <span>Page {{ currentPage }} / {{ totalPages }}</span>
      <button @click="nextPage" :disabled="currentPage === totalPages">Suivant →</button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'ProductsList',
  data() {
    return {
      products: [],
      categories: [],
      searchQuery: '',
      selectedCategory: '',
      sortBy: 'newest',
      currentPage: 1,
      totalPages: 1,
      itemsPerPage: 12,
      cartCount: 0
    };
  },
  methods: {
    async fetchProducts() {
      try {
        const params = {
          limit: this.itemsPerPage,
          offset: (this.currentPage - 1) * this.itemsPerPage,
          filter: {}
        };

        if (this.searchQuery) {
          params.filter.name = this.searchQuery;
        }

        if (this.selectedCategory) {
          params.filter.category = this.selectedCategory;
        }

        if (this.sortBy === 'price_asc') {
          params.sort = 'price';
          params.sort_order = 'asc';
        } else if (this.sortBy === 'price_desc') {
          params.sort = 'price';
          params.sort_order = 'desc';
        }

        const response = await axios.get('/api/products', { params });
        this.products = response.data.products;
        this.totalPages = Math.ceil(response.data.pagination.total / this.itemsPerPage);
      } catch (error) {
        console.error('Erreur chargement produits:', error);
      }
    },

    async fetchCategories() {
      try {
        const response = await axios.get('/api/categories');
        this.categories = response.data.categories;
      } catch (error) {
        console.error('Erreur chargement catégories:', error);
      }
    },

    viewProduct(productId) {
      this.$router.push(`/product/${productId}`);
    },

    previousPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.fetchProducts();
        window.scrollTo(0, 0);
      }
    },

    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.fetchProducts();
        window.scrollTo(0, 0);
      }
    },

    loadCartCount() {
      const cart = JSON.parse(localStorage.getItem('cart') || '{}');
      this.cartCount = (cart.items || []).length;
    }
  },

  mounted() {
    this.fetchProducts();
    this.fetchCategories();
    this.loadCartCount();

    // Mettre à jour le compteur du panier
    window.addEventListener('storage', () => {
      this.loadCartCount();
    });
  }
};
</script>

<style scoped>
.products-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.filters {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.filters input, .filters select {
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin: 30px 0;
}

.product-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  text-align: center;
  transition: transform 0.3s;
  cursor: pointer;
}

.product-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.product-card img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 10px;
}

.product-card h3 {
  margin: 10px 0;
  font-size: 16px;
}

.product-card .price {
  color: #28a745;
  font-weight: bold;
  font-size: 18px;
  margin: 5px 0;
}

.product-card .stock {
  color: #6c757d;
  font-size: 12px;
}

.product-card .stock.low {
  color: #dc3545;
}

.btn-details {
  width: 100%;
  padding: 10px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

.btn-details:hover {
  background: #0056b3;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin: 30px 0;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

---

### 2️⃣ Exemple Vue.js - Page 2 (Détail Produit)

```vue
<template>
  <div class="product-detail-container">
    <button @click="goBack" class="btn-back">← Retour</button>

    <div v-if="product" class="detail-wrapper">
      <!-- Images -->
      <div class="images-section">
        <div class="main-image">
          <img :src="selectedImage" :alt="product.name">
        </div>
        <div class="thumbnails">
          <img v-for="image in product.images" 
               :key="image.id_image"
               :src="image.url" 
               @click="selectedImage = image.url"
               :class="{ active: selectedImage === image.url }">
        </div>
      </div>

      <!-- Infos -->
      <div class="info-section">
        <h1>{{ product.name }}</h1>
        <p class="sku">SKU: {{ product.reference }}</p>
        
        <div class="rating">
          ⭐⭐⭐⭐⭐ {{ reviewCount }} avis
        </div>

        <div class="price-section">
          <p class="price">{{ product.price }}€</p>
          <p class="price-ttc">TTC: {{ product.price_with_tax }}€</p>
        </div>

        <p class="stock" :class="{ low: product.stock < 5 }">
          ✓ {{ product.stock }} pièces en stock
        </p>

        <!-- Description -->
        <div class="description">
          {{ product.description }}
        </div>

        <!-- Variantes -->
        <div v-if="product.attributes && product.attributes.length" class="attributes">
          <div v-for="attr in product.attributes" :key="attr.id_attribute" class="attribute-group">
            <label>{{ attr.name }}:</label>
            <div class="attribute-values">
              <button v-for="value in attr.values" 
                      :key="value"
                      @click="selectAttribute(attr.name, value)"
                      :class="{ selected: selectedAttributes[attr.name] === value }"
                      class="attr-btn">
                {{ value }}
              </button>
            </div>
          </div>
        </div>

        <!-- Quantité -->
        <div class="quantity-section">
          <label>Quantité:</label>
          <div class="quantity-control">
            <button @click="quantity--" :disabled="quantity <= 1">−</button>
            <input v-model.number="quantity" type="number" min="1">
            <button @click="quantity++">+</button>
          </div>
        </div>

        <!-- Prix total -->
        <div class="total-price">
          <p>PRIX TOTAL: {{ (product.price * quantity).toFixed(2) }}€</p>
        </div>

        <!-- Bouton ajouter panier -->
        <button @click="addToCart" class="btn-add-cart">
          🛒 Ajouter au Panier
        </button>

        <!-- Info livraison -->
        <div class="shipping-info">
          <p>📦 Livraison gratuite à partir de 50€</p>
        </div>
      </div>
    </div>

    <!-- Pop-up Confirmation -->
    <div v-if="showConfirmation" class="modal-overlay" @click="showConfirmation = false">
      <div class="modal" @click.stop>
        <h2>✓ ARTICLE AJOUTÉ AU PANIER</h2>
        
        <div class="confirmation-content">
          <img :src="selectedImage" :alt="product.name">
          <div>
            <p><strong>{{ product.name }}</strong></p>
            <p v-if="Object.keys(selectedAttributes).length">
              {{ Object.entries(selectedAttributes).map(([k,v]) => `${k}: ${v}`).join(', ') }}
            </p>
            <p>Quantité: {{ quantity }}</p>
            <p class="price">{{ (product.price * quantity).toFixed(2) }}€</p>
          </div>
        </div>

        <p class="cart-info">Panier: {{ cartItemCount }} article(s)</p>

        <div class="modal-buttons">
          <button @click="continueShopping" class="btn-secondary">
            Continuer les achats
          </button>
          <button @click="goToCart" class="btn-primary">
            Voir le Panier →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'ProductDetail',
  data() {
    return {
      product: null,
      selectedImage: '',
      quantity: 1,
      selectedAttributes: {},
      showConfirmation: false,
      cartItemCount: 0,
      reviewCount: 0
    };
  },
  methods: {
    async fetchProduct() {
      try {
        const productId = this.$route.params.id;
        const response = await axios.get(`/api/products/${productId}`);
        this.product = response.data.product;
        
        // Image par défaut
        if (this.product.images && this.product.images.length) {
          this.selectedImage = this.product.images[0].url;
        }
      } catch (error) {
        console.error('Erreur chargement produit:', error);
      }
    },

    selectAttribute(attrName, value) {
      this.$set(this.selectedAttributes, attrName, value);
    },

    async addToCart() {
      try {
        // 1. Récupérer ou créer le panier
        let cart = JSON.parse(localStorage.getItem('cart') || '{}');
        
        if (!cart.id_cart) {
          const response = await axios.post('/api/carts');
          cart.id_cart = response.data.id_cart;
        }

        // 2. Préparer l'article
        const item = {
          id_product: this.product.id_product,
          quantity: this.quantity,
          attributes: this.selectedAttributes
        };

        // 3. Ajouter à l'API
        await axios.post(`/api/carts/${cart.id_cart}/items`, item);

        // 4. Mettre à jour le panier local
        if (!cart.items) cart.items = [];
        
        const existingItem = cart.items.find(i => 
          i.id_product === item.id_product && 
          JSON.stringify(i.attributes) === JSON.stringify(item.attributes)
        );

        if (existingItem) {
          existingItem.quantity += item.quantity;
        } else {
          item.unit_price = this.product.price;
          item.name = this.product.name;
          cart.items.push(item);
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        this.cartItemCount = cart.items.length;

        // 5. Afficher confirmation
        this.showConfirmation = true;

      } catch (error) {
        console.error('Erreur ajout panier:', error);
        alert('❌ Erreur: ' + error.message);
      }
    },

    continueShopping() {
      this.showConfirmation = false;
      this.$router.push('/');
    },

    goToCart() {
      this.showConfirmation = false;
      this.$router.push('/cart');
    },

    goBack() {
      this.$router.back();
    },

    loadCartCount() {
      const cart = JSON.parse(localStorage.getItem('cart') || '{}');
      this.cartItemCount = (cart.items || []).length;
    }
  },

  mounted() {
    this.fetchProduct();
    this.loadCartCount();
  }
};
</script>

<style scoped>
.product-detail-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.btn-back {
  padding: 8px 16px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 20px;
}

.detail-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.images-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.main-image img {
  width: 100%;
  border-radius: 8px;
}

.thumbnails {
  display: flex;
  gap: 10px;
}

.thumbnails img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  opacity: 0.6;
  transition: all 0.3s;
}

.thumbnails img.active {
  opacity: 1;
  border-color: #007bff;
}

.info-section h1 {
  margin: 0 0 10px 0;
  font-size: 28px;
}

.sku {
  color: #6c757d;
  margin: 5px 0 15px 0;
}

.rating {
  margin: 10px 0;
  font-size: 14px;
}

.price-section {
  margin: 20px 0;
}

.price {
  font-size: 32px;
  color: #28a745;
  font-weight: bold;
  margin: 0;
}

.price-ttc {
  color: #6c757d;
  font-size: 14px;
}

.stock {
  margin: 10px 0;
  font-size: 14px;
  color: #28a745;
}

.stock.low {
  color: #dc3545;
}

.description {
  margin: 20px 0;
  line-height: 1.6;
  color: #333;
}

.attributes {
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 4px;
}

.attribute-group {
  margin-bottom: 15px;
}

.attribute-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
}

.attribute-values {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.attr-btn {
  padding: 8px 15px;
  border: 2px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.attr-btn:hover {
  border-color: #007bff;
}

.attr-btn.selected {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.quantity-section {
  margin: 20px 0;
}

.quantity-section label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quantity-control button {
  width: 40px;
  height: 40px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 4px;
  font-size: 18px;
}

.quantity-control button:hover:not(:disabled) {
  background: #f0f0f0;
}

.quantity-control button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quantity-control input {
  width: 60px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.total-price {
  margin: 20px 0;
  padding: 15px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 20px;
  font-weight: bold;
  color: #007bff;
}

.btn-add-cart {
  width: 100%;
  padding: 15px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin: 20px 0;
}

.btn-add-cart:hover {
  background: #218838;
}

.shipping-info {
  padding: 15px;
  background: #e7f3ff;
  border-radius: 4px;
  color: #004085;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal h2 {
  margin-top: 0;
  color: #28a745;
}

.confirmation-content {
  display: flex;
  gap: 20px;
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 4px;
}

.confirmation-content img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 4px;
}

.confirmation-content p {
  margin: 5px 0;
}

.confirmation-content .price {
  color: #28a745;
  font-weight: bold;
  font-size: 18px;
}

.cart-info {
  text-align: center;
  color: #6c757d;
  margin: 15px 0;
}

.modal-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn-primary, .btn-secondary {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

@media (max-width: 768px) {
  .detail-wrapper {
    grid-template-columns: 1fr;
  }
}
</style>
```

---

### 3️⃣ Exemple Vue.js - Page 4 (Panier)

```vue
<template>
  <div class="cart-container">
    <h1>🛒 MON PANIER</h1>

    <div v-if="cart.items && cart.items.length" class="cart-content">
      <!-- Tableau articles -->
      <table class="cart-table">
        <thead>
          <tr>
            <th>Produit</th>
            <th>Attributs</th>
            <th>Quantité</th>
            <th>P.U.</th>
            <th>Total</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in cart.items" :key="idx">
            <td>{{ item.name }}</td>
            <td v-if="item.attributes">
              {{ Object.entries(item.attributes).map(([k,v]) => `${k}: ${v}`).join(', ') }}
            </td>
            <td v-else>-</td>
            <td class="qty-cell">
              <button @click="decreaseQty(idx)" :disabled="item.quantity <= 1">−</button>
              <input v-model.number="item.quantity" type="number" min="1" @change="updateQty(idx)">
              <button @click="increaseQty(idx)">+</button>
            </td>
            <td>{{ item.unit_price }}€</td>
            <td>{{ (item.unit_price * item.quantity).toFixed(2) }}€</td>
            <td>
              <button @click="removeItem(idx)" class="btn-remove">❌</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Résumé -->
      <div class="cart-summary">
        <div class="summary-row">
          <span>Sous-total:</span>
          <span>{{ subtotal }}€</span>
        </div>
        <div class="summary-row">
          <span>Frais de port:</span>
          <span>{{ shipping }}€</span>
          <small v-if="subtotal < 50">(Gratuit à partir de 50€)</small>
        </div>
        <div class="summary-row">
          <span>Taxes (20%):</span>
          <span>{{ taxes }}€</span>
        </div>

        <!-- Code promo -->
        <div class="coupon-section">
          <input v-model="couponCode" placeholder="Code promo...">
          <button @click="applyCoupon">Appliquer</button>
        </div>

        <div v-if="discount > 0" class="summary-row discount-row">
          <span>Réduction:</span>
          <span>-{{ discount }}€</span>
        </div>

        <div class="summary-row total-row">
          <span>TOTAL FINAL:</span>
          <span>{{ total }}€</span>
        </div>
      </div>

      <!-- Boutons -->
      <div class="cart-actions">
        <button @click="continueShopping" class="btn-secondary">
          ← Continuer les achats
        </button>
        <button @click="goToCheckout" class="btn-primary">
          Commander →
        </button>
      </div>
    </div>

    <!-- Panier vide -->
    <div v-else class="empty-cart">
      <p>😢 Votre panier est vide</p>
      <button @click="continueShopping" class="btn-primary">
        ← Retour aux produits
      </button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'Cart',
  data() {
    return {
      cart: { items: [] },
      couponCode: '',
      discount: 0
    };
  },
  computed: {
    subtotal() {
      return this.cart.items.reduce((sum, item) => 
        sum + (item.unit_price * item.quantity), 0).toFixed(2);
    },
    shipping() {
      return parseFloat(this.subtotal) < 50 ? '9.99' : '0.00';
    },
    taxes() {
      const base = parseFloat(this.subtotal) + parseFloat(this.shipping);
      return (base * 0.20).toFixed(2);
    },
    total() {
      const base = parseFloat(this.subtotal) + parseFloat(this.shipping) + parseFloat(this.taxes);
      return (base - this.discount).toFixed(2);
    }
  },
  methods: {
    loadCart() {
      const cart = JSON.parse(localStorage.getItem('cart') || '{"items":[]}');
      this.cart = cart;
    },

    decreaseQty(idx) {
      if (this.cart.items[idx].quantity > 1) {
        this.cart.items[idx].quantity--;
        this.saveCart();
      }
    },

    increaseQty(idx) {
      this.cart.items[idx].quantity++;
      this.saveCart();
    },

    async updateQty(idx) {
      if (this.cart.id_cart) {
        try {
          await axios.put(
            `/api/carts/${this.cart.id_cart}/items/${this.cart.items[idx].id_product}`,
            { quantity: this.cart.items[idx].quantity }
          );
        } catch (error) {
          console.error('Erreur mise à jour:', error);
        }
      }
      this.saveCart();
    },

    async removeItem(idx) {
      const item = this.cart.items[idx];
      
      if (this.cart.id_cart) {
        try {
          await axios.delete(
            `/api/carts/${this.cart.id_cart}/items/${item.id_product}`
          );
        } catch (error) {
          console.error('Erreur suppression:', error);
        }
      }

      this.cart.items.splice(idx, 1);
      this.saveCart();
    },

    saveCart() {
      localStorage.setItem('cart', JSON.stringify(this.cart));
    },

    async applyCoupon() {
      if (!this.couponCode) return;

      try {
        const response = await axios.post(
          `/api/carts/${this.cart.id_cart}/apply-coupon`,
          { code: this.couponCode }
        );

        if (response.data.success) {
          this.discount = response.data.discount;
          alert('✓ Code promo appliqué!');
        } else {
          alert('❌ ' + response.data.error);
        }
      } catch (error) {
        alert('❌ Erreur: ' + error.message);
      }
    },

    continueShopping() {
      this.$router.push('/');
    },

    goToCheckout() {
      // Rediriger vers la page de commande
      this.$router.push('/checkout');
    }
  },

  mounted() {
    this.loadCart();
  }
};
</script>

<style scoped>
.cart-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.cart-content {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 30px;
  margin: 30px 0;
}

.cart-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.cart-table th {
  background: #f5f5f5;
  padding: 15px;
  text-align: left;
  font-weight: bold;
  border-bottom: 2px solid #ddd;
}

.cart-table td {
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.qty-cell {
  display: flex;
  align-items: center;
  gap: 5px;
}

.qty-cell button {
  width: 30px;
  height: 30px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 4px;
}

.qty-cell button:hover:not(:disabled) {
  background: #f0f0f0;
}

.qty-cell button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qty-cell input {
  width: 50px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.btn-remove {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
}

.cart-summary {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  height: fit-content;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
}

.summary-row small {
  display: block;
  color: #6c757d;
  font-size: 12px;
  margin-top: 3px;
}

.coupon-section {
  display: flex;
  gap: 5px;
  margin: 15px 0;
}

.coupon-section input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.coupon-section button {
  padding: 8px 12px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.coupon-section button:hover {
  background: #0056b3;
}

.discount-row {
  color: #28a745;
  font-weight: bold;
  padding-top: 10px;
  border-top: 1px solid #ddd;
}

.total-row {
  font-size: 18px;
  font-weight: bold;
  color: #007bff;
  padding-top: 10px;
  border-top: 2px solid #ddd;
  margin-top: 15px;
}

.cart-actions {
  display: flex;
  gap: 10px;
  margin-top: 30px;
}

.btn-primary, .btn-secondary {
  flex: 1;
  padding: 15px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #28a745;
  color: white;
}

.btn-primary:hover {
  background: #218838;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.empty-cart {
  text-align: center;
  padding: 60px 20px;
}

.empty-cart p {
  font-size: 24px;
  margin-bottom: 30px;
}

.empty-cart .btn-primary {
  max-width: 300px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .cart-content {
    grid-template-columns: 1fr;
  }

  .cart-table {
    font-size: 12px;
  }

  .cart-table td, .cart-table th {
    padding: 10px;
  }

  .cart-summary {
    height: auto;
  }
}
</style>
```

---

## Architecture Stockage

### 🔐 Choix: LocalStorage vs Cookies vs API

| Critère | LocalStorage | Cookies | API Serveur |
|---------|-------------|---------|------------|
| **Persistance** | ✓ Navigateur | ✓ Navigateur | ✓ Serveur |
| **Synchronisation** | Local | Local | En temps réel |
| **Sécurité** | ⚠️ XSS vulnérable | ✓ HttpOnly possible | ✓ Sécurisé |
| **Capacité** | 5-10MB | 4-8KB | Illimitée |
| **Multi-onglet** | ✓ | ✓ | ✓ |
| **Mobile** | ✓ | ✓ | ✓ |

### 📌 Recommandation

**Approche Hybride** (Meilleure pratique):
1. **LocalStorage** : Sauvegarder le panier localement (rapide)
2. **API Serveur** : Synchroniser avec le serveur (sécurisé)
3. **Cookies** : Stocker cart_id (pour reconnexion)

```javascript
class CartManager {
  constructor() {
    this.API_URL = '/api/carts';
    this.STORAGE_KEY = 'cart';
    this.COOKIE_KEY = 'cart_id';
  }

  // Sauvegarder localement
  saveLocal(cart) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cart));
  }

  // Charger depuis local
  loadLocal() {
    return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{"items":[]}');
  }

  // Synchroniser avec serveur
  async sync() {
    const cart = this.loadLocal();
    
    if (!cart.id_cart) {
      // Créer un nouveau panier serveur
      const res = await fetch(this.API_URL, { method: 'POST' });
      cart.id_cart = (await res.json()).id_cart;
      this.saveCookie('cart_id', cart.id_cart);
    }

    // Envoyer les articles
    for (const item of cart.items) {
      await fetch(`${this.API_URL}/${cart.id_cart}/items`, {
        method: 'POST',
        body: JSON.stringify(item)
      });
    }

    this.saveLocal(cart);
  }

  saveCookie(name, value) {
    document.cookie = `${name}=${value};path=/;max-age=2592000`;
  }
}

const cartMgr = new CartManager();
await cartMgr.sync();
```

---

## Récapitulatif

### 📱 4 Pages à Créer:
1. ✓ **Liste Produits** - Grille avec filtres
2. ✓ **Détail Produit** - Images + Info + Variantes
3. ✓ **Pop-up** - Confirmation d'ajout
4. ✓ **Panier** - Tableau articles + Résumé

### 🔗 APIs Essentielles:
```
GET  /products          → Lister
GET  /products/{id}     → Détail
GET  /categories        → Catégories
POST /carts             → Créer panier
GET  /carts/current     → Récupérer
POST /carts/{id}/items  → Ajouter article
PUT  /carts/{id}/items/{pid} → Modifier quantité
DELETE /carts/{id}/items/{pid} → Supprimer
POST /carts/{id}/apply-coupon → Code promo
```

### 💾 Gestion Panier:
- LocalStorage pour la lecture rapide
- API pour la synchronisation
- Cookies pour l'identification

Voilà! Vous avez maintenant un guide complet pour construire le front-end e-commerce! 🚀
