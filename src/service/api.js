import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';


const WS_KEY = 's2ijjJ0QhGCniJ887IKfr1zgWPUp4y55';
const BASE_URL = import.meta.env.VITE_PRESTASHOP_API_BASE_URL || '/prestashop_edition_classic_version_8.2.6_test/api';

const apiKey = 's2ijjJ0QhGCniJ887IKfr1zgWPUp4y55';
const basicAuthHeader = `Basic ${btoa(`${apiKey}:`)}`;

export const api = axios.create({
  // Utilise l'URL exacte qui fonctionne
  baseURL: BASE_URL,
  params: {
    ws_key: apiKey,
    output_format: 'JSON'
  }
});

const rawApi = axios.create({
  baseURL: BASE_URL,
  params: {
    ws_key: apiKey
  }
});

const rawApiNoAuth = axios.create({
  baseURL: BASE_URL
});

const rawNoBaseAuth = axios.create({
  params: {
    ws_key: apiKey
  }
});

const rawNoBaseNoAuth = axios.create();

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true
});

function isXmlString(value) {
  return typeof value === 'string' && value.trim().startsWith('<');
}

function parseXmlSafe(xml) {
  try {
    return xmlParser.parse(xml);
  } catch (error) {
    return xml;
  }
}

function parseResponseData(data) {
  return isXmlString(data) ? parseXmlSafe(data) : data;
}


function readNodeValue(node) {
  if (node == null) return '';
  if (typeof node === 'object') {
    if ('#text' in node) return String(node['#text']);
    if ('@_id' in node) return String(node['@_id']);
    if ('id' in node) return readNodeValue(node.id);
    return '';
  }
  return String(node);
}

function normalizeStockAvailablePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const stock = payload?.prestashop?.stock_available;
  if (!stock || typeof stock !== 'object') return payload;

  const normalized = {
    id: readNodeValue(stock.id),
    id_product: readNodeValue(stock.id_product),
    id_product_attribute: readNodeValue(stock.id_product_attribute),
    id_shop: readNodeValue(stock.id_shop),
    id_shop_group: readNodeValue(stock.id_shop_group),
    quantity: readNodeValue(stock.quantity) || '0',
    depends_on_stock: readNodeValue(stock.depends_on_stock) || '0',
    out_of_stock: readNodeValue(stock.out_of_stock) || '2'
  };

  // If required identifiers are missing, keep caller payload untouched.
  if (!normalized.id || !normalized.id_product) {
    return payload;
  }

  return {
    prestashop: {
      stock_available: normalized
    }
  };
}

export function parsePrestaXml(xmlString) {
  return xmlParser.parse(xmlString);
}

export function buildPrestaXml(payload) {
  return typeof payload === 'string' ? payload : xmlBuilder.build(payload);
}

function withXmlDefaults(config = {}) {
  const { skipXmlDefaults, skipAuth, skipBaseUrl, skipApiParams, ...rest } = config;

  return {
    ...rest,
    responseType: rest.responseType || 'text',
    params: {
      ...(skipXmlDefaults ? {} : { output_format: 'XML' }),
      ...(rest.params || {})
    },
    headers: {
      ...(skipXmlDefaults ? {} : { Accept: 'application/xml' }),
      ...(rest.headers || {})
    }
  };
}

function getClient(config = {}) {
  const { skipBaseUrl, skipAuth, skipApiParams } = config;

  if (skipBaseUrl && skipAuth) return rawNoBaseNoAuth;
  if (skipBaseUrl) return rawNoBaseAuth;
  if (skipAuth) return rawApiNoAuth;
  if (skipApiParams) return rawApi;
  return api;
}

export async function getXml(url, config) {
  const client = getClient(config);
  const response = await client.get(url, withXmlDefaults(config));
  const parsed = parseResponseData(response.data);

  if (parsed && typeof parsed === 'object' && parsed.prestashop) {
    const p = parsed.prestashop;
    const productsNode = p.products;

    if (productsNode === '' || productsNode === null) {
      p.products = { product: [] };
    }
    else if (typeof productsNode === 'object') {
      // empty object -> no products
      if (Object.keys(productsNode).length === 0) {
        p.products = { product: [] };
      }
      else if (!('product' in productsNode)) {
        // If productsNode itself is an array of products (rare), wrap it
        if (Array.isArray(productsNode)) {
          p.products = { product: productsNode };
        }
      }
      else {
        // Ensure single product object becomes an array
        if (productsNode.product && !Array.isArray(productsNode.product)) {
          productsNode.product = [productsNode.product];
        }
      }
    }
  }

  return parsed;
}

export const postXml = async (url, payload, config) => {
  const body = buildPrestaXml(payload);
  const client = getClient(config);
  const response = await client.post(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
};

export async function putXml(url, payload, config) {
  const normalizedPayload = url.includes('/stock_availables')
    ? normalizeStockAvailablePayload(payload)
    : payload;
  const body = buildPrestaXml(normalizedPayload);
  const client = getClient(config);
  const response = await client.put(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',

      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
}

export async function deleteXml(url, config) {
  const client = getClient(config);
  const response = await client.delete(url, withXmlDefaults(config));
  return parseResponseData(response.data);
}

export async function getImage(url) {
  console.log("image", url);
  try {
    // Use the raw client so we do not append output_format on binary image endpoints.
    const response = await rawApi.get(url, {
      responseType: 'blob',
      headers: {
        Accept: 'image/*'
      }
    });
    return URL.createObjectURL(response.data);
    
  } catch (error) {
    return null;
  }
}

export async function postImage(url, imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    responseType: 'text'
  });
  return parseResponseData(response.data);
}

export async function getPrestaShopConfig(name) {
  const response = await getXml(`/configurations?display=full&filter[name]=[${name}]`);
  const config = response?.prestashop?.configurations?.configuration;
  return Array.isArray(config) ? config[0] : config;
}

export function formatApiError(error) {
  if (!error) return 'Erreur inconnue';

  let msg = error.message || String(error);

  // Extraire les infos de la requête Axios
  if (error.config) {
    const method = error.config.method ? error.config.method.toUpperCase() : '';
    let url = error.config.url || '';
    // Sécurité : masquer la clé API ws_key
    url = url.replace(/ws_key=[^&]*/gi, 'ws_key=***');
    msg += ` [API ${method} ${url}]`;

    if (error.config.params && Object.keys(error.config.params).length > 0) {
      const safeParams = { ...error.config.params };
      if (safeParams.ws_key) {
        safeParams.ws_key = '***';
      }
      msg += ` params: ${JSON.stringify(safeParams)}`;
    }

    if (error.config.data) {
      const payloadStr = typeof error.config.data === 'object' ? JSON.stringify(error.config.data) : String(error.config.data);
      const cleanPayload = payloadStr.replace(/\s+/g, ' ').trim();
      msg += ` | Payload : ${cleanPayload.substring(0, 300)}${cleanPayload.length > 300 ? '...' : ''}`;
    }
  }

  // Détails de la réponse de l'API
  if (error.response) {
    msg += ` | Statut : ${error.response.status}`;
    if (error.response.data) {
      const data = error.response.data;
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);

      // XML PrestaShop
      if (dataStr.includes('<error>') || dataStr.includes('<message>')) {
        const matches = [...dataStr.matchAll(/<message[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/message>/gi)];
        if (matches.length > 0) {
          const apiMsgs = matches.map(m => m[1].trim()).join(', ');
          msg += ` | Détail API : ${apiMsgs}`;
        } else {
          const matchesNoCdata = [...dataStr.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/gi)];
          if (matchesNoCdata.length > 0) {
            const apiMsgs = matchesNoCdata.map(m => m[1].trim()).join(', ');
            msg += ` | Détail API : ${apiMsgs}`;
          } else {
            msg += ` | XML : ${dataStr.replace(/\s+/g, ' ').substring(0, 300)}`;
          }
        }
      }
      // HTML (erreurs Apache/PHP)
      else if (dataStr.includes('<!DOCTYPE') || dataStr.includes('<html')) {
        const titleMatch = dataStr.match(/<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        let phpError = '';
        if (dataStr.includes('Fatal error') || dataStr.includes('Parse error') || dataStr.includes('Warning:')) {
          const bodyText = dataStr.replace(/<[^>]*>/g, ' ');
          const phpMatch = bodyText.match(/(?:Fatal error|Parse error|Warning|Notice):[^.]*/i);
          if (phpMatch) {
            phpError = phpMatch[0].trim().replace(/\s+/g, ' ');
          }
        }

        if (title || phpError) {
          msg += ` | Page HTML (${title || 'Sans titre'}) ${phpError ? `| PHP : ${phpError}` : ''}`;
        } else {
          const stripped = dataStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          msg += ` | HTML : ${stripped.substring(0, 200)}...`;
        }
      }
      else {
        msg += ` | Détail : ${dataStr.replace(/\s+/g, ' ').substring(0, 300)}`;
      }
    }
  }

  return msg;
}
