import { getXml, postXml, putXml, formatApiError } from './api';
import { runResetForTargets } from './resetService';
import { resetTargets } from './resetTargets';

export const rollbackProducts = async (logCallback) => {
  logCallback('info', 'Lancement de la réinitialisation des données (Sécurité)...');
  await runResetForTargets(resetTargets, (type, message) => {
    logCallback(type, `Rollback: ${message}`);
  });
  logCallback('info', 'Réinitialisation terminée. L\'import a été annulé.');
};

function extractText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return String(value['#text'] ?? value['@_id'] ?? value.id ?? '');
  return '';
}

let defaultCountryIdCache = null;

async function getDefaultCountryId() {
  if (defaultCountryIdCache) return defaultCountryIdCache;
  try {
    const configResp = await getXml('/configurations?filter[name]=[PS_COUNTRY_DEFAULT]&display=full');
    const config = configResp?.prestashop?.configurations?.configuration;
    const first = Array.isArray(config) ? config[0] : config;
    const val = extractText(first?.value);
    defaultCountryIdCache = val || '0';
  } catch (e) {
    defaultCountryIdCache = '0';
  }
  return defaultCountryIdCache;
}

async function createTaxAndGroup(taxRate, logCallback) {
  const countryId = await getDefaultCountryId();

  const taxPayload = {
    prestashop: {
      tax: {
        active: 1,
        rate: Number(taxRate).toFixed(2),
        name: {
          language: {
            '@_id': '1',
            '#text': `Auto ${Number(taxRate).toFixed(2)}%`
          }
        }
      }
    }
  };

  const taxResp = await postXml('/taxes', taxPayload);
  const taxId = extractText(taxResp?.prestashop?.tax?.id);
  if (!taxId) {
    throw new Error(`Impossible de creer la taxe ${taxRate}%`);
  }

  const groupPayload = {
    prestashop: {
      tax_rule_group: {
        name: `Auto ${Number(taxRate).toFixed(2)}%`,
        active: 1
      }
    }
  };

  const groupResp = await postXml('/tax_rule_groups', groupPayload);
  const groupId = extractText(groupResp?.prestashop?.tax_rule_group?.id);
  if (!groupId) {
    throw new Error(`Impossible de creer le groupe de taxe ${taxRate}%`);
  }

  const rulePayload = {
    prestashop: {
      tax_rule: {
        id_tax_rules_group: groupId,
        id_country: countryId || '0',
        id_state: 0,
        zipcode_from: 0,
        zipcode_to: 0,
        behavior: 0,
        description: `Auto ${Number(taxRate).toFixed(2)}%`,
        id_tax: taxId
      }
    }
  };

  await postXml('/tax_rules', rulePayload);
  if (logCallback) {
    logCallback('success', `Groupe de taxe cree pour ${taxRate}% (id ${groupId}).`);
  }
  return groupId;
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

      if (rawDate && rawDate.trim() !== '') {
        const trimmedDate = rawDate.trim();
        const dateRegexDmy = /^\d{2}\/\d{2}\/\d{4}$/;

        if (!dateRegexDmy.test(trimmedDate)) {
          throw new Error(`La date ("${rawDate}") ne respecte pas le format strict DD/MM/YYYY.`);
        }

        const parts = trimmedDate.split('/');
        formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
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
              const groupId = extractText(group.id);
              if (!groupId) continue;
              const rulesResp = await getXml(`/tax_rules?filter[id_tax_rules_group]=[${groupId}]&display=full`);
              const rules = rulesResp?.prestashop?.tax_rules?.tax_rule;
              if (rules) {
                const ruleList = Array.isArray(rules) ? rules : [rules];
                for (const rule of ruleList) {
                  const taxId = extractText(rule.id_tax);
                  if (!taxId) continue;
                  const taxResp = await getXml(`/taxes/${taxId}?display=full`);
                  const taxInfo = taxResp?.prestashop?.tax;
                  const apiRate = taxInfo ? parseFloat(extractText(taxInfo.rate)) : NaN;
                  if (Number.isFinite(apiRate) && Math.abs(apiRate - taxRate) < 0.001) {
                    taxRulesGroupId = groupId;
                    break;
                  }
                }
              }
              if (taxRulesGroupId !== '0') break;
            }
          }
          if (taxRulesGroupId === '0') {
            logCallback('warn', `Aucun groupe de taxe trouve pour le taux ${taxRate}%. Produit ${row.reference}. Creation automatique...`);
            try {
              taxRulesGroupId = await createTaxAndGroup(taxRate, logCallback);
            } catch (createError) {
              console.error(`Echec creation groupe taxe ${taxRate}%:`, createError);
              logCallback('error', `Echec creation groupe taxe ${taxRate}%: ${formatApiError(createError)}`);
              taxRulesGroupId = '0';
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
            console.error(`Erreur avec la catégorie "${catName}":`, catError);
            logCallback('error', `Erreur avec la catégorie "${catName}" : ${formatApiError(catError)}`);
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
          console.error(`Échec du PUT pour la date du produit ${productId}:`, dateError);
          logCallback('error', `Échec du PUT pour la date : ${formatApiError(dateError)}`);
        }
      }

      logCallback('success', `Ligne ${index + 1} (${row.nom}) importée avec succès.`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logCallback('success', 'Import des produits terminé avec succès !');
  } catch (error) {
    console.error('Erreur lors de l\'import des produits:', error);
    logCallback('error', `Erreur lors de l'import : ${formatApiError(error)}`);
    logCallback('error', 'Annulation de l\'opération et lancement de la réinitialisation (Rollback)...');
    try {
      await rollbackProducts(logCallback);
    } catch (rollbackErr) {
      console.error('Échec du rollback des produits:', rollbackErr);
      logCallback('error', `Échec du rollback : ${formatApiError(rollbackErr)}`);
    }
  }
};