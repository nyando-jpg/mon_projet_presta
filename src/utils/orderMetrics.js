import produitsService from '@/service/produitsService';
import taxesService from '@/service/taxesService';

const productCache = new Map();
const taxRateCache = new Map();

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

// Formate le nom du client à partir de ses informations, en gérant les cas où certaines données peuvent être manquantes
export const formatCustomerName = (customer) => {
  if (!customer) return 'Client introuvable';

  const fullName = [customer.firstname, customer.lastname].filter(Boolean).join(' ').trim();

  if (fullName) return fullName;
  if (customer.email) return customer.email;

  return `Client #${customer.id}`;
};

// Extrait les lignes de produits d'un panier et les formate dans une structure plus facile à manipuler, en gérant les cas où les données peuvent être manquantes ou mal formatées
export const getCartRows = (cart) => {
  const rawRows = cart?.associations?.cart_rows?.cart_row;
  return asArray(rawRows).map((row) => ({
    id_product: String(row?.id_product || '').trim(),
    id_product_attribute: String(row?.id_product_attribute || '0').trim() || '0',
    quantity: Number(row?.quantity || 0)
  })).filter((row) => row.id_product);
};

// Calcule le nombre total d'articles dans un panier en sommant les quantités de chaque ligne de produit
export const getCartItemCount = (cart) => {
  return getCartRows(cart).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
};

const getProductCached = async (productId) => {
  const id = String(productId || '').trim();
  if (!id) return null;

  if (productCache.has(id)) {
    return productCache.get(id);
  }

  const product = await produitsService.getProduitById(id);
  productCache.set(id, product);
  return product;
};

const getTaxRateCached = async (productId) => {
  const id = String(productId || '').trim();
  if (!id) return null;

  if (taxRateCache.has(id)) {
    return taxRateCache.get(id);
  }

    let rate = await taxesService.getProductTaxRate(id);
    // Si la taxe produit n'a pas pu être déterminée, récupérer un taux par défaut
    if (rate === null || rate === undefined) {
      try {
        const defaultRate = await taxesService.getDefaultTaxRate();
        rate = (defaultRate === null || defaultRate === undefined) ? 0 : defaultRate;
      } catch (err) {
        rate = 0;
      }
    }

    taxRateCache.set(id, rate ?? 0);
    return rate ?? 0;
};

// Calcule le total HT d'un panier en sommant le prix de base de chaque ligne, en tenant compte des impacts de combinaison
export const computeCartTotalHT = async (cart) => {
  const rows = getCartRows(cart);

  if (!rows.length) {
    return 0;
  }

  const total = await rows.reduce(async (accumulatorPromise, row) => {
    const accumulator = await accumulatorPromise;
    const quantity = Number(row.quantity || 0);

    if (!quantity) return accumulator;

    const product = await getProductCached(row.id_product);
    if (!product) return accumulator;

    const productPrice = Number(product.price || 0);
    const combinationImpact = row.id_product_attribute && row.id_product_attribute !== '0'
      ? Number(await produitsService.getCombinationPriceImpact(row.id_product_attribute)) || 0
      : 0;

    return accumulator + ((productPrice + combinationImpact) * quantity);
  }, Promise.resolve(0));

  return Number(total.toFixed(2));
};

// Calcule le total TTC d'un panier en sommant le prix TTC de chaque ligne de produit, en tenant compte des impacts de combinaison et des taux de taxe
export const computeCartTotalTTC = async (cart) => {
  const rows = getCartRows(cart);

  if (!rows.length) {
    return 0;
  }

  const total = await rows.reduce(async (accumulatorPromise, row) => {
    const accumulator = await accumulatorPromise;
    const quantity = Number(row.quantity || 0);

    if (!quantity) return accumulator;

    const product = await getProductCached(row.id_product);
    if (!product) return accumulator;

    const productPrice = Number(product.price || 0);
    const combinationImpact = row.id_product_attribute && row.id_product_attribute !== '0'
      ? Number(await produitsService.getCombinationPriceImpact(row.id_product_attribute)) || 0
      : 0;
    const taxRate = await getTaxRateCached(row.id_product);

    const unitPriceTTC = taxesService.calculatePriceTTC(productPrice + combinationImpact, taxRate ?? 0);

    return accumulator + (unitPriceTTC * quantity);
  }, Promise.resolve(0));

  return Number(total.toFixed(2));
};

// Enrichit les données d'un panier avec des informations calculées comme la date, le nombre d'articles et le total TTC
export const enrichCartSummary = async (cart) => {
  const cartDate = cart?.date_add || '';
  const itemCount = getCartItemCount(cart);
  const totalHT = await computeCartTotalHT(cart);
  const totalTTC = await computeCartTotalTTC(cart);

  return {
    cartDate,
    itemCount,
    totalHT,
    totalTTC
  };
};