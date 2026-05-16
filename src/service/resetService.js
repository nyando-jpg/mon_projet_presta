import { deleteXml, getXml } from '@/service/api';

export function getCollectionItems(payload, target) {
  if (!payload || !payload.prestashop || !payload.prestashop[target.collectionKey]) {
    return [];
  }

  const collection = payload.prestashop[target.collectionKey][target.itemKey];

  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection) {
    return [collection];
  }

  return [];
}

export function extractItemId(item) {
  if (!item) {
    return null;
  }

  if (item['@_id']) {
    return item['@_id'];
  }

  if (item.id) {
    return item.id;
  }

  if (item['@id']) {
    return item['@id'];
  }

  return null;
}

export async function fetchIdsForTarget(target) {
  const pageSize = 100;
  const uniqueIds = new Set();
  let page = 1;

  while (true) {
    const payload = await getXml(`${target.endpoint}?display=[id]&limit=${pageSize}&page=${page}`);
    const items = getCollectionItems(payload, target);

    if (!items.length) {
      break;
    }

    items.forEach((item) => {
      const itemId = extractItemId(item);
      if (itemId != null && !target.skipIds.includes(Number(itemId))) {
        uniqueIds.add(String(itemId));
      }
    });

    if (items.length < pageSize) {
      break;
    }

    page += 1;
  }

  return [...uniqueIds];
}

export async function resetTarget(target, logCallback = () => {}) {
  const ids = await fetchIdsForTarget(target);

  if (!ids.length) {
    logCallback('success', `${target.label}: aucune ligne a supprimer.`);
    return;
  }

  logCallback('info', `${target.label}: ${ids.length} element(s) a supprimer.`);

  for (const id of ids) {
    try {
      await deleteXml(`${target.endpoint}/${id}`);
      logCallback('success', `${target.label}: suppression de l'identifiant ${id}.`);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        logCallback('info', `${target.label}: l'identifiant ${id} est deja supprime.`);
      } else {
        throw e;
      }
    }
  }
}

export async function runResetForTargets(targets, logCallback = () => {}) {
  for (const target of targets) {
    try {
      await resetTarget(target, logCallback);
    } catch (error) {
      logCallback('error', `${target.label}: ${error?.message ?? 'erreur inconnue'}.`);
    }
  }
}
