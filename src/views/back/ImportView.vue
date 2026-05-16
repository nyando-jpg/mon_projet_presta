<template>
  <div class="import-page">
    <h1>Import de Données via CSV</h1>
    <p>Sélectionnez un fichier CSV pour importer des données dans PrestaShop.</p>
    
    <div class="import-grid">
      <!-- Card 1: Produits -->
      <div class="upload-card">
        <h2>1. Import de Produits</h2>
        <p>Format: reference, nom, prix_ttc, Taxe, categorie</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'product')" :disabled="isImportingProduct" class="file-input" />
          <button class="action-btn" @click="startProductImport" :disabled="!fileProduct || isImportingProduct">
            {{ isImportingProduct ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>

      <!-- Card 2: Variations -->
      <div class="upload-card">
        <h2>2. Import de Variations</h2>
        <p>Format: reference, specificité, karazany, stock_initial, prix_vente_ttc, Taxe</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'variant')" :disabled="isImportingVariant" class="file-input" />
          <button class="action-btn" @click="startVariantImport" :disabled="!fileVariant || isImportingVariant">
            {{ isImportingVariant ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>

      <!-- Card 3: Orders -->
      <div class="upload-card">
        <h2>3. Import de Commandes</h2>
        <p>Format: customer_email, customer_firstname, customer_lastname, product_reference, product_quantity, order_date</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'order')" :disabled="isImportingOrder" class="file-input" />
          <button class="action-btn" @click="startOrderImport" :disabled="!fileOrder || isImportingOrder">
            {{ isImportingOrder ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>

      <!-- Card 4: Image Import -->
      <div class="upload-card">
        <h2>4. Import d'Images</h2>
        <p>Format: .zip contenant les images (ex: REF123.jpg, REF123_1.png)</p>
        <div class="upload-section">
          <input type="file" accept=".zip" @change="(e) => onFileChange(e, 'image')" :disabled="isImportingImage" class="file-input" />
          <button class="action-btn" @click="startImageImport" :disabled="!fileImage || isImportingImage">
            {{ isImportingImage ? 'Import en cours...' : 'Lancer l\'import' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="logs.length" class="logs-section">
      <h3>Journal de l'import :</h3>
      <ul>
        <li v-for="(log, index) in logs" :key="index" :class="log.type">
          {{ log.message }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Papa from 'papaparse';
import { processImport, processVariantImport } from '@/service/import';
import { processOrderImport } from '@/service/orderImport';
import { processImageImport } from '@/service/imageImport';

const fileProduct = ref(null);
const fileVariant = ref(null);
const fileOrder = ref(null);
const fileImage = ref(null);
const isImportingProduct = ref(false);
const isImportingVariant = ref(false);
const isImportingOrder = ref(false);
const isImportingImage = ref(false);
const logs = ref([]);

const addLog = (type, message) => {
  logs.value.push({ type, message });
};

const onFileChange = (event, type) => {
  if (type === 'product') {
    fileProduct.value = event.target.files[0];
  } else if (type === 'variant') {
    fileVariant.value = event.target.files[0];
  } else if (type === 'order') {
    fileOrder.value = event.target.files[0];
  } else if (type === 'image') {
    fileImage.value = event.target.files[0];
  }
};

const startProductImport = () => {
  if (!fileProduct.value) return;
  isImportingProduct.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV Produits...');

  Papa.parse(fileProduct.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV Produits. Début de l'import.`);
      await processImport(data, addLog);
      isImportingProduct.value = false;
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImportingProduct.value = false;
    }
  });
};

const startVariantImport = () => {
  if (!fileVariant.value) return;
  isImportingVariant.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV Variations...');

  Papa.parse(fileVariant.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV Variations. Début de l'import.`);
      await processVariantImport(data, addLog);
      isImportingVariant.value = false;
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImportingVariant.value = false;
    }
  });
};

const startOrderImport = () => {
  if (!fileOrder.value) return;
  isImportingOrder.value = true;
  logs.value = [];
  addLog('info', 'Début de la lecture du fichier CSV Commandes...');

  Papa.parse(fileOrder.value, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const data = results.data;
      addLog('success', `${data.length} lignes trouvées dans le CSV Commandes. Début de l'import.`);
      await processOrderImport(data, addLog);
      isImportingOrder.value = false;
    },
    error: (error) => {
      addLog('error', `Erreur de lecture du fichier CSV : ${error.message}`);
      isImportingOrder.value = false;
    }
  });
};

const startImageImport = async () => {
  if (!fileImage.value) return;
  isImportingImage.value = true;
  logs.value = [];
  await processImageImport(fileImage.value, addLog);
  isImportingImage.value = false;
};
</script>

<style scoped>
.import-page {
  max-width: 1000px;
  margin: 0 auto;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  padding: 20px;
}

.import-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 30px;
}

@media (max-width: 768px) {
  .import-grid {
    grid-template-columns: 1fr;
  }
}

.upload-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.upload-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 15px rgba(0,0,0,0.08);
}

.upload-card h2 {
  font-size: 1.25rem;
  color: #1e293b;
  margin-top: 0;
  margin-bottom: 8px;
}

.upload-card p {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 20px;
  flex-grow: 1;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.file-input {
  width: 100%;
  font-size: 0.9rem;
}

.action-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: white;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.action-btn:disabled {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.placeholder-card {
  background: #f8fafc;
  border-style: dashed;
}

.logs-section {
  margin-top: 40px;
  background-color: #1e293b;
  color: #cbd5e1;
  padding: 24px;
  border-radius: 12px;
  max-height: 400px;
  overflow-y: auto;
  font-family: monospace;
}

.logs-section h3 {
  margin-top: 0;
  color: white;
  margin-bottom: 15px;
}

.logs-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.logs-section li {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255,255,255,0.05);
  font-size: 0.9rem;
}

.info { color: #60a5fa; border-left: 3px solid #60a5fa; }
.success { color: #4ade80; border-left: 3px solid #4ade80; }
.error { color: #f87171; font-weight: bold; background-color: rgba(248, 113, 113, 0.1); border-left: 3px solid #f87171; }
</style>

