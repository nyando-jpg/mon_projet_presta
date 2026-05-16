const CUSTOMER_STORAGE_KEY = 'customer';
const GUEST_CART_STORAGE_KEY = 'active_cart_id_guest';
const CART_STORAGE_PREFIX = 'active_cart_id_customer_';

// Lit les données du client stockées en local (si présentes) et les parse en JSON
const readStoredCustomer = () => {
  const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
};

// Génère la clé de stockage du panier en fonction de l'ID du client (ou utilise la clé générique pour les invités)
const getCustomerCartStorageKey = (customerId) => {
  if (customerId === null || customerId === undefined || customerId === '') {
    return GUEST_CART_STORAGE_KEY;
  }

  return `${CART_STORAGE_PREFIX}${customerId}`;
};

// Récupère l'ID du client actuellement connecté (ou null si aucun client n'est connecté)
const getCurrentCustomerId = () => {
  const customer = readStoredCustomer();
  return customer?.id ? String(customer.id) : '';
};

// Récupère l'ID du panier actif pour le client actuel (ou pour le visiteur invité)
const getActiveCartId = () => {
  const customerId = getCurrentCustomerId();

  if (customerId) {
    return localStorage.getItem(getCustomerCartStorageKey(customerId)) || localStorage.getItem(GUEST_CART_STORAGE_KEY) || localStorage.getItem('active_cart_id');
  }

  return localStorage.getItem(GUEST_CART_STORAGE_KEY) || localStorage.getItem('active_cart_id');
};

// Met à jour l'ID du panier actif pour le client actuel (ou pour le visiteur invité) dans le localStorage
const setActiveCartId = (cartId) => {
  const customerId = getCurrentCustomerId();
  const storageKey = getCustomerCartStorageKey(customerId);

  if (cartId) {
    localStorage.setItem(storageKey, String(cartId));
    return;
  }

  localStorage.removeItem(storageKey);
};


const migrateGuestCartToCustomer = (customerId) => {
  if (!customerId) return null;

  const guestCartId = localStorage.getItem(GUEST_CART_STORAGE_KEY) || localStorage.getItem('active_cart_id');
  if (!guestCartId) return null;

  localStorage.setItem(getCustomerCartStorageKey(customerId), String(guestCartId));
  return guestCartId;
};
export {
  getActiveCartId,
  getCurrentCustomerId,
  getCustomerCartStorageKey,
  readStoredCustomer,
  setActiveCartId,
  migrateGuestCartToCustomer,
};