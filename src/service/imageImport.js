import { getXml, postImage } from '@/service/api';
import JSZip from 'jszip';

/**
 * Processes a ZIP file of product images.
 * Image filenames are expected to match product references (e.g., "REF123.jpg" or "REF123_1.jpg").
 *
 * @param {File} zipFile The .zip file to import.
 * @param {function} logCallback Callback for logging progress and errors.
 */
export const processImageImport = async (zipFile, logCallback) => {
    logCallback('info', 'Début du traitement du fichier ZIP...');
    const productCache = {};

    try {
        const zip = await JSZip.loadAsync(zipFile);
        const imageFiles = [];

        zip.forEach((relativePath, file) => {
            // Ignore directories and system files like those from macOS
            if (!file.dir && !relativePath.startsWith('__MACOSX/')) {
                imageFiles.push(file);
            }
        });

        if (imageFiles.length === 0) {
            logCallback('warn', 'Aucun fichier image valide trouvé dans le fichier ZIP.');
            return;
        }

        logCallback('success', `${imageFiles.length} image(s) valide(s) trouvé(s) dans le ZIP.`);

        for (const [index, imageFile] of imageFiles.entries()) {
            const filename = imageFile.name;
            
            // --- FINAL, SIMPLIFIED, AND CORRECT LOGIC ---
            // The product reference is simply the filename without the extension.
            // "M_02.jpeg" -> "M_02"
            // "T_01.png" -> "T_01"
            const productRef = filename.substring(0, filename.lastIndexOf('.'));

            if (!productRef) {
                logCallback('warn', `Fichier ignoré : nom de fichier invalide "${filename}".`);
                continue;
            }
            
            logCallback('info', `Traitement de l'image ${index + 1}/${imageFiles.length} : "${filename}" pour la référence produit "${productRef}".`);

            try {
                // 1. Find product ID from its reference
                let productId = productCache[productRef];
                if (!productId) {
                    const productSearch = await getXml(`/products?filter[reference]=[${encodeURIComponent(productRef)}]&display=[id]`);
                    const productNode = productSearch?.prestashop?.products?.product;
                    
                    if (!productNode) {
                        throw new Error(`Produit non trouvé.`);
                    }
                    // Handle both single and multiple product results
                    const product = Array.isArray(productNode) ? productNode[0] : productNode;
                    productId = product.id;
                    productCache[productRef] = productId;
                }

                // 2. Get the image data as a File object
                const imageBlob = await imageFile.async('blob');
                const imageAsFile = new File([imageBlob], filename, { type: imageBlob.type });

                // 3. Upload the image
                const uploadUrl = `/images/products/${productId}`;
                await postImage(uploadUrl, imageAsFile);

                logCallback('success', `Image "${filename}" importée avec succès pour le produit ID ${productId}.`);

            } catch (error) {
                const apiError = error.response?.data || error.message;
                logCallback('error', `Erreur pour l'image "${filename}" (Ref: ${productRef}): ${error.message}`);
                if (apiError && typeof apiError === 'string' && apiError.length < 500) {
                    logCallback('error', `Détails API: ${apiError}`);
                }
            }
        }
        logCallback('success', 'Import des images terminé.');

    } catch (error) {
        logCallback('error', `Erreur lors de la lecture du fichier ZIP : ${error.message}`);
    }
};