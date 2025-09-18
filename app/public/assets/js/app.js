import { refs } from './dom.js';
import {
  getState,
  setAllItems,
  setFilters,
  setItems,
  setPage,
  setPageSize,
  setSearchQuery,
  subscribe,
} from './state.js';
import { getItems, loadItemById } from './api.js';

import {
  buildItemDetailView,
  buildMissingItemDetail,
  renderEmptyState,
  renderGrid,
  renderSkeleton,
} from './ui.js';
import { closeModal, isModalOpen, openModal } from './modal.js';


const MIN_SKELETON_COUNT = 6;
const MAX_SKELETON_COUNT = 12;
const SEARCH_DEBOUNCE_MS = 250;
const URL_SEARCH_KEY = 'q';
const URL_CATEGORY_KEY = 'cat';

const URL_ITEM_KEY = 'item';
const FETCH_ALL_PAGE_SIZE = Number.POSITIVE_INFINITY;


let activeRequestId = 0;
let ignoreNextMenuClick = false;
let ignoreNextBackToTopClick = false;
let smoothScrollBound = false;
let backToTopBound = false;
let historyBound = false;
let searchDebounceId = 0;
let hasInitialDataLoaded = false;

let pendingModalItemId = null;
let currentModalItemId = null;
let modalCloseHistoryMode = 'replace';
let activeModalRequestToken = 0;


function getMenuElement(button) {
  if (!button) {
    return null;
  }

  const root = refs.root;
  const { menuTarget } = button.dataset;
  if (root && menuTarget) {
    const candidate = root.querySelector(`[data-js="${menuTarget}"]`);
    if (candidate) {
      return candidate;
    }
  }

  return refs.mobileMenu;
}

function setMenuExpanded(expand) {
  const button = refs.mobileMenuBtn;
  const menu = getMenuElement(button);
  if (!button || !menu) {
    return;
  }

  const shouldExpand = Boolean(expand);
  button.setAttribute('aria-expanded', String(shouldExpand));
  button.dataset.menuOpen = String(shouldExpand);

  menu.hidden = !shouldExpand;
  menu.setAttribute('aria-hidden', String(!shouldExpand));
  menu.dataset.menuOpen = String(shouldExpand);
}


function createLayout() {
  const root = refs.root;
  if (!root || root.dataset.appInitialized === 'true') {
    return;
  }

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-shell__header">
        <h1 class="app-shell__title">OP Item DB Vorschau</h1>
        <button
          type="button"
          class="app-shell__menu-btn"
          data-js="mobile-menu-btn"
          data-menu-target="mobile-menu"
          aria-expanded="false"
          aria-controls="app-menu"
        >
          Menü
        </button>
        <nav id="app-menu" class="app-shell__menu" data-js="mobile-menu" hidden>
          <a href="#item-grid" data-js="scroll-link" data-menu-close="true">Zur Liste</a>
        </nav>
      </header>
      <main class="app-shell__main">
        <section class="app-shell__search">
          <form class="app-search" data-js="search-form" role="search" aria-label="Items durchsuchen">
            <label class="app-search__label" for="app-search-input">Suche</label>
            <input
              id="app-search-input"
              class="app-search__input"
              name="search"
              type="search"
              data-js="search-input"
              placeholder="Items durchsuchen"
              autocomplete="off"
            />
            <label class="app-search__label" for="app-filter-rarity">Seltenheit</label>
            <select
              id="app-filter-rarity"
              class="app-search__select"
              name="rarity"
              data-js="filter-rarity"
            >
              <option value="">Alle Seltenheiten</option>
              <option value="gewöhnlich">Gewöhnlich</option>
              <option value="selten">Selten</option>
              <option value="episch">Episch</option>
              <option value="legendär">Legendär</option>
            </select>
            <button type="submit" class="app-search__submit">Suchen</button>
          </form>
        </section>
        <section id="item-grid" class="app-shell__grid" data-js="grid" aria-live="polite" aria-busy="false"></section>
        <section class="app-shell__empty" data-js="empty-state" hidden></section>
      </main>
    </div>
    <div class="app-modal" data-js="modal" role="dialog" aria-modal="true" aria-hidden="true" hidden>
      <div class="app-modal__backdrop" data-js="modal-backdrop" tabindex="-1"></div>
      <div class="app-modal__dialog" role="document">
        <button type="button" class="app-modal__close" data-js="modal-close" aria-label="Schließen">×</button>
        <div class="app-modal__body" data-js="modal-body"></div>
      </div>
    </div>
  `;

  root.dataset.appInitialized = 'true';
}

function registerEventListeners() {
  const form = refs.searchForm;
  if (form && form.dataset.submitBound !== 'true') {
    form.addEventListener('submit', handleSearchSubmit);
    form.dataset.submitBound = 'true';
  }

  const searchInput = refs.searchInput;
  if (searchInput && searchInput.dataset.searchBound !== 'true') {
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.dataset.searchBound = 'true';
  }

  const raritySelect = refs.filterRarity;
  if (raritySelect && raritySelect.dataset.filterBound !== 'true') {
    raritySelect.addEventListener('change', handleFilterChange);
    raritySelect.dataset.filterBound = 'true';
  }

  const grid = refs.gridContainer;
  if (grid && grid.dataset.clickBound !== 'true') {
    grid.addEventListener('click', handleGridClick);
    grid.dataset.clickBound = 'true';
  }


  const modal = refs.modal;
  if (modal && modal.dataset.actionsBound !== 'true') {
    modal.addEventListener('click', handleModalClick);
    modal.dataset.actionsBound = 'true';
  }


  registerMenuToggle();
  setupSmoothScroll();
  setupBackToTop();
  bindHistoryListener();
}

function toggleMobileMenu(force) {
  const button = refs.mobileMenuBtn;
  const menu = getMenuElement(button);
  if (!button || !menu) {
    return;
  }

  const expanded = button.getAttribute('aria-expanded') === 'true';
  const shouldExpand = typeof force === 'boolean' ? force : !expanded;
  setMenuExpanded(shouldExpand);
}

function registerMenuToggle() {
  const button = refs.mobileMenuBtn;
  const menu = getMenuElement(button);
  if (!button || !menu) {
    return;
  }

  if (button.dataset.menuBound === 'true') {
    return;
  }

  button.addEventListener('click', handleMenuToggleClick);
  button.addEventListener('keydown', handleMenuToggleKeydown);
  button.dataset.menuBound = 'true';

  const expanded = button.getAttribute('aria-expanded') === 'true';
  setMenuExpanded(expanded);
}

function handleMenuToggleClick(event) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return;
  }

  if (ignoreNextMenuClick) {
    ignoreNextMenuClick = false;
    return;
  }

  event.preventDefault();
  toggleMobileMenu();
}

function handleMenuToggleKeydown(event) {
  const key = event.key;
  if (key !== ' ' && key !== 'Spacebar' && key !== 'Enter') {
    return;
  }

  ignoreNextMenuClick = true;
  event.preventDefault();
  toggleMobileMenu();
}

function setupSmoothScroll() {
  const root = refs.root;
  if (!root || smoothScrollBound) {
    return;
  }

  root.addEventListener('click', handleAnchorActivation);
  smoothScrollBound = true;
}

function handleAnchorActivation(event) {
  const target = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
  if (!target) {
    return;
  }

  const href = target.getAttribute('href');
  if (!href || href.length <= 1 || href === '#') {
    return;
  }

  const anchorId = href.slice(1);
  const anchorTarget = document.getElementById(anchorId) || document.getElementsByName(anchorId)[0];
  if (!anchorTarget) {
    return;
  }

  event.preventDefault();

  const menuAncestor = target.closest('[data-js="mobile-menu"]');
  if (menuAncestor || target.dataset.menuClose === 'true') {
    toggleMobileMenu(false);
  }

  anchorTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusTargetElement(anchorTarget);

  if (typeof window !== 'undefined' && typeof window.history !== 'undefined' && href !== window.location.hash) {
    try {
      window.history.pushState(null, '', `#${anchorId}`);
    } catch (error) {
      // ignore navigation updates that fail (e.g. unsupported environments)
    }
  }
}

function focusTargetElement(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const hadTabIndexAttr = element.hasAttribute('tabindex');
  const previousTabIndex = element.getAttribute('tabindex');
  const needsTemporaryTabIndex = element.tabIndex < 0 && !hadTabIndexAttr;

  if (needsTemporaryTabIndex) {
    element.setAttribute('tabindex', '-1');
  }

  element.focus({ preventScroll: true });

  if (needsTemporaryTabIndex) {
    const cleanup = () => {
      element.removeAttribute('tabindex');
      element.removeEventListener('blur', cleanup);
      element.removeEventListener('keydown', handleTabKeydown);
    };

    const handleTabKeydown = (keyEvent) => {
      if (keyEvent.key === 'Tab') {
        cleanup();
      }
    };

    element.addEventListener('blur', cleanup, { once: true });
    element.addEventListener('keydown', handleTabKeydown);
  } else if (!hadTabIndexAttr && previousTabIndex !== null) {
    element.setAttribute('tabindex', previousTabIndex);
  }
}

function setupBackToTop() {
  if (backToTopBound) {
    return;
  }

  const root = refs.root;
  if (!root) {
    return;
  }

  const control = root.querySelector('[data-js="back-to-top"]');
  if (!control) {
    return;
  }

  control.addEventListener('click', handleBackToTopClick);
  control.addEventListener('keydown', handleBackToTopKeydown);
  backToTopBound = true;
}

function handleBackToTopClick(event) {
  if (ignoreNextBackToTopClick) {
    ignoreNextBackToTopClick = false;
    return;
  }

  event.preventDefault();
  scrollToTop({ focusFirst: false });
}

function handleBackToTopKeydown(event) {
  const key = event.key;
  if (key !== ' ' && key !== 'Spacebar' && key !== 'Enter') {
    return;
  }

  ignoreNextBackToTopClick = true;
  event.preventDefault();
  scrollToTop({ focusFirst: true });
}

function scrollToTop({ focusFirst } = {}) {
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (!focusFirst) {
    return;
  }

  const focusTarget = refs.searchInput;
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus({ preventScroll: true });
  }
}


function cancelPendingSearchUpdate() {
  if (searchDebounceId) {
    window.clearTimeout(searchDebounceId);
    searchDebounceId = 0;
  }
}

function normalizeForComparison(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}


function normalizeItemId(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}


function sanitizeFilters(filters = {}) {
  const sanitized = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        sanitized[key] = trimmed;
      }
      return;
    }

    sanitized[key] = value;
  });
  return sanitized;
}

function filterItems(items, searchQuery, filters) {
  const normalizedQuery = normalizeForComparison(searchQuery);
  const sanitizedFilters = sanitizeFilters(filters);
  const rarityFilter = normalizeForComparison(sanitizedFilters.rarity);
  const typeFilter = normalizeForComparison(sanitizedFilters.type);
  const categoryFilter = normalizeForComparison(sanitizedFilters.category);

  return items.filter((item) => {
    if (normalizedQuery) {
      const haystackParts = [];
      if (typeof item.name === 'string') {
        haystackParts.push(item.name);
      }
      if (typeof item.title === 'string') {
        haystackParts.push(item.title);
      }
      if (Array.isArray(item.tags) && item.tags.length > 0) {
        haystackParts.push(item.tags.join(' '));
      }
      if (typeof item.description === 'string') {
        haystackParts.push(item.description);
      }

      const haystack = haystackParts.join(' ').toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }

    if (rarityFilter) {
      const itemRarity = normalizeForComparison(item.rarity);
      if (itemRarity !== rarityFilter) {
        return false;
      }
    }

    if (typeFilter) {
      const itemType = normalizeForComparison(item.type);
      if (itemType !== typeFilter) {
        return false;
      }
    }

    if (categoryFilter) {
      const itemCategory = normalizeForComparison(item.category);
      const itemType = normalizeForComparison(item.type);
      if (itemCategory !== categoryFilter && itemType !== categoryFilter) {
        return false;
      }
    }

    return true;
  });
}

function buildEmptyStateCopy(searchQuery, filters) {
  const descriptors = [];
  const sanitizedFilters = sanitizeFilters(filters);

  if (searchQuery && searchQuery.trim()) {
    descriptors.push(`„${searchQuery.trim()}“`);
  }
  if (sanitizedFilters.rarity) {
    descriptors.push(`Seltenheit „${sanitizedFilters.rarity}“`);
  }
  if (sanitizedFilters.type) {
    descriptors.push(`Typ „${sanitizedFilters.type}“`);
  }

  if (descriptors.length === 0) {
    return {
      message: 'Keine Einträge gefunden.',
      details: '',
    };
  }

  return {
    message: `Keine Items gefunden für ${descriptors.join(' und ')}.`,
    details: 'Passe Suche oder Filter an, um weitere Ergebnisse zu sehen.',
  };
}

function applyFiltersAndRender({ skipRender = false } = {}) {
  const snapshot = getState();
  const filteredItems = filterItems(snapshot.allItems, snapshot.searchQuery, snapshot.filters);

  if (hasInitialDataLoaded) {
    setItems(filteredItems);
  }

  if (!hasInitialDataLoaded || skipRender) {
    return filteredItems;
  }

  if (filteredItems.length > 0) {
    renderGrid(filteredItems);
  } else {
    const emptyCopy = buildEmptyStateCopy(snapshot.searchQuery, snapshot.filters);
    renderEmptyState(emptyCopy.message, emptyCopy.details);
  }

  return filteredItems;
}

function getSkeletonCount(baseValue) {
  const numeric = Number.isFinite(baseValue) ? Math.floor(baseValue) : Number.NaN;

  if (!Number.isNaN(numeric) && numeric >= MIN_SKELETON_COUNT && numeric <= MAX_SKELETON_COUNT) {
    return numeric;
  }

  const range = MAX_SKELETON_COUNT - MIN_SKELETON_COUNT + 1;
  return Math.floor(Math.random() * range) + MIN_SKELETON_COUNT;
}

function readUrlState() {
  if (typeof window === 'undefined') {
    return { searchQuery: '', filters: {} };
  }

  const params = new URLSearchParams(window.location.search);
  const query = (params.get(URL_SEARCH_KEY) ?? '').toString();
  const category = (params.get(URL_CATEGORY_KEY) ?? '').toString();
  const itemParam = (params.get(URL_ITEM_KEY) ?? '').toString();


  const filters = {};
  if (category.trim()) {
    filters.rarity = category.trim();
  }

  return {
    searchQuery: query.trim(),
    filters,
    itemId: itemParam.trim(),

  };
}

function areFiltersEqual(current, next) {
  const currentSanitized = sanitizeFilters(current);
  const nextSanitized = sanitizeFilters(next);

  const currentKeys = Object.keys(currentSanitized);
  const nextKeys = Object.keys(nextSanitized);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return currentKeys.every((key) => normalizeForComparison(currentSanitized[key]) === normalizeForComparison(nextSanitized[key]));
}

function hydrateStateFromUrl({ skipRender = true } = {}) {
  if (typeof window === 'undefined') {
    return;
  }


  const { searchQuery, filters, itemId } = readUrlState();

  const snapshot = getState();

  let shouldResetPage = false;


  const normalizedItemId = normalizeItemId(itemId);
  pendingModalItemId = normalizedItemId || null;


  if (searchQuery !== snapshot.searchQuery) {
    setSearchQuery(searchQuery);
    shouldResetPage = true;
  }

  if (!areFiltersEqual(snapshot.filters, filters)) {
    setFilters(filters, { replace: true });
    shouldResetPage = true;
  }

  if (shouldResetPage) {
    setPage(1);
  }

  if (!skipRender && hasInitialDataLoaded) {
    applyFiltersAndRender();


    if (pendingModalItemId) {
      openItemDetails(pendingModalItemId, { history: 'none' });
    } else if (isModalOpen()) {
      closeItemModal({ historyMode: 'none' });
    }

  }
}

function bindHistoryListener() {
  if (historyBound || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('popstate', handlePopState);
  historyBound = true;
}

function handlePopState() {
  cancelPendingSearchUpdate();
  hydrateStateFromUrl({ skipRender: false });
}

function updateUrlFromState({ replace = false } = {}) {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') {
    return;
  }

  const snapshot = getState();
  const params = new URLSearchParams(window.location.search);

  const trimmedQuery = snapshot.searchQuery.trim();
  if (trimmedQuery) {
    params.set(URL_SEARCH_KEY, trimmedQuery);
  } else {
    params.delete(URL_SEARCH_KEY);
  }

  const sanitizedFilters = sanitizeFilters(snapshot.filters);
  if (sanitizedFilters.rarity) {
    params.set(URL_CATEGORY_KEY, sanitizedFilters.rarity);
  } else {
    params.delete(URL_CATEGORY_KEY);
  }

  const queryString = params.toString();
  const newRelativeUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
  const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (newRelativeUrl === currentRelativeUrl) {
    return;
  }

  try {
    if (replace) {
      window.history.replaceState(null, '', newRelativeUrl);
    } else {
      window.history.pushState(null, '', newRelativeUrl);
    }
  } catch (error) {
    // ignore unsupported history updates
  }
}

function handleSearchInput(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const value = target.value ?? '';
  cancelPendingSearchUpdate();

  searchDebounceId = window.setTimeout(() => {
    searchDebounceId = 0;
    const normalized = value.trim();
    const snapshot = getState();

    if (normalized !== snapshot.searchQuery) {
      setSearchQuery(normalized);
      setPage(1);
    }

    applyFiltersAndRender();
    updateUrlFromState({ replace: true });
  }, SEARCH_DEBOUNCE_MS);
}

function handleFilterChange(event) {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) {
    return;
  }

  cancelPendingSearchUpdate();

  const value = select.value ?? '';
  const normalized = value.trim();
  const currentFilters = sanitizeFilters(getState().filters);
  const nextFilters = { ...currentFilters };

  if (normalized) {
    nextFilters.rarity = normalized;
  } else {
    delete nextFilters.rarity;
  }

  if (areFiltersEqual(currentFilters, nextFilters)) {
    return;
  }

  setFilters(nextFilters, { replace: true });
  setPage(1);
  applyFiltersAndRender();
  updateUrlFromState({ replace: false });
}


function handleSearchSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  cancelPendingSearchUpdate();

  const formData = new FormData(form);
  const query = (formData.get('search') ?? '').toString();
  const rarity = (formData.get('rarity') ?? '').toString();

  const normalizedQuery = query.trim();
  const normalizedRarity = rarity.trim();

  const currentFilters = sanitizeFilters(getState().filters);
  const nextFilters = { ...currentFilters };

  if (normalizedRarity) {
    nextFilters.rarity = normalizedRarity;
  } else {
    delete nextFilters.rarity;
  }

  const snapshot = getState();
  const searchChanged = normalizedQuery !== snapshot.searchQuery;
  const filtersChanged = !areFiltersEqual(currentFilters, nextFilters);

  if (searchChanged) {
    setSearchQuery(normalizedQuery);
  }

  if (filtersChanged) {
    setFilters(nextFilters, { replace: true });
  }

  if (searchChanged || filtersChanged) {
    setPage(1);
  }

  applyFiltersAndRender();
  updateUrlFromState({ replace: false });

}

function handleGridClick(event) {
  const trigger = event.target instanceof Element ? event.target.closest('[data-item-id]') : null;
  if (!trigger) {
    return;
  }

  const { itemId } = trigger.dataset;
  if (!itemId) {
    return;
  }


  openItemDetails(itemId, { history: 'push' });
}

async function handleModalClick(event) {
  const actionTarget = event.target instanceof Element ? event.target.closest('[data-modal-action]') : null;
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.modalAction;
  if (action === 'dismiss') {
    event.preventDefault();
    closeItemModal({ historyMode: 'replace' });
    return;
  }

  if (action === 'copy-permalink') {
    event.preventDefault();
    await handleCopyPermalink(actionTarget);
  }
}

async function handleCopyPermalink(trigger) {
  const itemId = trigger.dataset.itemId || currentModalItemId || pendingModalItemId;
  if (!itemId) {
    return;
  }

  const permalink = buildItemPermalink(itemId);
  try {
    const success = await copyToClipboard(permalink);
    showCopyFeedback(trigger, success);
  } catch (error) {
    console.error('Fehler beim Kopieren des Permalinks', error);
    showCopyFeedback(trigger, false);
  }
}

async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      return fallbackCopyToClipboard(text);
    }
  }

  return fallbackCopyToClipboard(text);
}

function fallbackCopyToClipboard(text) {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch (error) {
    succeeded = false;
  }

  document.body.removeChild(textarea);

  if (selection) {
    selection.removeAllRanges();
    if (previousRange) {
      selection.addRange(previousRange);
    }
  }

  return succeeded;
}

function showCopyFeedback(button, success) {
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const originalLabel = button.dataset.originalLabel ?? button.textContent ?? 'Link kopieren';
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = originalLabel.trim() || 'Link kopieren';
  }

  const previousTimeout = button.dataset.copyTimeoutId ? Number.parseInt(button.dataset.copyTimeoutId, 10) : 0;
  if (previousTimeout) {
    window.clearTimeout(previousTimeout);
  }

  button.textContent = success ? 'Link kopiert' : 'Link konnte nicht kopiert werden';
  button.dataset.copyState = success ? 'success' : 'error';

  const timeoutId = window.setTimeout(() => {
    button.textContent = button.dataset.originalLabel || 'Link kopieren';
    delete button.dataset.copyState;
    delete button.dataset.copyTimeoutId;
  }, success ? 1600 : 2400);

  button.dataset.copyTimeoutId = String(timeoutId);
}

function buildItemPermalink(itemId) {
  const normalizedId = normalizeItemId(itemId);
  if (!normalizedId) {
    return '';
  }

  if (typeof window === 'undefined') {
    return normalizedId;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(URL_ITEM_KEY, normalizedId);
  return url.toString();
}

function updateItemParam(itemId, { replace = false } = {}) {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const normalizedId = normalizeItemId(itemId);

  if (normalizedId) {
    params.set(URL_ITEM_KEY, normalizedId);
  } else {
    params.delete(URL_ITEM_KEY);
  }

  const queryString = params.toString();
  const newRelativeUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
  const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (newRelativeUrl === currentRelativeUrl) {
    return;
  }

  try {
    if (replace) {
      window.history.replaceState(null, '', newRelativeUrl);
    } else {
      window.history.pushState(null, '', newRelativeUrl);
    }
  } catch (error) {
    // Ignore unsupported history updates.
  }
}

function closeItemModal({ historyMode = 'replace' } = {}) {
  if (!isModalOpen()) {
    return;
  }

  modalCloseHistoryMode = historyMode;
  closeModal();
}

function handleItemModalClose() {
  const closingId = currentModalItemId;
  currentModalItemId = null;
  pendingModalItemId = null;

  if (!closingId) {
    modalCloseHistoryMode = 'replace';
    return;
  }

  if (modalCloseHistoryMode === 'replace') {
    updateItemParam(null, { replace: true });
  } else if (modalCloseHistoryMode === 'push') {
    updateItemParam(null, { replace: false });
  }

  modalCloseHistoryMode = 'replace';
}

function openItemDetails(itemId, { history = 'push' } = {}) {
  const normalizedId = normalizeItemId(itemId);
  if (!normalizedId) {
    return;
  }

  pendingModalItemId = normalizedId;
  const requestToken = ++activeModalRequestToken;

  if (history === 'push') {
    updateItemParam(normalizedId, { replace: false });
  } else if (history === 'replace') {
    updateItemParam(normalizedId, { replace: true });
  }

  const mountView = (view) => {
    if (requestToken !== activeModalRequestToken || !view) {
      return;
    }

    let content = null;
    if (view.element instanceof HTMLElement) {
      content = view.element;
    } else if (view instanceof HTMLElement) {
      content = view;
    }

    if (!content) {
      const fallback = document.createElement('div');
      fallback.className = 'space-y-4';
      const message = document.createElement('p');
      message.className = 'text-sm leading-relaxed text-slate-400';
      message.textContent = 'Details konnten nicht angezeigt werden.';
      fallback.appendChild(message);
      content = fallback;
    }

    const labelledBy = typeof view.titleId === 'string' ? view.titleId : undefined;

    modalCloseHistoryMode = 'replace';
    currentModalItemId = normalizedId;
    pendingModalItemId = null;

    openModal(content, {
      labelledBy,
      ariaLabel: labelledBy ? undefined : 'Item-Details',
      onClose: handleItemModalClose,
    });
  };

  const snapshot = getState();
  const knownItem = snapshot.allItems.find((entry) => normalizeItemId(entry.id) === normalizedId);

  if (knownItem) {
    mountView(buildItemDetailView(knownItem));
    return;
  }

  loadItemById(normalizedId)
    .then((item) => {
      if (requestToken !== activeModalRequestToken) {
        return;
      }

      mountView(buildItemDetailView(item));
    })
    .catch((error) => {
      if (requestToken !== activeModalRequestToken) {
        return;
      }

      console.error('Fehler beim Laden eines Items', error);
      mountView(buildMissingItemDetail(normalizedId));
    });
}

function maybeOpenItemFromUrl({ history = 'replace' } = {}) {
  const normalizedId = normalizeItemId(pendingModalItemId);
  if (!normalizedId) {
    return false;
  }

  openItemDetails(normalizedId, { history });
  return true;

}

async function loadAndRenderItems() {
  const requestId = ++activeRequestId;
  const snapshot = getState();
  const skeletonCount = getSkeletonCount(snapshot.pageSize);

  if (skeletonCount !== snapshot.pageSize) {
    setPageSize(skeletonCount);
  }


  hasInitialDataLoaded = false;

  renderSkeleton(skeletonCount);

  try {
    const response = await getItems({
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
    });

    if (requestId !== activeRequestId) {
      return;
    }

    setAllItems(response.items);
    hasInitialDataLoaded = true;
    applyFiltersAndRender();
    if (pendingModalItemId) {
      maybeOpenItemFromUrl({ history: 'replace' });
    }
  } catch (error) {
    console.error('Fehler beim Laden der Items', error);
    hasInitialDataLoaded = true;
    setAllItems([]);
    setItems([]);
    renderEmptyState('Die Liste konnte nicht geladen werden.');
    if (pendingModalItemId) {
      maybeOpenItemFromUrl({ history: 'replace' });
    }
  }
}

function registerStateSync() {
  const sync = (snapshot) => {
    const input = refs.searchInput;
    if (input && input.value !== snapshot.searchQuery) {
      input.value = snapshot.searchQuery;
    }

    const raritySelect = refs.filterRarity;
    const rarity = snapshot.filters?.rarity ?? '';
    if (raritySelect && raritySelect.value !== rarity) {
      raritySelect.value = rarity;
    }
  };

  sync(getState());
  subscribe(sync);
}

function init() {
  createLayout();
  registerStateSync();
  hydrateStateFromUrl();
  registerEventListeners();
  loadAndRenderItems();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
