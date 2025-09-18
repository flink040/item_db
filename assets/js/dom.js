/**
 * DOM helper utilities and central element references for the OP Item DB UI.
 */

const SELECTORS = {
  root: 'body',
  searchForm: '#search-form',
  searchInput: '#search-input',
  filterType: '#filter-type',
  filterMaterial: '#filter-material',
  filterRarity: '#filter-rarity',
  resultsContainer: '#results-container',
  recentSearches: '#recent-searches',
  profileContainer: '#profile-container',
  itemModal: '#item-modal',
  profileModal: '#profile-modal',
  itemModalOverlay: '#item-modal [data-modal-overlay]',
  itemModalCloseButtons: '#item-modal [data-modal-close]',
  itemModalForm: '#item-form',
  itemModalTriggers: '[data-open-item-modal]',
  toastContainer: '#toast-container',
};

const warnedSelectors = new Set();

function resolve(selector, name) {
  const element = document.querySelector(selector);
  if (!element && !warnedSelectors.has(selector)) {
    console.warn(`[dom] Element not found for selector "${selector}" (${name}).`);
    warnedSelectors.add(selector);
  }
  return element;
}

export function qs(selector, scope = document) {
  const element = scope.querySelector(selector);
  if (!element) {
    console.warn(`[dom] Element not found for selector "${selector}".`);
  }
  return element;
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export const refs = {};

for (const [name, selector] of Object.entries(SELECTORS)) {
  Object.defineProperty(refs, name, {
    enumerable: true,
    get() {
      return resolve(selector, name);
    },
  });
}
