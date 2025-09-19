export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export const refs = {
  get root() {
    return qs('#root');
  },
  get searchForm() {
    return qs('[data-js="search-form"]');
  },
  get searchInput() {
    return qs('[data-js="search-input"]');
  },
  get filterType() {
    return qs('[data-js="filter-type"]');
  },
  get filterMaterial() {
    return qs('[data-js="filter-material"]');
  },
  get filterRarity() {
    return qs('[data-js="filter-rarity"]');
  },
  get gridContainer() {
    return qs('[data-js="grid"]');
  },
  get emptyState() {
    return qs('[data-js="empty-state"]');
  },
  get mobileMenuBtn() {
    return qs('[data-js="mobile-menu-btn"]');
  },
  get mobileMenu() {
    return qs('[data-js="mobile-menu"]');
  },
  get modal() {
    return qs('[data-js="modal"]');
  },
  get modalBody() {
    return qs('[data-js="modal-body"]');
  },
  get modalClose() {
    return qs('[data-js="modal-close"]');
  },
  get modalBackdrop() {
    return qs('[data-js="modal-backdrop"]');
  },
};
