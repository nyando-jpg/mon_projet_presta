<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import customersService from '@/service/customersService';

const router = useRouter();
const isSubmitting = ref(false);

const form = ref({
  firstname: '',
  lastname: '',
  email: '',
  password: '',
  newsletter: false
});

const handleSubmit = async () => {
  isSubmitting.value = true;
  try {
    await customersService.createCustomer(form.value);
    alert("Client créé avec succès !");
    router.push('/'); // Redirection vers la liste
  } catch (error) {
    alert("Erreur lors de la création. Vérifiez si l'email existe déjà.");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="create-customer-container">
    <div class="form-card">
      <h1>Nouveau Client</h1>
      <p class="subtitle">Créez un compte client dans la base PrestaShop</p>

      <form @submit.prevent="handleSubmit" class="customer-form">
        <div class="form-row">
          <div class="form-group">
            <label>Prénom</label>
            <input v-model="form.firstname" type="text" placeholder="Ex: Jean" required />
          </div>
          <div class="form-group">
            <label>Nom</label>
            <input v-model="form.lastname" type="text" placeholder="Ex: Dupont" required />
          </div>
        </div>

        <div class="form-group">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="client@exemple.com" required />
        </div>

        <div class="form-group">
          <label>Mot de passe</label>
          <input v-model="form.password" type="password" placeholder="••••••••" required />
          <small>Minimum 5 caractères pour PrestaShop</small>
        </div>

        <div class="form-group checkbox">
          <input id="newsletter" v-model="form.newsletter" type="checkbox" />
          <label for="newsletter">S'abonner à la newsletter</label>
        </div>

        <div class="actions">
          <button type="button" class="btn-cancel" @click="$router.push('/customers')">Annuler</button>
          <button type="submit" class="btn-submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Création...' : 'Enregistrer le client' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.create-customer-container {
  padding: 40px 20px;
  display: flex;
  justify-content: center;
  background-color: #f8f9fa;
  min-height: calc(100vh - 60px);
}

.form-card {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  width: 100%;
  max-width: 600px;
}

h1 { margin-bottom: 5px; color: #334e68; }
.subtitle { color: #95a5a6; margin-bottom: 25px; }

.customer-form { display: flex; flex-direction: column; gap: 20px; }

.form-row { display: flex; gap: 20px; }
.form-group { flex: 1; display: flex; flex-direction: column; gap: 8px; }

label { font-weight: 600; font-size: 14px; color: #2c3e50; }

input[type="text"], input[type="email"], input[type="password"] {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 15px;
  transition: border-color 0.2s;
}

input:focus { border-color: #42b983; outline: none; }

.checkbox { flex-direction: row; align-items: center; gap: 10px; }

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 10px;
}

.btn-submit {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
}

.btn-submit:disabled { background-color: #a8e6cf; cursor: not-allowed; }

.btn-cancel {
  background: none;
  border: 1px solid #ddd;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  color: #7f8c8d;
}
</style>