# Documentation du projet `mon_projet_presta`

# 1. Structure globale du projet

Le projet est divisé en deux grandes parties :

- Frontend (boutique client)
- Backend (interface administration)

Le projet communique avec l’API XML de PrestaShop.

---

# 1.1 Frontend — `src/views/front/*`

## `CustomersList.vue`

Cette page permet d’afficher la liste des clients et des invités.

### Fonctionnalités
- Affichage des vrais clients
- Affichage des invités
- Sélection d’un client
- Sauvegarde du client dans le localStorage

### Actions réalisées
```js
localStorage.customer = JSON.stringify(user)
window.dispatchEvent(new Event("customer-update"))
```

### Navigation
Après sélection du client :
```txt
/frontend/liste-produits
```

---

## `ProduitsList.vue`

Cette page affiche :
- les produits
- les catégories
- les taxes
- le stock disponible

### Fonctionnalités
- affichage du catalogue
- filtrage par catégories
- affichage des taxes
- vérification du stock

---

## `ProduitsDetail.vue`

Cette page affiche le détail d’un produit.

### Fonctionnalités
- choix des options
- choix des combinaisons
- ajout au panier
- contrôle du stock

---

## `Panier.vue`

Gestion du panier côté serveur.

### Fonctionnalités
- affichage du panier
- modification des quantités
- suppression d’articles
- synchronisation avec PrestaShop
- vérification du stock avant validation

### Événement utilisé
```txt
customer-update
```

Cet événement déclenche :
```js
fetchPanierFromServer()
```

---

## `Commande.vue`

Gestion du processus de commande.

### Étapes du checkout
1. Informations client
2. Adresse
3. Livraison
4. Paiement

Puis création de la commande PrestaShop.

### LocalStorage utilisé
```txt
localStorage.active_cart_id_customer_${customerId}
```

---

## `MesCommandes.vue`

Cette page affiche :
- les paniers du client
- les commandes
- les états des commandes

---

## `CustomerCreate.vue`

Permet de créer un client dans PrestaShop.

---

# 1.2 Backend — `src/views/back/*`

## `Login.vue`

Page de connexion administrateur.

### Authentification
```txt
admin / admin
```

Authentification hardcodée.

Aucune vraie authentification PrestaShop.

---

## `Dashboard.vue`

Non inspecté dans les fichiers analysés.

---

## `CommandesList.vue`

Affichage :
- des commandes
- des clients
- des paniers liés

### Utilise
Jointures entre :
- orders
- carts
- customers

---

## `PanierList.vue`

Affiche les paniers existants.

### Fonctionnalité principale
Modification de l’état d’une commande via :
```js
ordersService.updateOrderState()
```

---

## `ResetView.vue`

Non inspecté dans les fichiers analysés.

---

# 1.3 Routing — `src/router/index.js`

Le routing sépare :

```txt
/frontend/*
/backend/*
```

### Protection du backend

Utilisation d’un guard simple :
```js
localStorage.isAuthenticated
```

---

# 1.4 Gestion de l’état côté client

## LocalStorage utilisé

### Client courant
```txt
localStorage.customer
```

Utilisé dans :
- App.vue
- pages frontend

---

### Panier actif
```txt
localStorage.active_cart_id_customer_${customerId}
```

Utilisé pendant le checkout.

---

# 2. Couche API PrestaShop — `services`

---

# 2.1 `src/service/api.js`

Couche principale de communication API.

## Technologies utilisées
- axios
- XML
- fast-xml-parser

---

## Configuration API

### Base URL
```txt
http://localhost/prestashop_edition_classic_version_8.2.6/api
```

### Authentification
```txt
Authorization: Basic base64(apiKey:)
```

---

## Helpers disponibles

### XML
```js
getXml(url, config)
postXml(url, payload)
putXml(url, payload)
deleteXml(url)
```

---

## Gestion des images
```js
getImage()
postImage()
```

---

## Remarque importante

Plusieurs services :
- ne réutilisent pas `api.js`
- recréent leur propre configuration axios/XML

Cela provoque :
- duplication de code
- token hardcodé à plusieurs endroits

---

# 2.2 `customersService.js`

Gestion des clients PrestaShop.

---

## `getCustomers()`

Récupère :
```txt
/customers?display=full
```

Puis transforme les données XML vers :

```js
{
  id,
  firstname,
  lastname,
  email,
  active,
  date_add,
  newsletter,
  is_guest
}
```

---

## `getTrueCustomers()`

Retourne :
```txt
is_guest !== "1"
```

---

## `getGuests()`

Retourne :
```txt
is_guest === "1"
```

---

## `createCustomer(data)`

Création d’un client via :
```txt
POST /customers
```

Utilise :
```txt
XMLBuilder
```

### Important
Le champ :
```txt
passwd
```
est obligatoire.

---

# 2.3 `adressesService.js`

Gestion des adresses.

---

## `createAddress(data)`

Création :
```txt
POST /addresses
```

---

## `getAddressesByCustomer(customerId)`

Récupération :
```txt
/addresses?filter[id_customer]=[id]&display=full
```

Puis transformation vers un objet JS simplifié.

---

# 2.4 `cartsService.js`

Gestion des paniers.

---

## `addToCart(payload)`

### Cas panier existant
```txt
GET /carts/{id}
```

Récupère :
```txt
cart_rows
```

Puis :
- ajoute une ligne
- ou incrémente la quantité

---

### Sauvegarde du panier

Si nouveau panier :
```txt
POST /carts
```

Sinon :
```txt
PUT /carts/{id}
```

---

## `getCart(id_cart)`

Récupération :
```txt
GET /carts/{id}?display=full
```

Puis normalisation via :
```js
transformerCart()
```

---

## `updateCartAddresses(cartId, idAddress, idCarrier)`

Met à jour :
- adresse livraison
- transporteur
- informations du panier

Via :
```txt
PUT /carts/{id}
```

---

## `getCarts()`

Récupère tous les paniers :
```txt
GET /carts?display=full
```

Puis normalisation.

---

# 2.5 `ordersService.js`

Gestion des commandes.

---

## `getCartFull(cartId)`

Récupère :
```txt
GET /carts/{id}?display=full
```

---

## `prepareCartBeforeOrder(...)`

Met à jour le panier avant création de la commande.

### Actions
- normalisation des `cart_rows`
- définition :
  - customer
  - address
  - carrier

Via :
```txt
PUT /carts/{id}
```

---

## `createOrder(orderData)`

### Étapes
1. Vérification des IDs et totaux
2. Récupération du panier complet
3. Préparation du panier
4. Construction du XML de commande
5. POST `/orders`

---

### Champs utilisés
```txt
payment
module = ps_cashondelivery
```

---

### Retour
```js
{
  success,
  id,
  reference,
  data
}
```

---

## `getOrders()`

Récupère :
```txt
/orders?display=full
```

Puis normalisation.

---

## `getOrdersByCustomer(customerId)`

Filtre :
```txt
filter[id_customer]
```

---

## `getOrderStates()`

Récupère :
```txt
/order_states?display=full
```

Retour :
```js
{
  id,
  name,
  color
}
```

---

## `updateOrderState(orderId, newStateId)`

Ajoute un historique de commande via :
```txt
POST /order_histories
```

---

# 3. Flow Front → PrestaShop

---

# 3.1 Choix d’un client

## Étape 1 — Chargement des clients

`CustomersList.vue` appelle :
```js
customersService.getTrueCustomers()
```

ou :
```js
customersService.getGuests()
```

---

## Étape 2 — Sélection du client

Lors du clic :
```js
localStorage.customer = JSON.stringify(user)
```

Puis :
```js
window.dispatchEvent(new Event("customer-update"))
```

---

## Étape 3 — Navigation

Redirection vers :
```txt
/frontend/liste-produits
```

---

# 3.2 Liste produits + taxes + stock

## `ProduitsList.vue`

Cette page :
- récupère les produits
- récupère les catégories
- affiche les taxes
- vérifie le stock disponible

### Fonctionnalités
- affichage du catalogue
- filtrage catégories
- disponibilité produit
- préparation ajout panier

---

# 3.3 Détail produit → Ajout panier

## `ProduitsDetail.vue`

### Étapes
1. Chargement du produit
2. Sélection combinaison/options
3. Vérification stock
4. Ajout panier

### Appel principal
```js
cartsService.addToCart(payload)
```

---

# 3.4 Gestion du panier

## `Panier.vue`

### Étapes
1. Chargement du panier serveur
2. Modification quantités
3. Suppression lignes
4. Vérification stock
5. Validation checkout

### Synchronisation
Toutes les modifications sont envoyées à PrestaShop.

---

# 3.5 Création commande

## `Commande.vue`

### Étapes
1. Choix adresse
2. Choix livraison
3. Mise à jour panier
4. Préparation panier
5. Création commande

### Services utilisés
```js
ordersService.prepareCartBeforeOrder()
ordersService.createOrder()
```

---

# 3.6 Consultation commandes

## `MesCommandes.vue`

Affiche :
- les paniers du client
- les commandes associées
- les états des commandes

---

# 4. Architecture technique

## Frontend
- Vue.js
- Vue Router
- Axios

---

## Backend utilisé
- API XML PrestaShop

---

## Format d’échange
- XML
- Parsing XML → JSON

---

## Stockage local
- localStorage

---

# 5. Points importants du projet

## Points positifs
- communication complète avec PrestaShop
- gestion panier serveur
- gestion commandes
- checkout complet
- séparation frontend/backend

---

## Limites actuelles

### Authentification faible
```txt
admin/admin
```

---

### Données hardcodées
- API key
- BASE_URL

---

### Duplication de code
Plusieurs services recréent :
- axios
- parsing XML

---

### Sécurité limitée
Le guard frontend utilise uniquement :
```js
localStorage.isAuthenticated
```

---

# 6. Améliorations possibles

## Sécurité
- vraie authentification admin
- JWT
- gestion des rôles

---

## Architecture
- centraliser axios
- centraliser parsing XML
- factoriser les services

---

## UX
- notifications utilisateur
- loaders
- gestion erreurs améliorée

---

## Performance
- cache API
- pagination
- lazy loading

---

# 7. Conclusion

Le projet `mon_projet_presta` est une application Vue.js connectée à PrestaShop via l’API XML.

Il permet :
- la gestion des clients
- la consultation des produits
- la gestion du panier
- la création de commandes
- le suivi des commandes

Le projet possède déjà une architecture fonctionnelle complète mais peut encore être amélioré au niveau :
- sécurité
- factorisation du code
- expérience utilisateur
- maintenabilité