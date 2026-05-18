backend/login/
    page : Login.vue
        fonction handleLogin ()
            verifie username et password
            mets en localStorage ('isAuthenticated','true') et ('userRole','admin')
            redirige dans dashboard.


backend/dashboard/
    page : 
        Dashboard.vue :
            appelle ordersService/getOrders()
            fonction:
                totalRevenue : somme de tout order
                paidOrders : filtre les paye
                paidRevenue : somme des paye
                paidOrdersCount : nombre des paye
                dailyStats : groupement par jour (nombre et prix)
        ordersService.js :
            transformerOrder(order) : transforme en js structure
            getOrders() : prends tout les order
                /orders
                transformerOrder(order)

backend/PanierList/
    page:
        PanierList.vue
            appelle:
                - cartsService.getCarts()
                - ordersService.getOrders()
                - ordersService.getOrderStates()
                - customersService.getCustomers()
            fonction : 
                updateOrderStatus(orderId, newStateId) : changer un nouvelle etat pour une commande
                    - appelle `ordersService.updateOrderState(orderId, newStateId)` qui envoie la modification au webservice (/order_histories ou /orders selon implémentation)
                    - met à jour localement `orders` pour refléter l'état sans recharger la page
                getOrderForCart(cartId) : retourne la commande liée à un panier (match id_cart)
                enrichCartSummary(cart) : utilitaire appelé pour calculer
                    - cartDate : date du panier
                    - itemCount : nombre total d'articles (somme des quantités)
                    - total : total calculé (via `computeCartTotal` qui résout prix TTC par produit)
            données:
                - cartsService.transformerCart(cart) : normalise le XML du panier
                - ordersService.transformerOrder(order) : normalise le XML de la commande
                - customersService.transformerCustomers(customer) : normalise le client


backend/CommandesList/
    page:
        CommandesList.vue
            appelle:
                - ordersService.getOrders()
                - cartsService.getCarts()
                - customersService.getCustomers()
            fonction :
                - enrichit chaque commande avec `cartSummary` (itemCount, total) via `enrichCartSummary`
                - formatCustomerName(customer) : formate prénom / nom ou email si manquant
                - formatPrice(total) : formate le montant avec 2 décimales


backend/StockManagement/
    page:
        StockManagement.vue
            appelle:
                - produitsService.getProduits() : récupère la liste des produits
                - produitsService.getStockManagementRows(product) : récupère les lignes de stock (produit + combinaisons)
            fonction :
                - affiche stock principal + combinaisons
                - permet d'ajouter une quantité (input + bouton) -> submitStockUpdate(product, entry)
                - submitStockUpdate appelle produitsService.updateStockQuantity(stockId, newQuantity)
            utilitaires:
                - draftQuantities : objet temporaire pour stocker les ajouts avant envoi
                - rowKey(productId, stockId) : clé unique pour les drafts


-- FRONT (principales pages utilisateurs) --

frontend/ProduitsList/
    page: ProduitsList.vue
        - appelle `produitsService.getProduits()`
        - affiche la grille/list des produits
        - permet d'ajouter au panier (via `cartsService`)

frontend/ProduitsDetail/
    page: ProduitsDetail.vue
        - charge un produit (id) et ses combinations
        - calcule sous-total HT / TTC via `taxesService` et `produitsService.getCombinationPriceImpact`
        - bouton Commander -> ajoute au panier et redirige vers la page commande

frontend/Panier/
    page: Panier.vue
        - stocke localement les lignes choisies (id_product, id_product_attribute, qty)
        - affiche `getSubTotal()` (HT) et `getSubTotalTTC()` (TTC)
        - en finaliser, crée le panier / met à jour via `cartsService` et redirige vers `Commande.vue`

frontend/Commande/
    page: Commande.vue
        - collecte adresse / méthode de paiement
        - calcule totaux (HT/TTC) et shipping
        - appelle `ordersService.createOrder(orderPayload)` qui :
            - récupère le panier complet (`getCartFull`)
            - prépare le panier (PUT /carts/{id}) via `prepareCartBeforeOrder`
            - poste `/orders` pour créer la commande

frontend/MesCommandes/
    page: MesCommandes.vue
        - combine paniers et commandes pour présenter l'historique utilisateur
        - rely sur `cartsService.getCarts()` et `ordersService.getOrders()`


UTILS & SERVICES (rappel rapide)
    - ordersService.js : récupération et création de commandes, normalisation (transformerOrder), update status
    - cartsService.js : récupération et mise à jour des paniers, transformation (transformerCart)
    - produitsService.js : produits, combinaisons, stock, impacts de prix
    - customersService.js : récupération et normalisation des clients
    - taxesService.js : calculs TTC/HT et récupération des taux
    - utils/orderMetrics.js : `computeCartTotal`, `enrichCartSummary`, `formatCustomerName`

Remarque: Les pages `ImportView` et `ResetView` sont volontairement exclues de cette documentation comme demandé.








