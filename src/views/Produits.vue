<script setup>
    import { ref, onMounted } from 'vue';
    import produitsService from '@/service/produitsService';
    
    // On crée une variable réactive vide
    const produits = ref(null);

    // On crée une fonction pour aller chercher les données
    const chargerDonnees = async () => {
    try {
        // On attend que le service récupère les données
        const data = await produitsService.getProduits();
        produits.value = data;
    } catch (error) {
        console.error("Erreur d'appel :", error);
    }
    };

    // On lance l'appel quand le composant est prêt
    onMounted(() => {
        chargerDonnees();
    });

    //suprimer un produits
    const supprimerUnProduit = async (id) => {
    // Demander confirmation à l'utilisateur
    if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;

    try {
        // Appel au service
        await produitsService.supprimerProduit(id);
        
        // Mise à jour de l'affichage local 
        // (on retire le produit de la liste sans recharger toute la page)
        produits.value.products = produits.value.products.filter(p => p.id !== id);
        
        alert("Produit supprimé avec succès !");
    } catch (error) {
        alert("Erreur lors de la suppression.");
    }
};

</script>

<template>
    <div>

        <h1>Voici la page des produits</h1>
        <!-- <pre v-if="produits">{{ produits }}</pre> -->
         <div v-if="produits">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nom</th>
                        <th>Prix</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="produit in produits.products" :key="produit.id" class="clickable-row">
                        <div @click="$router.push(`/produits/${produit.id}`)">
                            <td>{{ produit.id }}</td>
                            <td>{{ produit.name }}</td>
                            <td>{{ produit.price }}</td>
                        </div>
                        <td>
                            <button 
                                @click="supprimerUnProduit(produit.id)" 
                                style="color: red; border: 1px solid red; background: none; cursor: pointer; border-radius: 4px;">
                                Supprimer
                            </button>
                            <button 
                                @click="$router.push(`/modifier/${produit.id}`)" 
                                style="color: blue; border: 1px solid blue; margin-right: 5px; cursor: pointer; border-radius: 4px;">
                                Modifier
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
         </div>
    </div>
</template>

<style scoped>
.clickable-row {
    cursor: pointer;
    transition: background-color 0.2s;
}

.clickable-row:hover {
    background-color: #f5f5f5; /* Change de couleur au survol */
}

button {
    margin: 0 5px;
}
</style>