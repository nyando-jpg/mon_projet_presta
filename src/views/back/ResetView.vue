<script setup>
import { computed, ref } from 'vue';
import { deleteXml, getXml } from '@/service/api';
import { resetTargets as productResetTargets } from '@/service/resetTargets';
import { resetDeclinaisonTargets } from '@/service/import';
import { resetOrderTargets } from '@/service/orderImport';

const resetTargets = [...productResetTargets, ...resetDeclinaisonTargets, ...resetOrderTargets];

function getDefaultSelectedKeys() {
  const keys = [];

  for (const target of resetTargets) {
    if (target.defaultSelected) {
      keys.push(target.key);
    }
  }

  return keys;
}

function getSelectedTargetsFromKeys(keys) {
  const selected = [];

  for (const target of resetTargets) {
    if (keys.includes(target.key)) {
      selected.push(target);
    }
  }

  return selected;
}

function getSelectedLabelFromTargets(targets) {
  const labels = [];

  for (const target of targets) {
    labels.push(target.label);
  }

  return labels.join(', ');
}

const selectedTargetKeys = ref(getDefaultSelectedKeys());
const confirmationText = ref('');
const isRunning = ref(false);
const logs = ref([]);

const selectedTargets = computed(() => getSelectedTargetsFromKeys(selectedTargetKeys.value));
const selectedLabel = computed(() => getSelectedLabelFromTargets(selectedTargets.value));
const canRun = computed(() => {
  return selectedTargets.value.length > 0 && confirmationText.value.trim().toUpperCase() === 'RESET' && !isRunning.value;
});

function addLog(level, message) {
  logs.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    message
  });
}

function getCollectionItems(payload, target) {
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

function extractItemId(item) {
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

async function fetchIdsForTarget(target) {
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

async function resetTarget(target) {
  const ids = await fetchIdsForTarget(target);

  if (!ids.length) {
    addLog('success', `${target.label}: aucune ligne a supprimer.`);
    return;
  }

  addLog('info', `${target.label}: ${ids.length} element(s) a supprimer.`);

  for (const id of ids) {
    await deleteXml(`${target.endpoint}/${id}`);
    addLog('success', `${target.label}: suppression de l'identifiant ${id}.`);
  }
}

async function runReset() {
  if (!canRun.value) {
    return;
  }

  isRunning.value = true;
  logs.value = [];

  try {
    addLog('info', `Tables selectionnees: ${selectedLabel.value}.`);

    for (const target of selectedTargets.value) {
      try {
        await resetTarget(target);
      } catch (error) {
        addLog('error', `${target.label}: ${error?.message ?? 'erreur inconnue'}.`);
      }
    }

    addLog('success', 'Reset termine.');
  } finally {
    isRunning.value = false;
  }
}

function toggleAllTargets(event) {
  selectedTargetKeys.value = event.target.checked ? resetTargets.map((target) => target.key) : [];
}
</script>

<template>
  <div class="reset-page">
    <section class="hero-card">
      <div>
        <p class="eyebrow">Reset PrestaShop</p>
        <h1>Reinitialiser les donnees via WebService API</h1>
        <p class="subtitle">
          Selectionne les tables a nettoyer, confirme l'action, puis lance la suppression entite par entite.
        </p>
      </div>

      <div class="warning-box">
        <strong>Action destructive</strong>
        <span>Aucun truncate n'est utilise. Le reset passe uniquement par les DELETE de l'API officielle.</span>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Tables a reinitialiser</p>
            <h2>Choix precis des entites</h2>
          </div>
          <label class="toggle-all">
            <input type="checkbox" :checked="selectedTargetKeys.length === resetTargets.length" @change="toggleAllTargets" />
            <span>Tout selectionner</span>
          </label>
        </div>

        <div class="target-list">
          <label v-for="target in resetTargets" :key="target.key" class="target-item">
            <input v-model="selectedTargetKeys" type="checkbox" :value="target.key" />
            <div>
              <div class="target-title">
                <strong>{{ target.label }}</strong>
                <span>{{ target.endpoint }}</span>
              </div>
              <p>
                {{ target.defaultSelected ? 'Selectionnee par defaut.' : 'Optionnelle.' }}
                <span v-if="target.skipIds.length"> IDs exclus: {{ target.skipIds.join(', ') }}.</span>
              </p>
            </div>
          </label>
        </div>
      </div>

      <div class="panel sticky">
        <p class="panel-kicker">Controle</p>
        <h2>Validation avant execution</h2>

        <label class="field">
          <span>Retape RESET pour confirmer</span>
          <input v-model="confirmationText" type="text" placeholder="RESET" />
        </label>

        <div class="summary">
          <div>
            <span>Tables retenues</span>
            <strong>{{ selectedTargets.length }}</strong>
          </div>
          <div>
            <span>Etat</span>
            <strong>{{ isRunning ? 'En cours' : 'Pret' }}</strong>
          </div>
        </div>

        <button class="run-button" type="button" :disabled="!canRun" @click="runReset">
          {{ isRunning ? 'Reset en cours...' : 'Lancer le reset' }}
        </button>

        <p class="helper-text">
          Tables selectionnees : {{ selectedLabel || 'aucune' }}
        </p>
      </div>
    </section>

    <section class="panel log-panel">
      <p class="panel-kicker">Journal</p>
      <h2>Resultats du reset</h2>

      <div v-if="!logs.length" class="empty-state">
        Aucun evenement pour le moment.
      </div>

      <ul v-else class="log-list">
        <li v-for="entry in logs" :key="entry.id" :class="`log-${entry.level}`">
          {{ entry.message }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.reset-page {
  display: grid;
  gap: 24px;
}

.hero-card,
.panel {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  background: linear-gradient(135deg, #0f172a, #1d4ed8 72%, #38bdf8);
  color: #eff6ff;
}

.eyebrow,
.panel-kicker {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  font-weight: 700;
}

.hero-card h1,
.panel h2 {
  margin: 0;
  line-height: 1.1;
}

.subtitle {
  max-width: 720px;
  margin: 14px 0 0;
  color: rgba(239, 246, 255, 0.88);
}

.warning-box {
  max-width: 300px;
  align-self: center;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.16);
  display: grid;
  gap: 8px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
  gap: 24px;
  align-items: start;
}

.panel {
  padding: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.toggle-all {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: #0f172a;
  font-weight: 600;
}

.target-list {
  display: grid;
  gap: 12px;
}

.target-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  cursor: pointer;
}

.target-item input {
  margin-top: 5px;
}

.target-title {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
}

.target-title span {
  color: #64748b;
  font-size: 0.9rem;
}

.target-item p,
.helper-text {
  margin: 8px 0 0;
  color: #475569;
}

.sticky {
  position: sticky;
  top: 24px;
}

.field {
  display: grid;
  gap: 10px;
  margin: 20px 0;
}

.field span {
  font-weight: 600;
  color: #0f172a;
}

.field input {
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  padding: 12px 14px;
  font-size: 1rem;
}

.summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary div {
  padding: 14px;
  border-radius: 16px;
  background: #eff6ff;
  display: grid;
  gap: 6px;
}

.summary span {
  color: #475569;
  font-size: 0.9rem;
}

.summary strong {
  color: #0f172a;
  font-size: 1.2rem;
}

.run-button {
  width: 100%;
  border: none;
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #dc2626, #ef4444);
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.run-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.run-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.empty-state {
  padding: 18px;
  border-radius: 16px;
  background: #f8fafc;
  color: #64748b;
}

.log-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.log-list li {
  padding: 12px 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.log-info {
  color: #0f172a;
}

.log-success {
  color: #166534;
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.log-error {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}

@media (max-width: 960px) {
  .hero-card,
  .content-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .sticky {
    position: static;
  }
}
</style>
