<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import produitsService from '@/service/produitsService';

const route = useRoute();
const router = useRouter();
const productId = route.params.id;

// 1. On crée une ref pour le produit complet (pour la galerie et imageUrl)
const produit = ref(null);

const form = ref({
    name: '',
    price: '',
    reference: ''
});

const loading = ref(false);
const message = ref('');

onMounted(async () => {
    loading.value = true;
    try {
        const data = await produitsService.getProduitById(productId);
        
        // 2. On stocke le produit entier dans notre ref
        produit.value = data; 
        
        // Remplissage du formulaire
        form.value.name = data.name;
        form.value.price = data.price;
        form.value.reference = data.reference;
    } catch (error) {
        message.value = "Impossible de charger le produit.";
    } finally {
        loading.value = false;
    }
});

async function sauvegarderModif() {
    if (form.value.price <= 0) {
        message.value = "❌ Le prix doit être supérieur à 0.";
        return;
    }

    loading.value = true;
    message.value = "Mise à jour...";
    
    try {
        const donneesSimples = {
            price: form.value.price,
            reference: form.value.reference,
            name: form.value.name 
        };

        await produitsService.modifierProduit(productId, donneesSimples);
        message.value = "✅ Produit mis à jour !";
        
        setTimeout(() => router.push('/produits'), 1500);
    } catch (error) {
        message.value = "❌ Erreur lors de la modification.";
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div v-if="!loading && produit">
        <h2>Modifier le produit ID: {{ productId }}</h2>
        
        <form @submit.prevent="sauvegarderModif">
            <div class="image-box">
                <div class="gallery" v-if="produit.galerie && produit.galerie.length > 0">
                    <img 
                        v-for="(url, index) in produit.galerie" 
                        :key="index" 
                        :src="url" 
                        class="thumb"
                        alt="Miniature"
                    />
                </div>
            </div>

            <div>
                <label>Nom :</label>
                <input v-model="form.name" type="text" required />
            </div>
            <div>
                <label>Prix :</label>
                <input v-model="form.price" type="number" step="0.01" required />
            </div>
            <div>
                <label>Référence :</label>
                <input v-model="form.reference" type="text" required />
            </div>
            
            <button type="submit" :disabled="loading">
                {{ loading ? 'Enregistrement...' : 'Enregistrer les modifications' }}
            </button>
            <button type="button" @click="router.back()">Annuler</button>
        </form>

        <p v-if="message">{{ message }}</p>
    </div>
    <div v-else>Chargement...</div>
</template>


<style scoped>
.card {
    border: 1px solid #ddd;
    padding: 20px;
    border-radius: 8px;
    margin-top: 15px;
    line-height: 1.6;
}
.product-layout {
    display: flex;
    gap: 30px;
    margin-top: 20px;
}

.main-img {
    width: 300px;
    height: auto;
    border-radius: 10px;
    border: 1px solid #eee;
}

.gallery {
    display: flex;
    gap: 10px;
    margin-top: 10px;
}

.thumb {
    width: 60px;
    height: 60px;
    object-fit: cover;
    cursor: pointer;
    border: 2px solid transparent;
    border-radius: 5px;
}

.thumb:hover {
    border-color: #42b983; /* Couleur verte de Vue */
}
</style>