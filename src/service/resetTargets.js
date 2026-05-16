export const resetTargets = [
  {
    key: 'orders',
    label: 'Commandes',
    endpoint: '/orders',
    collectionKey: 'orders',
    itemKey: 'order',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'order_details',
    label: 'Details de commande',
    endpoint: '/order_details',
    collectionKey: 'order_details',
    itemKey: 'order_detail',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'carts',
    label: 'Paniers',
    endpoint: '/carts',
    collectionKey: 'carts',
    itemKey: 'cart',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'customers',
    label: 'Clients',
    endpoint: '/customers',
    collectionKey: 'customers',
    itemKey: 'customer',
    defaultSelected: true,
    skipIds: [1]
  },
  {
    key: 'addresses',
    label: 'Adresses',
    endpoint: '/addresses',
    collectionKey: 'addresses',
    itemKey: 'address',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'products',
    label: 'Produits',
    endpoint: '/products',
    collectionKey: 'products',
    itemKey: 'product',
    defaultSelected: true,
    skipIds: []
  },
  {
    key: 'categories',
    label: 'Categories',
    endpoint: '/categories',
    collectionKey: 'categories',
    itemKey: 'category',
    defaultSelected: true,
    skipIds: [1, 2]
  },
  {
    key: 'combinations',
    label: 'Combinaisons',
    endpoint: '/combinations',
    collectionKey: 'combinations',
    itemKey: 'combination',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'cart_rules',
    label: 'Regles panier',
    endpoint: '/cart_rules',
    collectionKey: 'cart_rules',
    itemKey: 'cart_rule',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'specific_prices',
    label: 'Prix specifiques',
    endpoint: '/specific_prices',
    collectionKey: 'specific_prices',
    itemKey: 'specific_price',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'tags',
    label: 'Tags produits',
    endpoint: '/tags',
    collectionKey: 'tags',
    itemKey: 'tag',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'customizations',
    label: 'Personnalisations',
    endpoint: '/customizations',
    collectionKey: 'customizations',
    itemKey: 'customization',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'product_suppliers',
    label: 'Fournisseurs produits',
    endpoint: '/product_suppliers',
    collectionKey: 'product_suppliers',
    itemKey: 'product_supplier',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'manufacturers',
    label: 'Fabricants',
    endpoint: '/manufacturers',
    collectionKey: 'manufacturers',
    itemKey: 'manufacturer',
    defaultSelected: false,
    skipIds: []
  },
  {
    key: 'suppliers',
    label: 'Fournisseurs',
    endpoint: '/suppliers',
    collectionKey: 'suppliers',
    itemKey: 'supplier',
    defaultSelected: false,
    skipIds: []
  }
];
