/**
 * Normalizes a name for robust comparison.
 * - Trims whitespace
 * - Converts to lowercase
 * - Removes diacritics/accents (água -> agua)
 * - Collapses multiple spaces
 * 
 * @param {string} name 
 * @returns {string} normalized name
 */
export const normalizeName = (name) => {
    if (!name) return '';
    return name
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .replace(/\s+/g, " "); // Collapse spaces
};
