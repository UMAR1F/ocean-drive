export const PRODUCT_ENTRY_MODES = [
	{ label: 'Wholesale', value: 'wholesale' },
	{ label: 'Supermarket / Retail', value: 'retail' },
	{ label: 'General / Custom', value: 'general' }
];

const MODE_STORAGE_KEY = 'clientInventory.productEntryMode';
const VALID_MODES = new Set(PRODUCT_ENTRY_MODES.map((mode) => mode.value));

export const getProductEntryMode = (product) => {
	let savedMode = product?.entryMode;
	if (!savedMode) {
		try {
			savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
		} catch {
			savedMode = null;
		}
	}
	return VALID_MODES.has(savedMode) ? savedMode : 'wholesale';
};

export const saveProductEntryMode = (mode) => {
	if (!VALID_MODES.has(mode)) return;
	try {
		window.localStorage.setItem(MODE_STORAGE_KEY, mode);
	} catch {
		// Keep the mode usable for this form session when storage is unavailable.
	}
};