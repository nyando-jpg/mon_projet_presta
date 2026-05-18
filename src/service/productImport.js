import { getXml, postXml, putXml } from './api';
import { runResetForTargets } from './resetService';
import { resetTargets } from './resetTargets';

export const rollbackProducts = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des données (Sécurité)...');
  await runResetForTargets(resetTargets, (type, message) => {
    logCallback(type, `Rollback: ${message}`);
  });
  logCallback('info', 'Réinitialisation terminée. L\'import a été annulé.');
};

function normalizeAvailabilityDate(rawValue) {
  if (rawValue == null) return null;

  const value = String(rawValue).trim();
  if (value === '') return null;

  // Accepte DD/MM/YYYY ou DD-MM-YYYY
  let match = value.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  // Accepte YYYY-MM-DD ou YYYY/MM/DD
  match = value.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return null;
}

export const processProductImport = async (data, logCallback) => {
  const categoryCache = {};
  const taxCache = {};

  // ========================================================================
  // NETTOYAGE : FORCER TOUTES LES COLONNES EN MINUSCULES (Ignorer la casse)
  // ========================================================================
  if (data && data.length > 0) {
    data = data.map(row => {
      const newRow = {};
      for (const key in row) {
        newRow[key.trim().toLowerCase()] = row[key];
      }
      return newRow;
    });
  } else {
    logCallback('warn', 'Le fichier CSV des produits est vide.');
    return;
  }

  // ========================================================================
  // SÉCURITÉ 1 : VÉRIFICATION GLOBALE DES COLONNES DU CSV
  // ========================================================================
  // Note : "taxe" est maintenant en minuscules car on a converti les entêtes juste au-dessus
  const expectedColumns = ['date_availability_produit', 'nom', 'reference', 'prix_ttc', 'taxe', 'categorie', 'prix_achat'];
  const actualColumns = Object.keys(data[0]);
  const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));

  if (missingColumns.length > 0) {
    logCallback('error', `CRITIQUE : Colonnes manquantes dans le CSV : ${missingColumns.join(', ')}`);
    logCallback('error', 'Annulation totale de l\'import pour protéger la base de données.');
    return;
  }

  try {
    for (const [index, row] of data.entries()) {
      logCallback('info', `Analyse de la ligne ${index + 1} (${row.nom || 'Inconnu'})...`);

      // ========================================================================
      // SÉCURITÉ 2 : DONNÉES OBLIGATOIRES (Nom et Référence)
      // ========================================================================
      if (!row.nom || String(row.nom).trim() === '' || !row.reference || String(row.reference).trim() === '') {
        logCallback('error', `Ligne ${index + 1} ignorée : Le "nom" ou la "reference" est manquant.`);
        continue;
      }

      // ========================================================================
      // SÉCURITÉ 3 : MONTANTS POSITIFS ET VALIDES (Prix, Taxe, et Prix d'achat)
      // ========================================================================
      const priceRaw = row.prix_ttc ? String(row.prix_ttc).replace(',', '.') : '0';
      const priceTTC = parseFloat(priceRaw);

      if (isNaN(priceTTC) || priceTTC <= 0) {
        logCallback('error', `Ligne ${index + 1} ignorée : Le prix TTC ("${row.prix_ttc}") est invalide, zéro ou négatif.`);
        continue;
      }

      const taxRaw = row.taxe ? String(row.taxe).replace('%', '').replace(',', '.') : '0';
      const taxRate = parseFloat(taxRaw);

      if (isNaN(taxRate) || taxRate < 0) {
        logCallback('error', `Ligne ${index + 1} ignorée : La Taxe ("${row.taxe}") est invalide ou négative.`);
        continue;
      }

      const priceHT = priceTTC / (1 + (taxRate / 100));

      // Traitement du prix d'achat
      const prixAchatRaw = row.prix_achat ? String(row.prix_achat).replace(',', '.') : '0';
      const wholesalePrice = parseFloat(prixAchatRaw);
      const finalWholesalePrice = isNaN(wholesalePrice) || wholesalePrice < 0 ? 0 : wholesalePrice;

      // ========================================================================
      // SÉCURITÉ 4 : DATE (Format strict DD/MM/YYYY)
      // ========================================================================
      const rawDate = row.date_availability_produit;
      let formattedDate = null;

      if (rawDate != null && String(rawDate).trim() !== '') {
        formattedDate = normalizeAvailabilityDate(rawDate);

        if (!formattedDate) {
          logCallback('error', `Ligne ${index + 1} ignorée : La date ("${rawDate}") est invalide. Formats acceptés : DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.`);
          continue;
        }
      } else {
        logCallback('warn', `Ligne ${index + 1} : Aucune date renseignée. La date sera vide par défaut.`);
      }

      // ========================================================================
      // RÉSOLUTION DES TAXES
      // ========================================================================
      let taxRulesGroupId = '0';
      if (taxRate > 0) {
        if (taxCache[taxRate]) {
          taxRulesGroupId = taxCache[taxRate];
        } else {
          const taxRulesResp = await getXml('/tax_rule_groups?display=full');
          const groups = taxRulesResp?.prestashop?.tax_rule_groups?.tax_rule_group;
          if (groups) {
            const groupList = Array.isArray(groups) ? groups : [groups];
            for (const group of groupList) {
              const rulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${group.id}]&display=full`);
              const rules = rulesResp?.prestashop?.tax_rules?.tax_rule;
              if (rules) {
                const ruleList = Array.isArray(rules) ? rules : [rules];
                for (const rule of ruleList) {
                  const taxResp = await getXml(`/taxes/${rule.id_tax}?display=full`);
                  const taxInfo = taxResp?.prestashop?.tax;
                  if (taxInfo && parseFloat(taxInfo.rate) === taxRate) {
                    taxRulesGroupId = group.id;
                    break;
                  }
                }
              }
              if (taxRulesGroupId !== '0') break;
            }
          }
          taxCache[taxRate] = taxRulesGroupId;
        }
      }

      // ========================================================================
      // RÉSOLUTION / CRÉATION DES CATÉGORIES
      // ========================================================================
      let categoryId = '2';
      if (row.categorie) {
        const catName = row.categorie.trim();
        if (categoryCache[catName]) {
          categoryId = categoryCache[catName];
        } else {
          try {
            const catResp = await getXml(`/categories?filter[name]=[${catName}]&display=full`);
            const categories = catResp?.prestashop?.categories?.category;

            if (categories) {
              categoryId = Array.isArray(categories) ? categories[0].id : categories.id;
            } else {
              logCallback('info', `Création de la nouvelle catégorie "${catName}"...`);
              const newCatPayload = {
                prestashop: {
                  category: {
                    id_parent: 2,
                    active: 1,
                    name: {
                      language: {
                        '@_id': '1',
                        '#text': catName
                      }
                    },
                    link_rewrite: {
                      language: {
                        '@_id': '1',
                        '#text': catName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                      }
                    }
                  }
                }
              };

              const createdCatResp = await postXml('/categories', newCatPayload);
              if (createdCatResp?.prestashop?.category?.id) {
                categoryId = createdCatResp.prestashop.category.id;
                logCallback('success', `Catégorie "${catName}" créée avec l'ID ${categoryId}.`);
              } else {
                throw new Error("Échec de la création de la catégorie.");
              }
            }
            categoryCache[catName] = categoryId;
          } catch (catError) {
            logCallback('error', `Erreur avec la catégorie "${catName}".`);
            throw catError;
          }
        }
      }

      // ========================================================================
      // CRÉATION DU PRODUIT
      // ========================================================================
      const productPayload = {
        prestashop: {
          product: {
            state: 1,
            active: 1,
            reference: row.reference,
            price: priceHT.toFixed(6),
            wholesale_price: finalWholesalePrice.toFixed(6),
            id_tax_rules_group: taxRulesGroupId,
            id_category_default: categoryId,
            ...(formattedDate ? { available_date: formattedDate } : {}),
            name: {
              language: {
                '@_id': '1',
                '#text': row.nom
              }
            },
            link_rewrite: {
              language: {
                '@_id': '1',
                '#text': row.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')
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

      const newProductResp = await postXml('/products', productPayload);
      const productId = newProductResp?.prestashop?.product?.id;

      // ========================================================================
      // CRÉATION DU STOCK INITIAL POUR LE PRODUIT
      // ========================================================================
      if (productId) {
        try {
          const stockPayload = {
            prestashop: {
              stock_available: {
                id_product: productId,
                id_product_attribute: 0,
                id_shop: 1,
                id_shop_group: 0,
                quantity: 0,
                depends_on_stock: 0,
                out_of_stock: 2
              }
            }
          };

          await postXml('/stock_availables', stockPayload);
          logCallback('info', `Stock initial créé pour le produit ${productId} (quantité 0).`);
        } catch (stockError) {
          logCallback('warn', `Impossible de créer le stock initial pour le produit ${productId}: ${stockError.message}`);
        }
      }

      // ========================================================================
      // FORÇAGE DE LA DATE DE DISPONIBILITÉ
      // ========================================================================
      if (productId && formattedDate) {
        logCallback('info', `Mise à jour de la date de disponibilité vers ${formattedDate}...`);
        try {
          const productToUpdate = await getXml(`/products/${productId}`);

          if (productToUpdate && productToUpdate.prestashop && productToUpdate.prestashop.product) {
            productToUpdate.prestashop.product.available_date = formattedDate;

            // NETTOYAGE VITAL : Empêche le crash (Erreur XML 127) de l'API lors du PUT
            delete productToUpdate.prestashop.product.manufacturer_name;
            delete productToUpdate.prestashop.product.quantity;
            delete productToUpdate.prestashop.product.id_default_image;
            delete productToUpdate.prestashop.product.id_default_combination;
            delete productToUpdate.prestashop.product.position_in_category;
            delete productToUpdate.prestashop.product.type;

            await putXml(`/products/${productId}`, productToUpdate);
            logCallback('success', `Date de disponibilité mise à jour avec succès !`);
          }
        } catch (dateError) {
          logCallback('error', `Échec du PUT pour la date : ${dateError.message}`);
        }
      }

      logCallback('success', `Ligne ${index + 1} (${row.nom}) importée avec succès.`);
    }

    logCallback('success', 'Import des produits terminé avec succès !');
  } catch (error) {
    logCallback('error', `Erreur lors de l'import : ${error.message}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    await rollbackProducts(logCallback);
  }
};