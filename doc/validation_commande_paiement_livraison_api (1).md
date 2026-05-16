# Validation de commande - paiement à la livraison

Objectif : valider une commande depuis l'app Vue avec uniquement le paiement à la livraison, sans frais de livraison.

## Règles PrestaShop à respecter

- Le panier doit exister dans `ps_cart`.
- Le panier doit appartenir au client connecté : `ps_cart.id_customer = id_customer`.
- Le panier ne doit pas déjà être transformé en commande.
- Le panier doit contenir au moins une ligne dans `ps_cart_product`.
- Chaque ligne panier doit avoir :
  - `id_product`
  - `id_product_attribute` (`0` pour un produit sans déclinaison)
  - `id_address_delivery`
  - `quantity`
- Les produits doivent être actifs et disponibles.
- Le stock doit être suffisant avant validation.
- Le client doit avoir une adresse de livraison et une adresse de facturation.
- Même sans frais de livraison, PrestaShop attend un transporteur pour une commande avec produits physiques.
- Utiliser directement le transporteur existant `Click and collect` :
  - `id_carrier = 1`
  - `active = 1`
  - `deleted = 0`
  - `is_free = 1`
- La commande doit être créée à partir du panier, pas en insérant directement dans `ps_orders`.
- Ne pas appeler directement les APIs `order_details`, `order_carriers`, `order_payments` pour créer la commande : `POST /api/orders` appelle déjà la logique interne `PaymentModule::validateOrder()`.

## APIs utilisées

### 1. Vérifier le panier

API :

```txt
GET /api/carts/{id_cart}
```

À vérifier :

- `id_customer`
- `id_address_delivery`
- `id_address_invoice`
- `id_currency`
- `id_lang`
- `id_carrier`
- `cart_rows`

Tables lues :

- `ps_cart`
- `ps_cart_product`

### 2. Vérifier que le panier n'a pas déjà une commande

API :

```txt
GET /api/orders?filter[id_cart]=[{id_cart}]&display=[id,id_cart,id_customer,current_state]
```

Si une commande existe déjà pour ce panier, ne pas recréer une commande.

Tables lues :

- `ps_orders`

### 3. Récupérer l'adresse client

Les informations d'adresse du client ne sont pas stockées dans `ps_customer`. Elles sont dans `ps_address`, liées par `id_customer`.

Dans le cas normal, on réutilise une adresse déjà existante du client.

API :

```txt
GET /api/addresses?filter[id_customer]=[{id_customer}]&filter[deleted]=[0]&display=full
```

À faire :

- prendre une adresse active/non supprimée du client ;
- utiliser son `id` comme `id_address_delivery` ;
- utiliser le même `id` comme `id_address_invoice` si l'app ne gère pas une adresse de facturation différente.

Champs utilisés ensuite :

- `ps_cart.id_address_delivery = id_address`
- `ps_cart.id_address_invoice = id_address`
- `ps_orders.id_address_delivery = id_address`
- `ps_orders.id_address_invoice = id_address`

API seulement si aucune adresse exploitable n'existe :

```txt
POST /api/addresses
```

Table lue :

- `ps_address`

Table affectée seulement si création :

- `ps_address`

Valeurs importantes en cas de création :

- `id_customer`
- `id_country`
- `alias`
- `lastname`
- `firstname`
- `address1`
- `city`
- `postcode` si le pays l'exige
- `phone` ou `phone_mobile` si nécessaire
- `active = 1`
- `deleted = 0`

### 4. Utiliser le transporteur gratuit existant

Transporteur à utiliser :

```txt
id_carrier = 1
name = Click and collect
is_free = 1
```

Il n'est pas nécessaire de calculer les frais de livraison ni de chercher un autre transporteur.

Tables lues :

- `ps_carrier`

Valeurs à utiliser dans la commande :

- `id_carrier = 1`
- `total_shipping = 0`
- `total_shipping_tax_incl = 0`
- `total_shipping_tax_excl = 0`

### 5. Mettre à jour le panier avant validation

API :

```txt
PUT /api/carts/{id_cart}
```

Champs à compléter ou corriger :

- `id_address_delivery = id_address`
- `id_address_invoice = id_address`
- `id_carrier = 1`
- `id_customer = id_customer`
- `id_guest` non nul si on veut garder la cohérence avec le Front Office
- `id_lang`
- `id_currency`
- `id_shop`
- `id_shop_group`
- `secure_key = secure_key du customer`
- `cart_rows` avec toutes les lignes du panier

Important : au `PUT /api/carts/{id_cart}`, renvoyer toutes les lignes `cart_rows`. PrestaShop remplace les lignes existantes par celles envoyées.

Tables affectées :

- `ps_cart`
- `ps_cart_product`

Valeurs par défaut :

- `gift = 0`
- `recyclable = 0`
- `mobile_theme = 0`
- `allow_seperated_package = 0`
- `id_product_attribute = 0` si produit simple
- `id_customization = 0` si non utilisé

### 6. Récupérer l'état paiement à la livraison

API :

```txt
GET /api/configurations?filter[name]=PS_OS_COD_VALIDATION&display=full
```

Cette configuration vient du module `ps_cashondelivery`.

Table lue :

- `ps_configuration`

Valeur récupérée :

- `value = id_order_state` correspondant à `En attente de paiement à la livraison`

### 7. Créer la commande

API :

```txt
POST /api/orders
```

Champs principaux :

- `id_cart`
- `id_customer`
- `id_address_delivery`
- `id_address_invoice`
- `id_currency`
- `id_lang`
- `id_carrier = 1`
- `module = ps_cashondelivery`
- `payment = Paiement à la livraison`
- `total_paid`
- `total_paid_tax_incl`
- `total_paid_tax_excl`
- `total_paid_real = 0`
- `total_products`
- `total_products_wt`
- `total_shipping = 0`
- `total_shipping_tax_incl = 0`
- `total_shipping_tax_excl = 0`
- `total_discounts = 0` si aucun bon de réduction
- `total_wrapping = 0`
- `conversion_rate = 1`

Tables affectées automatiquement par PrestaShop :

- `ps_orders`
- `ps_order_detail`
- `ps_order_detail_tax`
- `ps_order_history`
- `ps_order_carrier`
- `ps_order_payment` seulement si l'état de commande est considéré comme payable/logable
- `ps_order_invoice` selon la configuration de l'état
- `ps_stock_available`
- `ps_stock_mvt` selon la configuration de stock

À ne pas appeler directement :

- `POST /api/order_details`
- `POST /api/order_carriers`
- `POST /api/order_payments`

Ces sous-tables sont créées par `POST /api/orders`.

### 8. Corriger l'état si nécessaire

Avec le Webservice, `POST /api/orders` utilise la logique `Order::addWs()` et peut appliquer l'état configuré par `PS_OS_WS_PAYMENT` au lieu de l'état spécifique du module paiement à la livraison.

Après création, recharger la commande :

```txt
GET /api/orders/{id_order}
```

Si `current_state` n'est pas l'état `PS_OS_COD_VALIDATION`, ajouter un historique :

```txt
POST /api/order_histories
```

Champs :

- `id_order = id_order`
- `id_order_state = valeur de PS_OS_COD_VALIDATION`

Tables affectées :

- `ps_order_history`
- `ps_orders.current_state`

## Ordre d'appel recommandé

1. `GET /api/carts/{id_cart}`
2. `GET /api/orders?filter[id_cart]=[{id_cart}]`
3. `GET /api/addresses?filter[id_customer]=[{id_customer}]`
4. `POST /api/addresses` seulement si aucune adresse exploitable n'existe
5. Utiliser directement `id_carrier = 1` (`Click and collect`)
6. `PUT /api/carts/{id_cart}` avec adresse, `id_carrier = 1` et toutes les lignes panier
7. `GET /api/configurations?filter[name]=PS_OS_COD_VALIDATION&display=full`
8. `POST /api/orders`
9. `GET /api/orders/{id_order}`
10. `POST /api/order_histories` seulement si l'état n'est pas `PS_OS_COD_VALIDATION`

## Résumé des tables affectées

Tables modifiées directement ou indirectement :

- `ps_address` si création d'adresse
- `ps_cart`
- `ps_cart_product`
- `ps_orders`
- `ps_order_detail`
- `ps_order_detail_tax`
- `ps_order_history`
- `ps_order_carrier`
- `ps_order_payment` selon l'état appliqué
- `ps_order_invoice` selon l'état appliqué
- `ps_stock_available`
- `ps_stock_mvt` selon la configuration stock

Tables lues :

- `ps_customer`
- `ps_address`
- `ps_cart`
- `ps_cart_product`
- `ps_carrier`
- `ps_configuration`
- `ps_order_state`
