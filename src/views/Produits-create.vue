<script setup>
    import { ref, reactive } from 'vue';
    import produitsService from '@/service/produitsService';

    const form = ref({
        name: '',
        price: '',
        reference: ''
    });

    const message = ref('');
    const loading = ref(false);

    async function envoyerProduit() {
        loading.value = true;
        message.value = "Envoi en cours...";
        
        try {
            // On envoie la valeur actuelle du formulaire
            await produitsService.ajouterProduit(form.value);
            
            message.value = "✅ Produit inséré avec succès dans PrestaShop !";

        } catch (error) {
            message.value = "❌ Erreur lors de l'insertion. Regarde la console.";
        } finally {
            loading.value = false;
        }
    }
</script>

<template>
    <div>
        <h2>Nouveau produits</h2>
        <form @submit.prevent="envoyerProduit">
            <div>
                <label>Nom :</label>
                <input v-model="form.name" type="text" required :disabled="loading"/>
            </div>
            <div>
                <label>Prix :</label>
                <input v-model="form.price" type="number" step="0.01" required :disabled="loading"/>        
            </div>
            <div>
                <label>Référence :</label>
                <input v-model="form.reference" type="text" required :disabled="loading"/>
            </div>
            <button type="submit" :disabled="loading">
                {{ loading ? 'Action en cours...' : 'Envoyer vers PrestaShop' }}
            </button>
        </form>

        <p v-if="message">{{ message }}</p>
        <div>
            <h3>Données en temps réel :</h3>
            <p><strong>Nom :</strong> {{ form.name }}</p>
            <p><strong>Prix :</strong> {{ form.price }}</p>
            <p><strong>Référence :</strong> {{ form.reference }}</p>
         </div>
    </div>

</template>