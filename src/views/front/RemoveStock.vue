<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref(false);

const handleLogin = () => {
  // Vérification en dur (Hardcoded)
  if (username.value === 'admin' && password.value === 'admin') {
    // On peut stocker un faux token pour simuler une session
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('userRole', 'admin');
    
    // Redirection vers le dashboard (assure-toi que le nom correspond à ta route)
    router.push('/frontend/remove-formulaire'); 
  } else {
    error.value = true;
    setTimeout(() => error.value = false, 3000); // Cache l'erreur après 3s
  }
};
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h2>Connexion Admin</h2>
      <p class="subtitle">Entrez vos identifiants pour accéder au flux</p>

      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>Identifiant</label>
          <input 
            v-model="username" 
            type="text" 
            placeholder="ex: admin"
            required
          />
        </div>

        <div class="form-group">
          <label>Mot de passe</label>
          <input 
            v-model="password" 
            type="password" 
            placeholder="••••••••"
            required
          />
        </div>

        <transition name="fade">
          <p v-if="error" class="error-msg">Identifiants incorrects (admin/admin)</p>
        </transition>

        <button type="submit" class="login-btn">Se connecter</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
  font-family: 'Inter', sans-serif;
}

.login-card {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.05);
  width: 100%;
  max-width: 400px;
  text-align: center;
}

h2 { color: #1a1a1a; margin-bottom: 0.5rem; }
.subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }

.form-group {
  text-align: left;
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #444;
}

input {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
}

.login-btn {
  width: 100%;
  padding: 0.8rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover { background: #2563eb; }

.error-msg {
  color: #ef4444;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>