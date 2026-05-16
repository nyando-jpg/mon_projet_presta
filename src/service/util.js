import { ref } from "vue";

export function getColumnForList(module) {
    const local_storage_name = String(module).concat("_column");
    const retour = ref(null);
    const storedValue = localStorage.getItem(local_storage_name);
    if (storedValue != null) {
        try {
            retour.value = JSON.parse(storedValue);
        } catch (error) {
            retour.value = storedValue;
        }
    }

    if (typeof retour.value === "string" && retour.value.includes(",")) {
        retour.value = retour.value.split(",").map((item) => item.trim());
    }

    if (retour.value == null) {
        retour.value = getDefaultColumnName(module);
        localStorage.setItem(local_storage_name, JSON.stringify(retour.value));
    }
    console.log("liste des colonnes de", module, " sont :", retour.value);
    return retour.value;

}

export function getDefaultColumnName(module) {
    const key = String(module).toLowerCase();
    const defaults = {
        product: [
            "id_product",
            "image",
            "name",
            "reference",
            "category",
            "price_tax_excluded",
            "price_tax_included",
            "quantity",
            "active",
        ],
        category: [
            "id_category",
            "name",
            "description",
            "products_count",
            "active",
            "position",
        ],
        order: [
            "id_order",
            "reference",
            "customer",
            "total_paid_tax_incl",
            "payment",
            "current_state",
            "date_add",
            "country_name",
        ],
        customer: [
            "id_customer",
            "firstname",
            "lastname",
            "email",
            "total_spent",
            "active",
            "date_add",
            "connect",
        ],
        carrier: [
            "id_carrier",
            "name",
            "logo",
            "delay",
            "active",
            "is_free",
            "position",
        ],
        supplier: [
            "id_supplier",
            "logo",
            "name",
            "products_count",
            "active",
        ],
        manufacturer: [
            "id_manufacturer",
            "logo",
            "name",
            "addresses_count",
            "products_count",
            "active",
        ],
        cart_rule: [
            "id_cart_rule",
            "name",
            "priority",
            "code",
            "quantity",
            "date_to",
            "active",
        ],
        attribute_group: [
            "id_attribute_group",
            "name",
            "values",
            "position",
        ],
        attribute: [
            "id_attribute",
            "value",
            "color",
            "position",
        ],
    };

    if (defaults[key]) {
        return defaults[key];
    }

    return [];
}