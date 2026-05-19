<script setup>
import { computed, onMounted, ref } from 'vue';
import produitsService from '@/service/produitsService';
import ordersService from '@/service/ordersService';
import customersService from '@/service/customersService';

const rows = ref([]);
const ordersAll = ref([]);
const loading = ref(true);
const error = ref('');

const cancelledStateIds = new Set([6]);

const rowKey = (productId, attributeId) => `${productId}:${attributeId}`;

const getPurchasePriceHT = (product) => {
  return Number(
    product?.wholesalePrice ??
    product?.wholesales_price ??
    product?.wholesale_price ??
    0
  ) || 0;
};

// Petit utilitaire local pour extraire le texte depuis les noeuds XML possibles
const localExtractVal = (node) => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    if ('#text' in node) return String(node['#text']);
    if ('id' in node) return String(node.id);
    // parfois Presta renvoie { product_id: { product_id: '123' } }
    const keys = Object.keys(node);
    if (keys.length === 1 && (typeof node[keys[0]] === 'string' || typeof node[keys[0]] === 'number')) {
      return String(node[keys[0]]);
    }
    return JSON.stringify(node);
  }
  return String(node);
};

const parseOrderRows = (order) => {
  const lines = Array.isArray(order?.products) ? order.products : [];

  return lines
    .map((row) => ({
      id_product: String(localExtractVal(row.product_id || row.id_product || '')).trim(),
      id_product_attribute: String(localExtractVal(row.product_attribute_id || row.id_product_attribute || '0')).trim() || '0',
      quantity: Number(localExtractVal(row.product_quantity || row.quantity || 0)) || 0,
      name: localExtractVal(row.product_name || row.name || '')
    }))
    .filter((row) => row.id_product && row.quantity > 0);
};

const extractOrderRows = (order) => {
  return parseOrderRows(order);
};

const buildSoldMap = (orders) => {
  const map = new Map();

  for (const order of orders || []) {
    if (cancelledStateIds.has(Number(order.current_state))) {
      continue;
    }

    for (const row of extractOrderRows(order)) {
      const key = rowKey(row.id_product, row.id_product_attribute);
      map.set(key, (map.get(key) || 0) + row.quantity);
    }
  }

  return map;
};

const loadData = async () => {
  loading.value = true;
  error.value = '';

  try {
    const [result, ordersData, customersData] = await Promise.all([
      produitsService.getProduits(),
      ordersService.getOrders(),
      customersService.getCustomers()
    ]);
    
    const productList = Array.isArray(result?.products) ? result.products : [];
    
    // On indexe par toutes les variantes de clés possibles pour maximiser les chances de hit direct
    const productById = {};
    for (const p of productList) {
      if (p.id) productById[String(p.id)] = p;
      if (p.id_product) productById[String(p.id_product)] = p;
    }
    // Charger les catégories pour obtenir les noms lisibles
    let categoriesById = {};
    try {
      const cats = await produitsService.getCategories();
      if (Array.isArray(cats)) {
        categoriesById = Object.fromEntries(cats.map(c => [String(c.id), c.name]));
      }
    } catch (errCats) {
      console.warn('Impossible de charger les catégories:', errCats);
    }
    
    // Exclure globalement les commandes annulées pour tous les calculs
    const ordersFiltered = (ordersData || []).filter((o) => !cancelledStateIds.has(Number(o.current_state)));
    const soldMap = buildSoldMap(ordersFiltered);
    const allRows = [];
    const productDetailsCache = {};

    // 1. Construction du tableau des marges globales
    for (const product of productList) {
      const stockManagement = await produitsService.getStockManagementRows(product);
      const productIdStr = String(product.id || product.id_product || '');

      const variantRefs = [
        stockManagement?.productStock,
        ...(Array.isArray(stockManagement?.combinations) ? stockManagement.combinations : [])
      ].filter(Boolean);

      const variantRows = await Promise.all(variantRefs.map(async (variant) => {
        const attributeId = String(variant.id_product_attribute || variant.id || '0').trim() || '0';
        const quantityOrdered = Number(soldMap.get(rowKey(productIdStr, attributeId)) || 0);

        let basePriceHT = Number.parseFloat(product.price) || 0;
        
        if (!basePriceHT) {
          try {
            if (!productDetailsCache[productIdStr]) {
              productDetailsCache[productIdStr] = await produitsService.getProduitById(productIdStr);
            }
            basePriceHT = Number.parseFloat(productDetailsCache[productIdStr]?.price) || basePriceHT;
          } catch (err) {
            // ignore
          }
        }
        
        let combinationPriceImpactHT = 0;
        if (attributeId !== '0') {
          combinationPriceImpactHT = Number.parseFloat(await produitsService.getCombinationPriceImpact(attributeId)) || Number.parseFloat(variant.priceImpact || 0) || 0;
        }

        const saleUnit = basePriceHT + combinationPriceImpactHT;
        const purchaseUnit = getPurchasePriceHT(product);

        return {
          productId: productIdStr,
          productName: product.name || 'Sans nom',
          reference: product.reference || 'Sans référence',
          variantLabel: variant.label || 'Produit principal',
          quantityOrdered,
          basePriceHT,
          combinationPriceImpactHT,
          saleUnit,
          purchaseUnit,
          saleTotal: saleUnit * quantityOrdered,
          purchaseTotal: purchaseUnit * quantityOrdered,
          profit: (saleUnit - purchaseUnit) * quantityOrdered
        };
      }));

      allRows.push(...variantRows);
    }

    // Le regroupement pour la table du haut sera calculé après avoir construit `ordersAll` ci‑dessous
    // (on agrègera les lignes réelles des commandes pour refléter exactement la table du bas).

    // 2. Construction d'ordersAll pour l'affichage des commandes exemples détaillées
    const customersById = Object.fromEntries((customersData || []).map((c) => [String(c.id || c.id_customer || ''), c]));
    
    ordersAll.value = await Promise.all((ordersFiltered || []).map(async (order) => {
      const customer = customersById[String(order.id_customer)] || null;
      const customerName = customer ? `${customer.firstname || ''} ${customer.lastname || ''}`.trim() : '';

      const products = await Promise.all(parseOrderRows(order).map(async (line) => {
        // CORRECTION DE LA RECHERCHE DU PRODUIT PARENT
        let baseProduct = productById[String(line.id_product)] || null;
        
        // Si non trouvé par ID et qu'il y a une déclinaison, on cherche par les déclinaisons du catalogue
        if (!baseProduct && line.id_product_attribute && line.id_product_attribute !== '0') {
          baseProduct = productList.find((p) => {
            return Array.isArray(p.combinations) && p.combinations.some((c) => String(c.id) === String(line.id_product_attribute));
          }) || null;
        }

        // Si le produit n'est toujours pas trouvé, on cherche s'il n'y a pas un produit de la liste dont le nom correspond
        if (!baseProduct && line.name) {
          baseProduct = productList.find((p) => p.name === line.name) || null;
        }

        let baseProductPriceHT = Number.parseFloat(baseProduct?.price) || 0;
        
        // Fallback API pour les produits trouvés mais dont le prix est absent
        try {
          if (!baseProductPriceHT && baseProduct) {
            const pId = String(baseProduct.id || baseProduct.id_product || '');
            if (pId) {
              const cached = productDetailsCache[pId];
              if (cached) {
                baseProductPriceHT = Number.parseFloat(cached.price) || baseProductPriceHT;
              } else {
                const full = await produitsService.getProduitById(pId);
                productDetailsCache[pId] = full;
                baseProductPriceHT = Number.parseFloat(full?.price) || baseProductPriceHT;
              }
            }
          }
        } catch (err) {
          // ignore
        }
        
        let combinationPriceImpactHT = 0;
        if (line.id_product_attribute && line.id_product_attribute !== '0') {
          combinationPriceImpactHT = Number.parseFloat(await produitsService.getCombinationPriceImpact(line.id_product_attribute)) || 0;
        }

        return {
          ...line,
          name: line.name || baseProduct?.name || 'Produit',
          baseProductPriceHT,
          combinationPriceImpactHT,
          unitPriceHT: baseProductPriceHT + combinationPriceImpactHT
        };
      }));

      return {
        ...order,
        customerName: customerName || order.customerName || 'Client inconnu',
        products
      };
    }));

    // ----- Construire la table du haut en agrégeant TOUT le contenu du bas (ordersAll) -----
    try {
      const aggregated = new Map();
      const ordersList = ordersAll.value || [];

      for (const ord of ordersList) {
        for (const line of ord.products || []) {
          const pid = String(localExtractVal(line.id_product || line.id_product || '')).trim();
          if (!pid) continue;

          const prodRef = productById[pid] || {};
          const prodCats = Array.isArray(prodRef.categories) ? prodRef.categories : (prodRef.categories ? [prodRef.categories] : []);
          const catId = String(prodCats[0] || 'uncategorized');

          if (!aggregated.has(catId)) {
            aggregated.set(catId, {
              categoryId: catId,
              productName: categoriesById[catId] || (catId === 'uncategorized' ? 'Non classé' : `Cat ${catId}`),
              reference: '',
              variantLabel: 'Tous produits',
              quantityOrdered: 0,
              basePriceHT: 0,
              combinationPriceImpactHT: 0,
              saleUnit: 0,
              purchaseUnit: 0,
              saleTotal: 0,
              purchaseTotal: 0,
              profit: 0
            });
          }

          const cur = aggregated.get(catId);
          const qty = Number(line.quantity || 0);
          const unit = Number(line.unitPriceHT || (Number(line.baseProductPriceHT || 0) + Number(line.combinationPriceImpactHT || 0)) || 0);

          cur.quantityOrdered += qty;
          cur.saleTotal += unit * qty;

          const purchaseUnit = getPurchasePriceHT(prodRef);
          cur.purchaseUnit = purchaseUnit;
          cur.purchaseTotal += purchaseUnit * qty;

          cur.profit += (unit - purchaseUnit) * qty;
          cur.saleUnit = cur.quantityOrdered ? cur.saleTotal / cur.quantityOrdered : unit;
        }
      }

      rows.value = Array.from(aggregated.values()).sort((a, b) => a.productName.localeCompare(b.productName, 'fr'));
    } catch (errAgg) {
      console.error('Erreur aggregation orders -> top table:', errAgg);
      rows.value = [];
    }

  } catch (e) {
    console.error('Erreur chargement marges produits:', e);
    error.value = 'Impossible de charger les marges produits.';
  } finally {
    loading.value = false;
  }
};

const totals = computed(() => ({
  sale: rows.value.reduce((sum, row) => sum + row.saleTotal, 0),
  purchase: rows.value.reduce((sum, row) => sum + row.purchaseTotal, 0),
  profit: rows.value.reduce((sum, row) => sum + row.profit, 0)
}));

const currency = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR'
}).format(Number(value || 0));

const qty = (value) => Number(value || 0).toLocaleString('fr-FR');

onMounted(loadData);
</script>

<template>
  <div class="margin-overview-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Backend / Produits</p>
        <h1>Marges produits</h1>
        <p class="subtitle">Montant des ventes HT, montant d'achat HT et bénéfice estimé par produit.</p>
      </div>
    </div>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="loading" class="state-box">Chargement des marges produits...</div>

    <div v-else class="table-card">
      <div class="summary-strip">
        <div class="summary-item">
          <span>Lignes de commande</span>
          <strong>{{ qty(rows.length) }}</strong>
        </div>
        <div class="summary-item">
          <span>Ventes HT</span>
          <strong>{{ currency(totals.sale) }}</strong>
        </div>
        <div class="summary-item">
          <span>Achat HT</span>
          <strong>{{ currency(totals.purchase) }}</strong>
        </div>
        <div class="summary-item">
          <span>Bénéfice</span>
          <strong>{{ currency(totals.profit) }}</strong>
        </div>
      </div>

      <div class="table-responsive">
        <table class="modern-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Déclinaison</th>
              <th>Qté commandée</th>
              <th>Ventes HT</th>
              <th>Achat HT</th>
              <th>Bénéfice</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.productId}:${row.variantLabel}`" class="product-row">
              <td>
                <strong>{{ row.productName }}</strong>
                <div class="meta">#{{ row.productId }} · {{ row.reference }}</div>
              </td>
              <td>{{ row.variantLabel }}</td>
              <td>{{ qty(row.quantityOrdered) }}</td>
              <td>{{ currency(row.saleTotal) }}</td>
              <td>{{ currency(row.purchaseTotal) }}</td>
              <td :class="['profit-cell', { positive: row.profit >= 0, negative: row.profit < 0 }]">
                {{ currency(row.profit) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!rows.length" class="state-box">
        Aucun produit disponible.
      </div>
    </div>

    <div class="table-card" style="margin-top:20px">
      <div class="page-header" style="padding:16px">
        <div>
          <h2>Commande exemple</h2>
          <p class="subtitle">Détails des lignes de commandes réelles et calculs des prix unitaires HT combinés</p>
        </div>
      </div>

      <div class="table-responsive" style="padding:16px">
        <div v-for="order in ordersAll" :key="order.id" class="order-sample" style="margin-bottom: 30px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div><strong>#{{ order.reference || order.id }}</strong> · {{ order.customerName }}</div>
            <div style="color:#64748b">{{ new Date(order.date_add).toLocaleDateString('fr-FR') }}</div>
          </div>

          <table class="modern-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Qté</th>
                <th>Prix unité HT</th>
                <th>Total HT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in order.products" :key="idx">
                <td>{{ line.name }}</td>
                <td>{{ qty(line.quantity) }}</td>
                <td>{{ currency(line.unitPriceHT) }}</td>
                <td>{{ currency((line.unitPriceHT || 0) * (line.quantity || 0)) }}</td>
              </tr>
              <tr>
                <td colspan="3" style="text-align:right;font-weight:700">Total HT</td>
                <td style="font-weight:700">
                  {{ currency(order.products.reduce((s, p) => s + ((p.unitPriceHT || 0) * (p.quantity || 0)), 0)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.margin-overview-page {
  padding: 24px;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%);
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: #6b7280;
}

h1 {
  margin: 0;
  font-size: 2rem;
  color: #111827;
}

.subtitle {
  margin: 8px 0 0;
  color: #4b5563;
}

.table-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
}

.summary-item {
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.summary-item span {
  display: block;
  color: #64748b;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.summary-item strong {
  display: block;
  margin-top: 6px;
  font-size: 1.4rem;
  color: #0f172a;
}

.table-responsive {
  overflow-x: auto;
}

.modern-table {
  width: 100%;
  border-collapse: collapse;
}

.modern-table th,
.modern-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #eef2f7;
}

.modern-table th {
  background: #0f172a;
  color: #fff;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.product-row {
  background: #fff;
}

.meta {
  margin-top: 4px;
  font-size: 0.82rem;
  color: #64748b;
}

.profit-cell.positive {
  color: #166534;
  font-weight: 700;
}

.profit-cell.negative {
  color: #b91c1c;
  font-weight: 700;
}

.state-box,
.alert {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 14px;
}

.state-box {
  background: #fff;
  color: #475569;
}

.alert.error {
  background: #fee2e2;
  color: #991b1b;
}

@media (max-width: 960px) {
  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .summary-strip {
    grid-template-columns: 1fr;
  }
}
</style>