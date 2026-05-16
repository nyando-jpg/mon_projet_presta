import { getXml, postXml, putXml } from '@/service/api';
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';

export const resetDeclinaisonTargets = [
  {
    key: 'combinations',
    label: 'Combinaisons (Déclinaisons)',
    endpoint: '/combinations',
    collectionKey: 'combinations',
    itemKey: 'combination',
    skipIds: []
  },
  {
    key: 'product_option_values',
    label: 'Valeurs d\'attributs',
    endpoint: '/product_option_values',
    collectionKey: 'product_option_values',
    itemKey: 'product_option_value',
    skipIds: []
  },
  {
    key: 'product_options',
    label: 'Groupes d\'attributs',
    endpoint: '/product_options',
    collectionKey: 'product_options',
    itemKey: 'product_option',
    skipIds: []
  }
];

export const rollbackDeclinaison = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des déclinaisons (Sécurité)...');
  await runResetForTargets(resetDeclinaisonTargets, (type, message) => {
    logCallback(type, `Rollback Déclinaison: ${message}`);
  });
  logCallback('info', 'Réinitialisation des déclinaisons terminée. L\'import a été annulé.');
};

export const rollbackProducts = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des données (Sécurité)...');
  await runResetForTargets(resetTargets, (type, message) => {
    logCallback(type, `Rollback: ${message}`);
  });
  logCallback('info', 'Réinitialisation terminée. L\'import a été annulé.');
};

export const processVariantImport = async (data, logCallback) => {
  const optionGroupCache = {};
  const optionValueCache = {};
  const parentProductCache = {};
  const taxRateCache = {};

  try {
    for (const [index, row] of data.entries()) {
      logCallback('info', `Importation de la ligne ${index + 1} (Ref: ${row.reference || '?'})...`);
      
      const reference = row.reference?.trim();
      const specificite = row.specificité?.trim();
      const karazany = row.karazany?.trim();
      const stockInitialRaw = row.stock_initial || '0';
      const stockInitial = parseInt(stockInitialRaw, 10);
      
      if (!reference || !specificite || !karazany) {
        logCallback('error', `Ligne ${index + 1} ignorée : données incomplètes.`);
        continue;
      }

      // 1. Trouver le produit parent
      let parentProductId = null;
      let parentProductPrice = 0;
      let parentTaxGroupId = null;

      if (parentProductCache[reference]) {
        parentProductId = parentProductCache[reference].id;
        parentProductPrice = parentProductCache[reference].price;
        parentTaxGroupId = parentProductCache[reference].taxGroupId;
      } else {
        const prodResp = await getXml(`/products?filter[reference]=[${encodeURIComponent(reference)}]&display=[id,price,id_tax_rules_group]`);
        if (prodResp && prodResp.prestashop && prodResp.prestashop.products && prodResp.prestashop.products.product) {
           let prods = prodResp.prestashop.products.product;
           if (!Array.isArray(prods)) prods = [prods];
           parentProductId = prods[0].id;
           parentProductPrice = parseFloat(prods[0].price || 0);
           const taxGroupIdNode = prods[0].id_tax_rules_group;
           let extractedTaxGroupId = (typeof taxGroupIdNode === 'object' && taxGroupIdNode !== null) ? taxGroupIdNode['#text'] : taxGroupIdNode;
           if (!extractedTaxGroupId) extractedTaxGroupId = '0';
           parentTaxGroupId = extractedTaxGroupId;
           parentProductCache[reference] = { id: parentProductId, price: parentProductPrice, taxGroupId: parentTaxGroupId };
        } else {
           logCallback('error', `Produit parent introuvable pour la référence ${reference}.`);
           continue;
        }
      }

      let taxRate = 0;
      if (parentTaxGroupId && taxRateCache[parentTaxGroupId]) {
        taxRate = taxRateCache[parentTaxGroupId];
      } else if (parentTaxGroupId && parentTaxGroupId !== '0') {
        logCallback('info', `Recherche du taux de taxe pour le groupe ${parentTaxGroupId}...`);
        try {
          const taxRulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${parentTaxGroupId}]&display=[id,id_tax]`);
          if (taxRulesResp && taxRulesResp.prestashop && taxRulesResp.prestashop.tax_rules && taxRulesResp.prestashop.tax_rules.tax_rule) {
            const rules = Array.isArray(taxRulesResp.prestashop.tax_rules.tax_rule) ? taxRulesResp.prestashop.tax_rules.tax_rule : [taxRulesResp.prestashop.tax_rules.tax_rule];
            if (rules.length > 0) {
              const taxId = rules[0].id_tax;
              const taxResp = await getXml(`/taxes/${taxId}?display=[rate]`);
              if (taxResp && taxResp.prestashop && taxResp.prestashop.tax) {
                const rate = parseFloat(taxResp.prestashop.tax.rate);
                taxRate = rate;
                taxRateCache[parentTaxGroupId] = rate;
                logCallback('info', `Taux de taxe trouvé: ${rate}%`);
              }
            }
          }
        } catch (e) {
          logCallback('error', `Impossible de récupérer le taux de taxe pour le groupe ${parentTaxGroupId}: ${e.message}`);
        }
      }

      const priceRaw = row.prix_vente_ttc ? row.prix_vente_ttc.replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw) || 0;
      const priceHT = priceTTC > 0 ? priceTTC / (1 + (taxRate / 100)) : 0;

      // Calcul de l'impact de prix (impact sur le prix HT)
      let priceImpact = priceHT > 0 ? (priceHT - parentProductPrice) : 0;

      // 2. Trouver ou créer le groupe d'attributs (product_options)
      let optionGroupId = null;
      const optGroupKey = specificite.toLowerCase();
      if (optionGroupCache[optGroupKey]) {
        optionGroupId = optionGroupCache[optGroupKey];
      } else {
        const optGrpResp = await getXml(`/product_options?filter[name]=[${encodeURIComponent(specificite)}]&display=[id]`);
        if (optGrpResp && optGrpResp.prestashop && optGrpResp.prestashop.product_options && optGrpResp.prestashop.product_options.product_option) {
           let grps = optGrpResp.prestashop.product_options.product_option;
           if (!Array.isArray(grps)) grps = [grps];
           optionGroupId = grps[0].id;
        } else {
           logCallback('info', `Création du groupe d'attributs "${specificite}"...`);
           const optGrpPayload = {
             prestashop: {
               product_option: {
                 is_color_group: 0,
                 group_type: 'select',
                 name: { language: { '@_id': '1', '#text': specificite } },
                 public_name: { language: { '@_id': '1', '#text': specificite } }
               }
             }
           };
           const createGrpResp = await postXml('/product_options', optGrpPayload);
           optionGroupId = createGrpResp.prestashop.product_option.id;
        }
        optionGroupCache[optGroupKey] = optionGroupId;
      }

      // 3. Trouver ou créer la valeur d'attribut (product_option_values)
      let optionValueId = null;
      const optValKey = `${optionGroupId}_${karazany.toLowerCase()}`;
      if (optionValueCache[optValKey]) {
        optionValueId = optionValueCache[optValKey];
      } else {
        const optValResp = await getXml(`/product_option_values?filter[id_attribute_group]=[${optionGroupId}]&filter[name]=[${encodeURIComponent(karazany)}]&display=[id]`);
        if (optValResp && optValResp.prestashop && optValResp.prestashop.product_option_values && optValResp.prestashop.product_option_values.product_option_value) {
           let vals = optValResp.prestashop.product_option_values.product_option_value;
           if (!Array.isArray(vals)) vals = [vals];
           optionValueId = vals[0].id;
        } else {
           logCallback('info', `Création de la valeur d'attribut "${karazany}"...`);
           const optValPayload = {
             prestashop: {
               product_option_value: {
                 id_attribute_group: optionGroupId,
                 name: { language: { '@_id': '1', '#text': karazany } }
               }
             }
           };
           const createValResp = await postXml('/product_option_values', optValPayload);
           optionValueId = createValResp.prestashop.product_option_value.id;
        }
        optionValueCache[optValKey] = optionValueId;
      }

      // 4. Créer la déclinaison (combination)
      logCallback('info', `Création de la déclinaison pour le produit ${reference}...`);
      // La quantité de stock est maintenant incluse directement ici
      const combinationPayload = {
        prestashop: {
          combination: {
            id_product: parentProductId,
            reference: `${reference}_${karazany}`,
            price: priceImpact.toFixed(6),
            minimal_quantity: 1,
            quantity: stockInitial, // <-- Le stock est ajouté ici
            associations: {
              product_option_values: {
                product_option_value: [{
                  id: optionValueId
                }]
              }
            }
          }
        }
      };
      
      const createCombResp = await postXml('/combinations', combinationPayload);
      // La ligne ci-dessous n'est plus nécessaire car la quantité est déjà définie
      // const combinationId = createCombResp.prestashop.combination.id;

      // 5. Mettre à jour le stock (stock_availables)
      // TOUT LE BLOC SUIVANT A ÉTÉ SUPPRIMÉ, CAR IL EST MAINTENANT INUTILE ET CAUSAIT L'ERREUR 500 ❌
      /*
      if (stockInitial > 0) {
        logCallback('info', `Mise à jour du stock pour la déclinaison (${stockInitial})...`);
        const stockResp = await getXml(`/stock_availables?filter[id_product]=[${parentProductId}]&filter[id_product_attribute]=[${combinationId}]&display=[id,id_product,id_product_attribute,id_shop,id_shop_group,depends_on_stock,out_of_stock]`);
        
        if (stockResp && stockResp.prestashop && stockResp.prestashop.stock_availables && stockResp.prestashop.stock_availables.stock_available) {
           let stocks = stockResp.prestashop.stock_availables.stock_available;
           if (!Array.isArray(stocks)) stocks = [stocks];
           const stockAvailable = stocks[0];
           
           const stockPayload = {
             prestashop: {
               stock_available: {
                 id: stockAvailable.id,
                 id_product: stockAvailable.id_product,
                 id_product_attribute: stockAvailable.id_product_attribute,
                 id_shop: stockAvailable.id_shop,
                 id_shop_group: stockAvailable.id_shop_group,
                 quantity: stockInitial,
                 depends_on_stock: stockAvailable.depends_on_stock || 0,
                 out_of_stock: stockAvailable.out_of_stock || 2
               }
             }
};

           await putXml('/stock_availables', stockPayload);
        }
      }
      */

      logCallback('success', `Ligne ${index + 1} (${karazany}) importée avec succès.`);
    }
    
    logCallback('success', 'Import des variations terminé avec succès !');
  } catch (error) {
    const apiError = error.response?.data || error.message;
    logCallback('error', `Erreur lors de l'import des variations : ${error.message}`);
    logCallback('error', `Détails de l'API : ${apiError}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackDeclinaison(logCallback);
  }
};

export const processImport = async (data, logCallback) => {
  const categoryCache = {};
  const taxCache = {};

  try {
    for (const [index, row] of data.entries()) {
      logCallback('info', `Importation de la ligne ${index + 1} (${row.nom || 'Sans nom'})...`);
      
      // Calculate Price HT
      const priceRaw = row.prix_ttc ? row.prix_ttc.replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw) || 0;
      
      const taxRaw = row.Taxe ? row.Taxe.replace('%', '').replace(',', '.') : '0';
      const taxRate = parseFloat(taxRaw) || 0;
      
      const priceHT = priceTTC / (1 + (taxRate / 100));

      // Resolve Tax Rules Group
      let taxRulesGroupId = 0; // Default to no tax
      if (taxRate > 0) {
        const taxName = `TVA ${taxRate}`;
        if (taxCache[taxName]) {
          taxRulesGroupId = taxCache[taxName];
        } else {
          logCallback('info', `Recherche de la règle de taxe "${taxName}"...`);
          try {
            const searchResp = await getXml(`/tax_rule_groups?filter[name]=[${encodeURIComponent(taxName)}]&display=[id,name]`);
            let foundId = null;
            if (searchResp && searchResp.prestashop && searchResp.prestashop.tax_rule_groups && searchResp.prestashop.tax_rule_groups.tax_rule_group) {
              let groups = searchResp.prestashop.tax_rule_groups.tax_rule_group;
              if (!Array.isArray(groups)) groups = [groups];
              foundId = groups[0].id;
            }

            if (foundId) {
              taxRulesGroupId = foundId;
              taxCache[taxName] = taxRulesGroupId;
            } else {
              logCallback('info', `Création de la règle de taxe "${taxName}"...`);
              
              // 1. Create Tax
              const taxPayload = { prestashop: { tax: { rate: taxRate, active: 1, name: { language: { '@_id': '1', '#text': taxName } } } } };
              const taxResp = await postXml('/taxes', taxPayload);
              const taxId = taxResp.prestashop.tax.id;

              // 2. Create Tax Rules Group
              const groupPayload = { prestashop: { tax_rule_group: { name: taxName, active: 1 } } };
              const groupResp = await postXml('/tax_rule_groups', groupPayload);
              taxRulesGroupId = groupResp.prestashop.tax_rule_group.id;
              
              // 3. Create Tax Rule
              const rulePayload = { prestashop: { tax_rule: { id_tax_rules_group: taxRulesGroupId, id_country: 8, id_tax: taxId, behavior: 0 } } };
              await postXml('/tax_rules', rulePayload);
              
              taxCache[taxName] = taxRulesGroupId;
              logCallback('success', `Règle de taxe "${taxName}" créée avec l'ID ${taxRulesGroupId}.`);
            }
          } catch (taxError) {
             logCallback('error', `Erreur avec la taxe "${taxName}".`);
             throw taxError;
          }
        }
      }
      
      // Resolve Category
      let categoryId = 2; // Default to Accueil
      if (row.categorie) {
        const catName = row.categorie.trim();
        const catNameLower = catName.toLowerCase();
        
        if (categoryCache[catNameLower]) {
          categoryId = categoryCache[catNameLower];
        } else {
          logCallback('info', `Recherche de la catégorie "${catName}"...`);
          try {
            const searchResp = await getXml(`/categories?filter[name]=[${encodeURIComponent(catName)}]&display=[id,name]`);
            let foundId = null;
            
            if (searchResp && searchResp.prestashop && searchResp.prestashop.categories && searchResp.prestashop.categories.category) {
               let cats = searchResp.prestashop.categories.category;
               if (!Array.isArray(cats)) cats = [cats];
               foundId = cats[0].id;
            }
            
            if (foundId) {
              categoryId = foundId;
              categoryCache[catNameLower] = categoryId;
            } else {
              logCallback('info', `Création de la catégorie "${catName}"...`);
              const catPayload = {
                prestashop: {
                  category: {
                    active: 1,
                    id_parent: 2,
                    name: {
                      language: { '@_id': '1', '#text': catName }
                    },
                    link_rewrite: {
                      language: { '@_id': '1', '#text': catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
                    }
                  }
                }
              };
              const createResp = await postXml('/categories', catPayload);
              if (createResp && createResp.prestashop && createResp.prestashop.category) {
                categoryId = createResp.prestashop.category.id;
                categoryCache[catNameLower] = categoryId;
                logCallback('success', `Catégorie "${catName}" créée avec l'ID ${categoryId}.`);
              }
            }
          } catch (catError) {
             logCallback('error', `Erreur avec la catégorie "${catName}".`);
             throw catError;
          }
        }
      }
      
      const productPayload = {
        prestashop: {
          product: {
            state: 1,
            active: 1,
            reference: row.reference || '',
            price: priceHT.toFixed(6),
            id_tax_rules_group: taxRulesGroupId,
            id_category_default: categoryId,
            name: {
              language: {
                '@_id': '1',
                '#text': row.nom || 'Produit sans nom'
              }
            },
            link_rewrite: {
              language: {
                '@_id': '1',
                '#text': (row.nom || 'produit').toLowerCase().replace(/[^a-z0-9]+/g, '-')
              }
            },
            associations: {
              categories: {
                category: {
                  id: categoryId
                }
              }
            }
          }
        }
      };

      await postXml('/products', productPayload);
      logCallback('success', `Ligne ${index + 1} (${row.nom}) importée avec succès.`);
    }
    
    logCallback('success', 'Import des produits terminé avec succès !');
  } catch (error) {
    logCallback('error', `Erreur lors de l'import : ${error.message}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackProducts(logCallback);
  }
};

