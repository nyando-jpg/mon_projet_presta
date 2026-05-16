# 📋 Documentation des Fonctionnalités PrestaShop 8.2.6

## 🗂️ Index des Fonctionnalités Principales

---

## 1️⃣ GESTION DES PRODUITS (Products)

### 📦 Produits (AdminProductsController)
- **Description**: Créer, modifier, supprimer et gérer les produits du catalogue
- **Fonctionnalités**:
  - Ajouter des produits avec descriptions multi-langue
  - Gérer les prix, taxes, réductions
  - Uploader des images et vidéos
  - Définir les quantités en stock
  - Associer à des catégories
  - Gérer les attributs (taille, couleur, etc.)
  - SEO (Meta titles, descriptions, URLs)
- **Données liées**: Product, ProductAttribute, ProductImage, ProductDownload

### 🏷️ Catégories (AdminCategoriesController)
- **Description**: Organiser les produits par catégories hiérarchiques
- **Fonctionnalités**:
  - Créer des catégories parent/enfant
  - Ajouter descriptions et images
  - Gérer l'affichage (menu, page d'accueil)
  - SEO pour chaque catégorie
- **Données liées**: Category, CategoryLang

### 🎨 Attributs et Valeurs (AdminAttributesGroupsController)
- **Description**: Créer des variantes de produits (taille, couleur, matière...)
- **Fonctionnalités**:
  - Ajouter des groupes d'attributs (taille, couleur)
  - Définir les valeurs possibles
  - Créer des combinaisons de variantes
- **Données liées**: AttributeGroup, Attribute, Combination, ProductAttribute

### 🏭 Fabricants (AdminManufacturersController)
- **Description**: Gérer les marques et fabricants
- **Fonctionnalités**:
  - Créer des fabricants
  - Ajouter des adresses et logos
  - Associer des produits
- **Données liées**: Manufacturer, ManufacturerAddress

### 👥 Fournisseurs (AdminSuppliersController)
- **Description**: Gérer les fournisseurs de produits
- **Fonctionnalités**:
  - Ajouter des fournisseurs
  - Définir les addresses de livraison
  - Associer des produits
- **Données liées**: Supplier, SupplierAddress, ProductSupplier

### 🎁 Packs de Produits
- **Description**: Créer des bundles/packs de plusieurs produits
- **Fonctionnalités**:
  - Regrouper plusieurs produits
  - Gestion de stock globale
  - Prix ensemble vs individuel
- **Données liées**: Pack

### 📥 Téléchargements Virtuels
- **Description**: Gérer les produits téléchargeables (ebooks, musique, logiciels)
- **Fonctionnalités**:
  - Uploader des fichiers
  - Limiter le nombre de téléchargements
  - Gérer l'expiration
- **Données liées**: ProductDownload

---

## 2️⃣ GESTION DES COMMANDES (Orders)

### 📝 Commandes (AdminOrdersController)
- **Description**: Visualiser, créer et gérer les commandes clients
- **Fonctionnalités**:
  - Voir toutes les commandes
  - Créer une commande manuelle
  - Modifier le statut
  - Ajouter des articles supplémentaires
  - Gérer les paiements
  - Générer les factures/bons de livraison (PDF)
  - Ajouter des messages au client
  - Voir l'historique des actions
- **Données liées**: Order, OrderDetail, OrderHistory, OrderPayment

### 🚚 Livraisons (OrderDelivery)
- **Description**: Gérer la livraison des commandes
- **Fonctionnalités**:
  - Générer des bons de livraison
  - Suivre l'état de livraison
  - Imprimer les étiquettes
- **Données liées**: Order, OrderState

### 📊 Statuts de Commande (AdminStatusesController)
- **Description**: Définir et gérer les statuts de commande
- **Fonctionnalités**:
  - Créer des statuts personnalisés
  - Envoyer des emails aux clients au changement de statut
  - Colorer les statuts
- **Données liées**: OrderState

### 💳 Paiements
- **Description**: Gérer les modes et historiques de paiement
- **Fonctionnalités**:
  - Enregistrer les paiements effectués
  - Plusieurs modes de paiement (carte, virement, etc.)
  - Intégration avec modules de paiement
- **Données liées**: OrderPayment

### 🔄 Retours/Remboursements (AdminReturnController)
- **Description**: Gérer les demandes de retour de produits
- **Fonctionnalités**:
  - Créer des autorisation de retour (RMA)
  - Traiter les remboursements
  - Imprimer les étiquettes de retour
- **Données liées**: OrderReturn

### 🛒 Paniers Abandonnés (AdminCartsController)
- **Description**: Récupérer les ventes en affichant les paniers non validés
- **Fonctionnalités**:
  - Voir les paniers abandonnés
  - Contacter les clients
  - Récupérer les ventes
- **Données liées**: Cart

---

## 3️⃣ GESTION DES CLIENTS (Customers)

### 👤 Clients (AdminCustomersController)
- **Description**: Gérer les profils et informations des clients
- **Fonctionnalités**:
  - Ajouter/modifier des clients
  - Gérer les adresses
  - Voir l'historique d'achat
  - Gérer les groupes clients
  - Voir les paniers
  - Réinitialiser le mot de passe
- **Données liées**: Customer, CustomerAddress, CustomerSession

### 🏠 Adresses (AdminAddressesController)
- **Description**: Gérer les adresses de livraison/facturation
- **Fonctionnalités**:
  - Ajouter plusieurs adresses par client
  - Valider le format des adresses
  - Définir l'adresse par défaut
- **Données liées**: Address, CustomerAddress

### 👥 Groupes Clients (AdminGroupsController)
- **Description**: Créer des segments clients avec réductions
- **Fonctionnalités**:
  - Créer des groupes (VIP, Grossistes, etc.)
  - Définir des réductions automatiques par groupe
  - Assigner des clients
- **Données liées**: Group, GroupReduction

### 📧 Messages Clients (AdminCustomerThreadsController)
- **Description**: Gérer les conversations avec les clients
- **Fonctionnalités**:
  - Voir les messages/réclamations
  - Répondre aux messages
  - Assigner à un emploi
  - Marquer comme résolu
- **Données liées**: CustomerThread, CustomerMessage

### 🎯 Privé de Données (RGPD) (AdminDataPrivacyController via ps_dataprivacy)
- **Description**: Respecter les droits de conformité RGPD
- **Fonctionnalités**:
  - Traiter les demandes d'accès aux données
  - Exporter les données client
  - Supprimer les données clients
- **Module**: ps_dataprivacy

---

## 4️⃣ GESTION DES PRIX ET RÉDUCTIONS

### 💰 Prix Spécifiques (SpecificPrice)
- **Description**: Créer des réductions personnalisées par produit
- **Fonctionnalités**:
  - Réduction au prix fixe ou pourcentage
  - Applicable à un client, groupe ou tous
  - Dates de validité
- **Données liées**: SpecificPrice

### 🏷️ Règles de Prix Spécifiques (AdminSpecificPriceRuleController)
- **Description**: Appliquer des prix réduits par lot
- **Fonctionnalités**:
  - Créer des règles de réduction
  - Par catégorie, fabricant, fournisseur
  - Appliquer automatiquement
- **Données liées**: SpecificPriceRule

### 🎟️ Codes Promo / Règles Panier (AdminCartRulesController)
- **Description**: Créer des coupons et codes de réduction
- **Fonctionnalités**:
  - Code promo avec réduction fixe/pourcentage
  - Restrictions (montant min, produits, client)
  - Limiter les utilisations
  - Appliquer une livraison gratuite
  - Règles conditionnelles (quantité, prix minimum)
- **Données liées**: CartRule

---

## 5️⃣ GESTION DE LA LIVRAISON

### 🚚 Transporteurs/Livreurs (AdminCarriersController)
- **Description**: Gérer les options de livraison
- **Fonctionnalités**:
  - Ajouter des transporteurs (DHL, UPS, etc.)
  - Définir les zones de livraison
  - Tarifs par poids/prix
  - Taxes sur livraison
  - En pickup ou domicile
- **Données liées**: Carrier, Delivery, Range

### 📍 Zones de Livraison (AdminZonesController)
- **Description**: Organiser les pays/zones de livraison
- **Fonctionnalités**:
  - Créer des zones (Europe, USA, etc.)
  - Ajouter des pays
  - Frais de livraison par zone
- **Données liés**: Zone

---

## 6️⃣ GESTION ADMINISTRATIVE

### 🏪 Boutiques (AdminShopController)
- **Description**: Gérer les configurations par boutique
- **Fonctionnalités**:
  - Créer des boutiques multiples
  - Nom, URL, logo
  - Configurations par boutique
- **Données liées**: Shop

### ⚙️ Paramètres Généraux (ConfigurationController)
- **Description**: Configurer les paramètres globaux de PrestaShop
- **Fonctionnalités**:
  - Infos boutique (nom, email)
  - Devises par défaut
  - Langues
  - Serveur mail SMTP
  - Tokens de sécurité
- **Données liées**: Configuration

### 👨‍💼 Employés (AdminEmployeesController)
- **Description**: Gérer les utilisateurs du back-office
- **Fonctionnalités**:
  - Ajouter des employés
  - Définir les rôles/profils
  - Permissions par module
  - Email et mot de passe
- **Données liées**: Employee, Profile, Access

### 📋 Rôles & Permissions (AdminProfilesController)
- **Description**: Créer des profils d'accès personnalisés
- **Fonctionnalités**:
  - Créer des rôles (Admin, Vendeur, Comptable)
  - Définir les permissions par module
  - Lecture/Écriture/Création/Suppression
- **Données liées**: Profile, Access, Tab

### 🔐 Contrôle d'Accès (AdminAccessController)
- **Description**: Gérer les permissions détaillées par profil
- **Fonctionnalités**:
  - Activer/désactiver l'accès aux modules
  - Lire, créer, modifier, supprimer
  - Par profil et par onglet/module
- **Données liées**: Access

---

## 7️⃣ TAXES ET LOCALISATIONS

### 💸 Taxes (AdminTaxesController)
- **Description**: Gérer les taux de taxes
- **Fonctionnalités**:
  - Créer des taux de TVA
  - Appliquer selon pays/région
  - Taxes incluses ou en sus
- **Données liées**: Tax, TaxRule

### 📍 Localisation (AdminLocalizationController)
- **Description**: Configurer la localisation par défaut
- **Fonctionnalités**:
  - Langue/pays par défaut
  - Importer/exporter packs de localisation
  - Devises supportées
- **Données liées**: Language, Currency, Country

### 🌐 Pays (AdminCountriesController)
- **Description**: Gérer les pays et régions
- **Fonctionnalités**:
  - Activer/désactiver des pays
  - Codes d'appels
  - Régions (États)
- **Données liées**: Country, State

### 💱 Devises (AdminCurrenciesController)
- **Description**: Gérer les devises
- **Fonctionnalités**:
  - Ajouter des devises
  - Taux de change
  - Devise par défaut
  - Mise à jour automatique
- **Données liées**: Currency

---

## 8️⃣ CONTENU ET CMS

### 📄 Pages CMS (AdminCmsController)
- **Description**: Créer des pages statiques (À propos, Mentions légales)
- **Fonctionnalités**:
  - Créer des pages en HTML/RichText
  - Organiser par catégories
  - Afficher au menu ou footer
  - SEO par page
- **Données liées**: CMS, CMSCategory

### 🔗 Liens & Menu (AdminLinkController - ps_linklist)
- **Description**: Gérer les menus et liens du site
- **Fonctionnalités**:
  - Créer des blocs de liens (footer, sidebar)
  - Liens internes/externes
  - Ordre d'affichage
  - Module ps_linklist

### 🏷️ Balises/Tags (AdminTagsController)
- **Description**: Créer des tags pour les produits
- **Fonctionnalités**:
  - Ajouter des tags aux produits
  - Multi-langue
  - Cloud de tags
- **Données liées**: Tag

---

## 9️⃣ MODULES ET EXTENSIONS

### 📦 Modules (AdminModulesController)
- **Description**: Installer, configurer et gérer les modules
- **Fonctionnalités**:
  - Installer/désinstaller des modules
  - Activer/désactiver
  - Configurer les modules
  - Voir les permissions par module
  - Mettre à jour les modules
- **Données liées**: Module

### 📍 Positions des Modules (AdminModulesPositionsController)
- **Description**: Organiser l'affichage des modules
- **Fonctionnalités**:
  - Placer les modules par hooks
  - Définir l'ordre d'affichage
  - Hooking system
- **Données liées**: Hook

### 🎨 Thèmes (AdminThemesController)
- **Description**: Gérer les thèmes et personnalisation
- **Fonctionnalités**:
  - Installer des thèmes
  - Basculer entre thèmes
  - Personnaliser via ps_themecusto
  - Exporter/importer thèmes
- **Données liées**: Theme

---

## 🔟 RECHERCHE ET SEO

### 🔍 Recherche (AdminSearchConfController)
- **Description**: Configurer le moteur de recherche
- **Fonctionnalités**:
  - Activer/désactiver la recherche
  - Poids par champ (nom vs description)
  - Autocomplete
- **Module**: ps_facetedsearch (recherche à facettes)

### 🔗 SEO (MetaController)
- **Description**: Gérer les meta tags et URLs
- **Fonctionnalités**:
  - URLs personnalisées par produit/catégorie/page
  - Meta titles et descriptions
  - Sitemap automatique
  - Schema microdata
- **Données liées**: Meta

---

## 1️⃣1️⃣ STATISTIQUES ET RAPPORTS

### 📊 Tableaux de Bord (AdminDashboardController)
- **Description**: Vue d'ensemble des performances
- **Fonctionnalités**:
  - Ventes du jour/mois
  - Commandes récentes
  - Articles populaires
  - Graphiques dynamiques
- **Modules**: dashactivity, dashproducts, dashtrends, dashgoals

### 📈 Stats (AdminStatsController)
- **Description**: Rapports détaillés sur les ventes
- **Fonctionnalités**:
  - Ventes par période
  - Meilleurs clients, produits, catégories
  - Origine des ventes
  - Panier moyen
- **Modules**: statssales, statsbestproducts, statsbestcustomers, etc.

### 📋 Requêtes SQL Personnalisées (AdminRequestSqlController)
- **Description**: Créer des rapports personnalisés
- **Fonctionnalités**:
  - Exécuter des requêtes SQL
  - Enregistrer les requêtes favorites
  - Exporter les résultats
- **Données liées**: RequestSql

---

## 1️⃣2️⃣ MARKETING ET FIDÉLITÉ

### 📧 E-mails (AdminMailController)
- **Description**: Gérer les templates d'emails
- **Fonctionnalités**:
  - Créer des templates personnalisés
  - Variables dynamiques
  - Tester l'envoi
  - Historique d'envois
- **Données liées**: Mail

### 🎯 Emailings (Module ps_emailsubscription)
- **Description**: Newsletter et listes d'abonnés
- **Fonctionnalités**:
  - Abonnement à la newsletter
  - Gestion des abonnés
  - Envoi de campagnes
  - Module ps_emailsubscription

### 🎁 Parrainages/Affiliés (Module referralprogram)
- **Description**: Système d'affiliation et parrainage
- **Fonctionnalités**:
  - Codes parrainage
  - Commissions d'affiliation
  - Suivi des performances
  - Module referralprogram

### 🏆 Gamification (Module gamification)
- **Description**: Système de points et récompenses
- **Fonctionnalités**:
  - Points de fidélité
  - Réductions basées sur points
  - Badges et achievements
  - Module gamification

---

## 1️⃣3️⃣ INTÉGRATIONS ET CONNECTEURS

### 📱 Google Marketing (Module psxmarketingwithgoogle)
- **Description**: Intégration Google Ads et Analytics
- **Fonctionnalités**:
  - Google Analytics 4
  - Google Ads conversion tracking
  - Shopping feed
  - Module psxmarketingwithgoogle

### 📱 Facebook (Module ps_facebook)
- **Description**: Intégration Facebook Pixel et Shop
- **Fonctionnalités**:
  - Pixel de conversion
  - Catalogue de produits
  - Publicités Facebook
  - Module ps_facebook

### 💳 Passerelles de Paiement
- **Description**: Intégrations de paiement
- **Fonctionnalités**:
  - Paiement par carte (Stripe, PayPal, etc.)
  - Virement bancaire (ps_wirepayment)
  - Paiement à la livraison (ps_cashondelivery)
  - Paiement à la commande (ps_checkpayment)
  - Module ps_checkout (Prestashop native)

### 🔗 APIs et Webservice (webservice/dispatcher.php)
- **Description**: API REST pour intégrations tierces
- **Fonctionnalités**:
  - Authentification API
  - CRUD sur produits, commandes, clients
  - Format JSON/XML
  - Webhooks

---

## 1️⃣4️⃣ IMPORT/EXPORT

### 📥 Import (AdminImportController)
- **Description**: Importer des données en masse
- **Fonctionnalités**:
  - Importer produits, clients, commandes (CSV)
  - Mapping des colonnes
  - Validation des données
  - Rapport d'erreurs

### 📤 Export
- **Description**: Exporter des données
- **Fonctionnalités**:
  - Export de catalogues
  - Export de commandes
  - Sitemap XML
  - Flux de produits

---

## 1️⃣5️⃣ SUPPORT ET CONFORMITÉ

### 📞 Formulaire de Contact (contactform)
- **Description**: Formulaire de contact client
- **Fonctionnalités**:
  - Catégories de messages
  - Sujets d'assistance
  - Sauvegarde des conversations
  - Module contactform

### 🔒 Conformité RGPD (ps_dataprivacy)
- **Description**: Conformité légale données
- **Fonctionnalités**:
  - Demande d'accès aux données
  - Télécharger les données
  - Supprimer les données
  - Droit à l'oubli
  - Module ps_dataprivacy

### ⚠️ Pages non trouvées (AdminNotFoundController - pagesnotfound)
- **Description**: Suivre et corriger les erreurs 404
- **Fonctionnalités**:
  - Voir les URLs 404
  - Rediriger les URLs cassées
  - Module pagesnotfound

---

## 1️⃣6️⃣ AUTRES FONCTIONNALITÉS

### 🖼️ Galerie d'Images (AdminImagesController)
- **Description**: Gérer les images du site
- **Fonctionnalités**:
  - Uploader des images
  - Générer des variantes (thumbnails)
  - Optimiser les images
  - Compression

### 📄 PDF (AdminPdfController)
- **Description**: Générer et gérer les PDF
- **Fonctionnalités**:
  - Factures PDF
  - Bons de livraison
  - Bons de retour
  - Templates personnalisés

### 🔎 Accès Rapide (AdminQuickAccessesController)
- **Description**: Favoris personnalisés du back-office
- **Fonctionnalités**:
  - Ajouter des raccourcis
  - Accès rapide aux pages fréquentes

### 📊 Graphiques (graphnvd3)
- **Description**: Visualisation des données
- **Fonctionnalités**:
  - Graphiques dynamiques
  - Statistiques visuelles
  - Module graphnvd3

### 🛡️ Sécurité et Logs
- **Description**: Logs et audit des actions
- **Fonctionnalités**:
  - Logs des modifications
  - Historique des actions
  - Classe PrestaShopLogger

### 📜 Sauvegardes (PrestaShopBackup)
- **Description**: Sauvegarder la base de données
- **Fonctionnalités**:
  - Backup BD
  - Restauration
  - Archive automatique

---

## 1️⃣7️⃣ MODÈLE DE DONNÉES GLOBAL

### 🧩 Entités Coeur (Vue transverse)
- **Catalogue**: Product, Category, AttributeGroup, Attribute, Manufacturer, Supplier
- **Vente**: Cart, CartRule, Order, OrderDetail, OrderHistory, OrderPayment
- **Client**: Customer, Address, Group, CustomerThread, CustomerMessage
- **Stock**: StockAvailable, Warehouse, Movement (selon modules/ASM)
- **Fiscalité**: Tax, TaxRule, TaxRulesGroup
- **International**: Country, State, Zone, Currency, Language
- **Contenu**: CMS, CMSCategory, Meta

### 🔗 Relations Principales
- **Customer -> Order**: un client peut avoir plusieurs commandes
- **Order -> OrderDetail**: une commande contient plusieurs lignes de commande
- **Product -> Category**: relation plusieurs-a-plusieurs via table d'association
- **Product -> Combination**: un produit peut avoir plusieurs variantes
- **Cart -> CartRule**: un panier peut appliquer plusieurs règles de réduction
- **Order -> OrderPayment**: un ou plusieurs paiements peuvent être liés à une commande
- **Country -> Zone**: chaque pays appartient à une zone logistique

### 🗄️ Tables Critiques (prefixe ps_)
- **Catalogue**: ps_product, ps_product_lang, ps_category, ps_category_lang, ps_image
- **Prix/Promos**: ps_specific_price, ps_cart_rule, ps_cart_rule_lang
- **Client**: ps_customer, ps_address, ps_group, ps_customer_group
- **Panier/Commande**: ps_cart, ps_cart_product, ps_orders, ps_order_detail, ps_order_history
- **Paiement/Livraison**: ps_order_payment, ps_carrier, ps_delivery
- **Taxes/Localisation**: ps_tax, ps_tax_rule, ps_country, ps_currency, ps_lang

### 📌 Donnees Sensibles a Surveiller
- **PII client**: nom, email, adresse, telephone
- **Transactions**: montants de commande, remboursements, statuts de paiement
- **Conformite**: conservation des logs, exports RGPD, suppression des donnees

---

## 1️⃣8️⃣ INTÉGRATIONS EXTERNES (VUE GLOBALE)

### 💳 Paiements
- **Modules courants**: ps_checkout, ps_checkpayment, ps_wirepayment, ps_cashondelivery
- **Flux**: panier -> selection du mode -> validation paiement -> creation commande -> mise a jour statut
- **Donnees echangees**: montant, devise, reference commande, statut transaction
- **Risques**: callback non recu, double confirmation, ecart montant/panier

### 🚚 Transporteurs et Logistique
- **Types d'integration**: calcul tarifs, etiquettes, suivi colis
- **Donnees echangees**: adresse livraison, poids, dimensions, zone, numero tracking
- **Points de controle**: mapping zones/pays, taxes livraison, delais de synchro tracking

### 📣 Marketing et Analytics
- **Modules courants**: psxmarketingwithgoogle, ps_googleanalytics, ps_facebook
- **Donnees echangees**: catalogue produits, evenements conversion, audience
- **Points de vigilance**: consentement cookies, coherence des tags, dedoublonnage evenements

### 🔗 API et Connecteurs Tierces
- **Webservice PrestaShop**: point d'entree via webservice/dispatcher.php
- **Ressources exposees**: produits, clients, commandes, stocks, adresses
- **Mecanismes**: cle API, permissions par ressource, CRUD XML/JSON selon endpoint
- **Points de vigilance**: rotation des cles, limitation de debit, validation des payloads

### 🧭 Synthese des Flux Externes
- **Inbound vers PrestaShop**: commandes, mises a jour stock, confirmations paiement
- **Outbound depuis PrestaShop**: flux catalogue, stats conversion, notifications statut
- **Observabilite recommandee**: logs module, id de correlation, horodatage des echanges

---

## 📊 DIAGRAMME GLOBAL DES MODULES

```
PrestaShop 8.2.6
├── 📦 Gestion Produits
│   ├── Products
│   ├── Categories
│   ├── Attributes
│   ├── Manufacturers
│   ├── Suppliers
│   └── Images
├── 🛒 Gestion Ventes
│   ├── Orders
│   ├── Cart Rules
│   ├── Prices
│   ├── Returns
│   └── Carriers
├── 👥 Gestion Clients
│   ├── Customers
│   ├── Addresses
│   ├── Customer Groups
│   └── Customer Messages
├── 💰 Finances
│   ├── Taxes
│   ├── Currencies
│   ├── Invoice PDF
│   └── Payments
├── 🎨 Contenu & Design
│   ├── CMS Pages
│   ├── Themes
│   ├── Modules
│   └── Menu
├── 🔍 SEO & Recherche
│   ├── Meta Tags
│   ├── URLs Friendly
│   └── Search Config
├── 📊 Analytics
│   ├── Dashboard
│   ├── Statistics
│   └── Reports
├── 🔗 Intégrations
│   ├── Payment Gateways
│   ├── Google Marketing
│   ├── Facebook Pixel
│   └── APIs/Webservice
└── ⚙️ Administration
    ├── Shops
    ├── Employees
    ├── Roles & Permissions
    ├── Settings
    └── Localization
```

---

## 🚀 PROCHAIN ÉTAPE

Dis-moi quelle fonctionnalité tu veux explorer en détail:
- **Flux complet d'une commande** (création → livraison)
- **Flux d'un produit** (création → vente)
- **Flux d'un client** (inscription → achat → fidélité)
- **API Webservice** (comment les appels API marchent)
- **Flux de paiement** (panier → paiement → confirmation)

Je vais alors te faire un **diagramme détaillé du flux** avec les fichiers, classes et requêtes SQL impliqués! 🎯
