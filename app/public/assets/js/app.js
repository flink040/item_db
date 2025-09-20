import { refs } from './dom.js';
import {
  getState,
  getFilters,
  getCachedItemsPage,
  setAllItems,
  setFilter,
  setFilters,
  setItems,
  setCachedItemsPage,
  setPage,
  setPageSize,
  setSearchQuery,
  subscribe,
} from './state.js';
import { getItems, getUser, loadItemById, login, logout } from './api.js';

import {
  buildItemDetailView,
  buildMissingItemDetail,
  renderAuthState,
  renderEmptyState,
  renderGrid,
  renderSkeleton,
  showToast,
} from './ui.js';
import { closeModal, isModalOpen, openModal } from './modal.js';


const globalScope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;

const DEFAULT_APP_CONFIG = {
  API_BASE: '/api',
  SUPABASE_URL: null,
  SUPABASE_ANON_KEY: null,
};

const DESKTOP_MENU_MEDIA_QUERY = '(min-width: 768px)';
const MENU_MEDIA_LISTENER_KEY =
  typeof Symbol === 'function' ? Symbol('menuMediaListener') : '__menuMediaListener';

if (globalScope && typeof globalScope === 'object') {
  const runtimeConfig =
    globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object' ? globalScope.APP_CONFIG : {};

  globalScope.APP_CONFIG = {
    ...DEFAULT_APP_CONFIG,
    ...runtimeConfig,
  };
}


const MIN_SKELETON_COUNT = 6;
const MAX_SKELETON_COUNT = 12;
const SEARCH_DEBOUNCE_MS = 250;
const URL_SEARCH_KEY = 'q';
const URL_TYPE_KEY = 'type';
const URL_MATERIAL_KEY = 'mat';
const URL_RARITY_KEY = 'rarity';
const URL_PAGE_KEY = 'page';
const URL_PAGE_SIZE_KEY = 'per';

const URL_MATERIAL_FALLBACK_KEY = 'material';
const URL_RARITY_FALLBACK_KEY = 'cat';
const URL_ITEM_KEY = 'item';
const FETCH_ALL_PAGE_SIZE = Number.POSITIVE_INFINITY;
const DEFAULT_PAGE_SIZES = [6, 9, 12];
const PAGINATION_SKELETON_DELAY_MS = 220;
const INFINITE_SCROLL_THRESHOLD_PX = 320;
const INFINITE_SCROLL_THROTTLE_MS = 180;
const INFINITE_SCROLL_RESET_MS = 400;
const ADD_ITEM_ROUTE_CANDIDATES = ['/add', '/items/new'];
const CONFIG_ADD_ITEM_ROUTE_KEYS = [
  'add',
  'addItem',
  'createItem',
  'itemCreate',
  'itemsNew',
  'newItem',
  'itemNew',
];
const ADD_ITEM_MODAL_SELECTOR = '#item-modal';
const ADD_ITEM_MODAL_INITIAL_FOCUS_SELECTOR = '#item-name-input';
const ADD_ITEM_MODAL_FORM_SELECTOR = '#item-form';
let activeRequestId = 0;
let ignoreNextMenuClick = false;
let ignoreNextBackToTopClick = false;
let smoothScrollBound = false;
let backToTopBound = false;
let historyBound = false;
let searchDebounceId = 0;
let hasInitialDataLoaded = false;
let paginationRenderTimeoutId = 0;
let infiniteScrollBound = false;
let infiniteScrollPending = false;
let infiniteScrollHandler = null;

let pendingModalItemId = null;
let currentModalItemId = null;
let modalCloseHistoryMode = 'replace';
let activeModalRequestToken = 0;
let lastItemLoadFailed = false;

let authUser = null;
let authPending = false;
let authUiAvailable = false;
let resolvedAddItemRoute = null;
let addItemModalElement = null;
let addItemModalOpen = false;
let addItemModalFocusableItems = [];
let addItemModalPreviouslyFocused = null;



function isFocusableElement(element) {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLElement) {
    return true;
  }

  if (typeof SVGElement !== 'undefined' && element instanceof SVGElement) {
    return true;
  }

  return false;
}

function restoreFocus(element) {
  if (!isFocusableElement(element)) {
    return;
  }

  const target = element;
  if (!document.contains(target)) {
    return;
  }

  try {
    target.focus({ preventScroll: true });
  } catch (error) {
    try {
      target.focus();
    } catch (focusError) {
      // Silently ignore focus restoration issues.
      void focusError;
    }
  }
}


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

function normalizeRouteCandidate(path) {
  if (typeof path !== 'string') {
    return '';
  }

  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('mailto:')) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  if (trimmed.startsWith('./')) {
    return trimmed.replace(/^\.\//, '/');
  }

  if (trimmed.startsWith('../')) {
    return trimmed;
  }

  if (/^[a-z][a-z0-9+.-]*:/.test(trimmed)) {
    return '';
  }

  return `/${trimmed}`;
}

function getAddItemRouteCandidates() {
  const candidates = new Set(ADD_ITEM_ROUTE_CANDIDATES);

  const config = globalScope && typeof globalScope.APP_CONFIG === 'object' ? globalScope.APP_CONFIG : null;
  if (config && typeof config === 'object') {
    const directCandidates = [
      config.addItemRoute,
      config.addItemPath,
      config.itemAddRoute,
      config.itemCreateRoute,
    ];

    for (const entry of directCandidates) {
      if (typeof entry === 'string' && entry.trim()) {
        candidates.add(entry);
      }
    }

    const nestedRoutes = config.routes;
    if (nestedRoutes && typeof nestedRoutes === 'object') {
      for (const key of CONFIG_ADD_ITEM_ROUTE_KEYS) {
        const value = nestedRoutes[key];
        if (typeof value === 'string' && value.trim()) {
          candidates.add(value);
        }
      }
    }
  }

  return Array.from(candidates);
}

function findAddItemRouteInDom(candidates) {
  if (typeof document === 'undefined') {
    return null;
  }

  for (const candidate of candidates) {
    const raw = typeof candidate === 'string' ? candidate.trim() : '';
    if (!raw) {
      continue;
    }

    const normalized = normalizeRouteCandidate(raw);
    const selectors = normalized && normalized !== raw ? [raw, normalized] : [raw];

    for (const selector of selectors) {
      const link = document.querySelector(`a[href="${selector}"]`);
      if (link) {
        const href = link.getAttribute('href');
        if (typeof href === 'string' && href.trim()) {
          return href.trim();
        }
      }
    }
  }

  return null;
}

function findAvailableAddItemRoute() {
  if (resolvedAddItemRoute) {
    return Promise.resolve(resolvedAddItemRoute);
  }

  const candidates = getAddItemRouteCandidates();
  if (candidates.length === 0) {
    return Promise.resolve(null);
  }

  const domRoute = findAddItemRouteInDom(candidates);
  if (domRoute) {
    resolvedAddItemRoute = domRoute;
    return Promise.resolve(domRoute);
  }
  const configuredRoute = getConfiguredAddItemRoute();
  if (configuredRoute) {
    resolvedAddItemRoute = configuredRoute;
    return Promise.resolve(configuredRoute);
  }

  resolvedAddItemRoute = null;
  return Promise.resolve(null);
}

function getConfiguredAddItemRoute() {
  const config = globalScope && typeof globalScope.APP_CONFIG === 'object' ? globalScope.APP_CONFIG : null;
  if (!config || typeof config !== 'object') {
    return null;
  }

  const directCandidates = [
    config.addItemRoute,
    config.addItemPath,
    config.itemAddRoute,
    config.itemCreateRoute,
  ];

  for (const entry of directCandidates) {
    const normalized = normalizeRouteCandidate(entry);
    if (normalized) {
      return normalized;
    }
  }

  const nestedRoutes = config.routes;
  if (nestedRoutes && typeof nestedRoutes === 'object') {
    for (const key of CONFIG_ADD_ITEM_ROUTE_KEYS) {
      const value = nestedRoutes[key];
      const normalized = normalizeRouteCandidate(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
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

  const typeSelect = refs.filterType;
  if (typeSelect && typeSelect.dataset.filterBound !== 'true') {
    typeSelect.addEventListener('change', handleFilterChange);
    typeSelect.dataset.filterBound = 'true';
  }

  const materialSelect = refs.filterMaterial;
  if (materialSelect && materialSelect.dataset.filterBound !== 'true') {
    materialSelect.addEventListener('change', handleFilterChange);
    materialSelect.dataset.filterBound = 'true';
  }

  const raritySelect = refs.filterRarity;
  if (raritySelect && raritySelect.dataset.filterBound !== 'true') {
    raritySelect.addEventListener('change', handleFilterChange);
    raritySelect.dataset.filterBound = 'true';
  }

  const addItemButton = typeof document !== 'undefined' ? document.getElementById('btn-add-item') : null;
  if (addItemButton && addItemButton.dataset.addItemBound !== 'true') {
    addItemButton.addEventListener('click', handleAddItemButtonClick);
    addItemButton.dataset.addItemBound = 'true';
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
  setupInfiniteScroll();
  bindHistoryListener();
  bindPaginationEvents();
}

function throttle(callback, wait = 100) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  let timeoutId = null;
  let lastCallTime = 0;
  let trailingArgs = [];
  let trailingContext;

  const invoke = () => {
    lastCallTime = Date.now();
    timeoutId = null;
    const args = trailingArgs;
    const context = trailingContext;
    trailingArgs = [];
    trailingContext = undefined;
    callback.apply(context, args);
  };

  return function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    trailingArgs = args;
    trailingContext = this;

    if (timeSinceLastCall >= wait || timeSinceLastCall <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke();
    } else if (!timeoutId) {
      timeoutId = setTimeout(invoke, wait - timeSinceLastCall);
    }
  };
}

function isPromiseLike(value) {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
  );
}

function updateAuthUi({ user = authUser, loading = authPending } = {}) {
  authUser = user ?? null;
  authPending = Boolean(loading);
  authUiAvailable = renderAuthState(authUser, {
    isLoading: authPending,
    onLogin: handleAuthLogin,
    onLogout: handleAuthLogout,
  });

  return authUiAvailable;
}

function initializeAuthControls() {
  const hasUi = updateAuthUi();
  if (!hasUi) {
    return;
  }

  let currentUser;
  try {
    currentUser = getUser();
  } catch (error) {
    console.error('Aktueller Benutzer konnte nicht geladen werden', error);
    updateAuthUi({ user: null, loading: false });
    return;
  }

  if (isPromiseLike(currentUser)) {
    updateAuthUi({ loading: true });
    currentUser
      .then((user) => {
        updateAuthUi({ user: user ?? null, loading: false });
      })
      .catch((error) => {
        console.error('Aktueller Benutzer konnte nicht geladen werden', error);
        updateAuthUi({ user: null, loading: false });
      });
  } else {
    updateAuthUi({ user: currentUser ?? null, loading: false });
  }
}

async function handleAuthLogin() {
  if (authPending) {
    return;
  }

  updateAuthUi({ loading: true });

  try {
    const user = await login();
    updateAuthUi({ user: user ?? null, loading: false });
    if (authUiAvailable) {
      showToast('Du bist jetzt angemeldet.', { type: 'success' });
    }
  } catch (error) {
    console.error('Anmeldung fehlgeschlagen', error);
    updateAuthUi({ loading: false });
    if (authUiAvailable) {
      showToast('Anmeldung fehlgeschlagen.', { type: 'error' });
    }
  }
}

async function handleAuthLogout() {
  if (authPending) {
    return;
  }

  updateAuthUi({ loading: true });

  try {
    await logout();
    updateAuthUi({ user: null, loading: false });
    if (authUiAvailable) {
      showToast('Du bist nun abgemeldet.', { type: 'info' });
    }
  } catch (error) {
    console.error('Abmeldung fehlgeschlagen', error);
    updateAuthUi({ loading: false });
    if (authUiAvailable) {
      showToast('Abmeldung fehlgeschlagen.', { type: 'error' });
    }
  }
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

  if (button.dataset.menuBound !== 'true') {
    button.addEventListener('click', handleMenuToggleClick);
    button.addEventListener('keydown', handleMenuToggleKeydown);
    button.dataset.menuBound = 'true';
  }

  const applyViewportState = (matches) => {
    if (matches) {
      setMenuExpanded(true);
      return;
    }

    const expanded = button.getAttribute('aria-expanded') === 'true';
    setMenuExpanded(expanded);
  };

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia(DESKTOP_MENU_MEDIA_QUERY);
    applyViewportState(mediaQuery.matches);

    if (!button[MENU_MEDIA_LISTENER_KEY]) {
      const handleChange = (event) => {
        if (event.matches) {
          setMenuExpanded(true);
        } else {
          setMenuExpanded(false);
        }
      };

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleChange);
      }

      button[MENU_MEDIA_LISTENER_KEY] = { mediaQuery, handleChange };
    }
  } else {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    setMenuExpanded(expanded);
  }
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

function setupInfiniteScroll() {
  if (infiniteScrollBound || typeof window === 'undefined') {
    return;
  }

  const grid = refs.gridContainer;
  if (!grid || grid.dataset.infiniteScroll !== 'true') {
    return;
  }

  const evaluate = () => {
    if (!grid.isConnected) {
      return;
    }

    if (infiniteScrollPending) {
      return;
    }

    if (grid.getAttribute('aria-busy') === 'true') {
      return;
    }

    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const rect = grid.getBoundingClientRect();
    if (rect.bottom - viewportHeight > INFINITE_SCROLL_THRESHOLD_PX) {
      return;
    }

    infiniteScrollPending = true;

    const detail = {
      page: getState().page,
      query: getState().searchQuery,
    };

    grid.dispatchEvent(
      new CustomEvent('app:infinite-scroll', {
        bubbles: true,
        cancelable: false,
        detail,
      }),
    );

    const resetDelay = Math.max(0, INFINITE_SCROLL_RESET_MS);
    setTimeout(() => {
      infiniteScrollPending = false;
      if (grid.isConnected && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (infiniteScrollHandler) {
            infiniteScrollHandler();
          }
        });
      }
    }, resetDelay);
  };

  infiniteScrollHandler = throttle(evaluate, INFINITE_SCROLL_THROTTLE_MS);

  window.addEventListener('scroll', infiniteScrollHandler, { passive: true });
  window.addEventListener('resize', infiniteScrollHandler, { passive: true });

  infiniteScrollBound = true;
  window.requestAnimationFrame(() => {
    if (infiniteScrollHandler) {
      infiniteScrollHandler();
    }
  });
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

function cancelPendingPaginationRender() {
  if (paginationRenderTimeoutId) {
    window.clearTimeout(paginationRenderTimeoutId);
    paginationRenderTimeoutId = 0;
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
  const materialFilter = normalizeForComparison(sanitizedFilters.material);
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

    if (materialFilter) {
      const itemMaterial = normalizeForComparison(item.material);
      if (itemMaterial !== materialFilter) {
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
  if (sanitizedFilters.type) {
    descriptors.push(`Typ „${sanitizedFilters.type}“`);
  }
  if (sanitizedFilters.material) {
    descriptors.push(`Material „${sanitizedFilters.material}“`);
  }
  if (sanitizedFilters.rarity) {
    descriptors.push(`Seltenheit „${sanitizedFilters.rarity}“`);
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

function applyFiltersAndRender({ skipRender = false, showSkeleton = false } = {}) {
  cancelPendingPaginationRender();

  const snapshot = getState();
  const sanitizedFilters = sanitizeFilters(snapshot.filters);
  const rawPageSize = Number.isFinite(snapshot.pageSize) && snapshot.pageSize > 0 ? Math.floor(snapshot.pageSize) : MIN_SKELETON_COUNT;
  const pageSize = Math.max(1, rawPageSize);
  const requestedPage = Number.isFinite(snapshot.page) && snapshot.page > 0 ? Math.floor(snapshot.page) : 1;

  const cacheDescriptor = {
    page: requestedPage,
    pageSize,
    searchQuery: snapshot.searchQuery,
    filters: sanitizedFilters,
  };

  const canUseCache = hasInitialDataLoaded && !showSkeleton;

  let paginatedItems = null;
  let totalItems = 0;
  let totalPages = 1;
  let currentPage = requestedPage;

  if (canUseCache) {
    let cached = getCachedItemsPage(cacheDescriptor);
    if (cached) {
      totalItems = Number.isFinite(cached.totalItems) ? cached.totalItems : cached.items.length;
      totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

      if (currentPage > totalPages) {
        currentPage = totalPages;
        if (currentPage !== snapshot.page) {
          setPage(currentPage);
        }

        cached = getCachedItemsPage({
          ...cacheDescriptor,
          page: currentPage,
        });
      }

      if (cached) {
        paginatedItems = Array.isArray(cached.items) ? cached.items : [];
        totalItems = Number.isFinite(cached.totalItems) ? cached.totalItems : paginatedItems.length;
      }
    }
  }

  if (!paginatedItems) {
    const filteredItems = filterItems(snapshot.allItems, snapshot.searchQuery, sanitizedFilters);
    totalItems = filteredItems.length;
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    if (currentPage > totalPages) {
      currentPage = totalPages;
      if (currentPage !== snapshot.page) {
        setPage(currentPage);
      }
    }

    const startIndex = (currentPage - 1) * pageSize;
    paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

    setCachedItemsPage(
      {
        ...cacheDescriptor,
        page: currentPage,
      },
      {
        items: paginatedItems,
        totalItems,
      },
    );
  }

  totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (hasInitialDataLoaded) {
    setItems(paginatedItems);
  }

  if (!hasInitialDataLoaded || skipRender) {
    return paginatedItems;
  }

  const paginationMeta = {
    totalItems,
    page: currentPage,
    pageSize,
    pageSizes: getPageSizeOptions(pageSize),
  };

  const renderContent = () => {
    if (paginatedItems.length > 0) {
      renderGrid(paginatedItems, paginationMeta);
    } else {
      const emptyCopy = buildEmptyStateCopy(snapshot.searchQuery, snapshot.filters);
      renderEmptyState(emptyCopy.message, emptyCopy.details);
    }

    bindPaginationEvents();
    paginationRenderTimeoutId = 0;
  };

  if (showSkeleton) {
    const skeletonCount = Math.max(1, Math.min(pageSize, MAX_SKELETON_COUNT));
    renderSkeleton(skeletonCount, paginationMeta);
    bindPaginationEvents();
    paginationRenderTimeoutId = window.setTimeout(renderContent, PAGINATION_SKELETON_DELAY_MS);
  } else {
    renderContent();
  }

  return paginatedItems;
}

function getSkeletonCount(baseValue) {
  const numeric = Number.isFinite(baseValue) ? Math.floor(baseValue) : Number.NaN;

  if (!Number.isNaN(numeric) && numeric >= MIN_SKELETON_COUNT && numeric <= MAX_SKELETON_COUNT) {
    return numeric;
  }

  const range = MAX_SKELETON_COUNT - MIN_SKELETON_COUNT + 1;
  return Math.floor(Math.random() * range) + MIN_SKELETON_COUNT;
}

function getPageSizeOptions(currentSize) {
  const options = new Set(DEFAULT_PAGE_SIZES);

  if (Number.isFinite(currentSize) && currentSize > 0) {
    options.add(Math.floor(currentSize));
  }

  return Array.from(options)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
}

function readUrlState() {
  if (typeof window === 'undefined') {
    return { searchQuery: '', filters: {} };
  }

  const params = new URLSearchParams(window.location.search);
  const query = (params.get(URL_SEARCH_KEY) ?? '').toString();
  const typeParam = (params.get(URL_TYPE_KEY) ?? '').toString();
  const materialParam = (
    params.get(URL_MATERIAL_KEY) ?? params.get(URL_MATERIAL_FALLBACK_KEY) ?? ''
  ).toString();
  const rarityParam = (
    params.get(URL_RARITY_KEY) ?? params.get(URL_RARITY_FALLBACK_KEY) ?? ''
  ).toString();
  const itemParam = (params.get(URL_ITEM_KEY) ?? '').toString();
  const pageParam = (params.get(URL_PAGE_KEY) ?? '').toString();
  const perParam = (params.get(URL_PAGE_SIZE_KEY) ?? '').toString();


  const filters = {};
  if (typeParam.trim()) {
    filters.type = typeParam.trim();
  }
  if (materialParam.trim()) {
    filters.material = materialParam.trim();
  }
  if (rarityParam.trim()) {
    filters.rarity = rarityParam.trim();
  }

  const parsedPage = Number.parseInt(pageParam, 10);
  const parsedPer = Number.parseInt(perParam, 10);

  return {
    searchQuery: query.trim(),
    filters,
    itemId: itemParam.trim(),
    page: Number.isNaN(parsedPage) || parsedPage <= 0 ? undefined : parsedPage,
    pageSize: Number.isNaN(parsedPer) || parsedPer <= 0 ? undefined : parsedPer,
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

function hydrateStateFromUrl({ skipRender = true, showSkeleton = false } = {}) {
  if (typeof window === 'undefined') {
    return;
  }


  const { searchQuery, filters, itemId, page, pageSize } = readUrlState();

  const snapshot = getState();


  const normalizedItemId = normalizeItemId(itemId);
  pendingModalItemId = normalizedItemId || null;


  if (searchQuery !== snapshot.searchQuery) {
    setSearchQuery(searchQuery);
  }

  if (!areFiltersEqual(snapshot.filters, filters)) {
    setFilters(filters, { replace: true });
  }

  let pageChanged = false;
  let pageSizeChanged = false;

  if (typeof pageSize === 'number' && pageSize > 0 && pageSize !== snapshot.pageSize) {
    setPageSize(pageSize);
    pageSizeChanged = true;
  }

  const targetPage = typeof page === 'number' && page > 0 ? page : 1;
  if (targetPage !== snapshot.page) {
    setPage(targetPage);
    pageChanged = true;
  }

  if (!skipRender && hasInitialDataLoaded) {
    const shouldShowSkeleton = showSkeleton || pageChanged || pageSizeChanged;
    applyFiltersAndRender({ showSkeleton: shouldShowSkeleton });

    const finalSnapshot = getState();
    const requestedPage = typeof page === 'number' && page > 0 ? page : 1;
    if (finalSnapshot.page !== requestedPage) {
      updateUrlFromState({ replace: true });
    }


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
  hydrateStateFromUrl({ skipRender: false, showSkeleton: true });
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
  if (sanitizedFilters.type) {
    params.set(URL_TYPE_KEY, sanitizedFilters.type);
  } else {
    params.delete(URL_TYPE_KEY);
  }

  if (sanitizedFilters.material) {
    params.set(URL_MATERIAL_KEY, sanitizedFilters.material);
  } else {
    params.delete(URL_MATERIAL_KEY);
  }
  params.delete(URL_MATERIAL_FALLBACK_KEY);

  if (sanitizedFilters.rarity) {
    params.set(URL_RARITY_KEY, sanitizedFilters.rarity);
  } else {
    params.delete(URL_RARITY_KEY);
  }
  params.delete(URL_RARITY_FALLBACK_KEY);

  const safePage = Number.isFinite(snapshot.page) && snapshot.page > 0 ? Math.floor(snapshot.page) : 1;
  params.set(URL_PAGE_KEY, String(safePage));

  const safePageSize =
    Number.isFinite(snapshot.pageSize) && snapshot.pageSize > 0 ? Math.floor(snapshot.pageSize) : MIN_SKELETON_COUNT;
  params.set(URL_PAGE_SIZE_KEY, String(safePageSize));

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

function getAddItemModalElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  if (addItemModalElement instanceof HTMLElement && document.body.contains(addItemModalElement)) {
    return addItemModalElement;
  }

  const element = document.querySelector(ADD_ITEM_MODAL_SELECTOR);
  addItemModalElement = element instanceof HTMLElement ? element : null;
  return addItemModalElement;
}

function refreshAddItemModalFocusableItems(modal) {
  if (!modal) {
    addItemModalFocusableItems = [];
    return addItemModalFocusableItems;
  }

  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]:not([contenteditable="false"])',
  ];

  addItemModalFocusableItems = Array.from(modal.querySelectorAll(selectors.join(','))).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.hasAttribute('disabled')) {
      return false;
    }

    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    if (element.closest('[hidden]')) {
      return false;
    }

    if (element.closest('[aria-hidden="true"]')) {
      return false;
    }

    if (element.closest('[inert]')) {
      return false;
    }

    return true;
  });

  if (addItemModalFocusableItems.length === 0) {
    if (modal.getAttribute('tabindex') !== '-1') {
      modal.setAttribute('tabindex', '-1');
    }
    addItemModalFocusableItems = [modal];
  } else if (modal.getAttribute('tabindex') === '-1') {
    modal.removeAttribute('tabindex');
  }

  return addItemModalFocusableItems;
}

function ensureAddItemModalBindings(modal) {
  if (!modal) {
    return null;
  }

  if (modal.dataset.itemModalBound === 'true') {
    return modal;
  }

  const overlay = modal.querySelector('[data-modal-overlay]');
  if (overlay instanceof HTMLElement) {
    overlay.addEventListener('click', () => {
      closeAddItemFallbackModal();
    });
  }

  const closeButtons = modal.querySelectorAll('[data-modal-close]');
  closeButtons.forEach((button) => {
    if (button instanceof HTMLElement) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        closeAddItemFallbackModal();
      });
    }
  });

  const form = modal.querySelector(ADD_ITEM_MODAL_FORM_SELECTOR);
  if (form instanceof HTMLFormElement && form.dataset.addItemSubmitBound !== 'true') {
    form.addEventListener('submit', handleAddItemFormSubmit);
    form.dataset.addItemSubmitBound = 'true';
  }

  modal.addEventListener('keydown', handleAddItemModalKeydown);
  modal.addEventListener('focusin', handleAddItemModalFocusIn);

  modal.dataset.itemModalBound = 'true';
  return modal;
}

function resetAddItemModalFormState(modal) {
  if (!modal) {
    return;
  }

  const form = modal.querySelector(ADD_ITEM_MODAL_FORM_SELECTOR);
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  form.reset();

  const error = form.querySelector('[data-form-error]');
  if (error instanceof HTMLElement) {
    error.textContent = '';
    error.classList.add('hidden');
  }
}

function focusAddItemModal(modal) {
  const preferred = modal.querySelector(ADD_ITEM_MODAL_INITIAL_FOCUS_SELECTOR);
  const candidates = refreshAddItemModalFocusableItems(modal);
  const target =
    preferred instanceof HTMLElement && !preferred.hasAttribute('disabled') && preferred.getAttribute('aria-hidden') !== 'true'
      ? preferred
      : candidates[0];

  if (target instanceof HTMLElement) {
    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
        return;
      } catch (error) {
        void error;
      }

      try {
        target.focus();
      } catch (focusError) {
        void focusError;
      }
    });
  }
}

function openAddItemFallbackModal({ trigger } = {}) {
  const modal = ensureAddItemModalBindings(getAddItemModalElement());
  if (!modal) {
    return false;
  }

  resetAddItemModalFormState(modal);

  addItemModalPreviouslyFocused =
    trigger instanceof HTMLElement
      ? trigger
      : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  modal.classList.remove('hidden');
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  addItemModalOpen = true;

  focusAddItemModal(modal);
  return true;
}

function closeAddItemFallbackModal({ restoreFocus = true } = {}) {
  const modal = getAddItemModalElement();
  if (!modal || !addItemModalOpen) {
    return;
  }

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (!modal.hasAttribute('hidden')) {
    modal.setAttribute('hidden', '');
  }

  addItemModalOpen = false;
  addItemModalFocusableItems = [];

  if (!restoreFocus) {
    addItemModalPreviouslyFocused = null;
    return;
  }

  const previous = addItemModalPreviouslyFocused;
  addItemModalPreviouslyFocused = null;

  const focusTarget =
    previous instanceof HTMLElement && document.contains(previous)
      ? previous
      : typeof document !== 'undefined'
      ? document.getElementById('btn-add-item')
      : null;

  if (focusTarget instanceof HTMLElement) {
    window.requestAnimationFrame(() => {
      try {
        focusTarget.focus({ preventScroll: true });
        return;
      } catch (error) {
        void error;
      }

      try {
        focusTarget.focus();
      } catch (focusError) {
        void focusError;
      }
    });
  }
}

function handleAddItemModalKeydown(event) {
  if (!addItemModalOpen) {
    return;
  }

  const modal = getAddItemModalElement();
  if (!modal) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    closeAddItemFallbackModal();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const items = refreshAddItemModalFocusableItems(modal);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (!activeElement || !modal.contains(activeElement)) {
    event.preventDefault();
    const fallback = event.shiftKey ? last : first;
    if (fallback instanceof HTMLElement) {
      fallback.focus();
    }
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    if (last instanceof HTMLElement) {
      last.focus();
    }
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }
}

function handleAddItemModalFocusIn(event) {
  if (!addItemModalOpen) {
    return;
  }

  const modal = getAddItemModalElement();
  if (!modal) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!modal.contains(target)) {
    const [first] = refreshAddItemModalFocusableItems(modal);
    if (first instanceof HTMLElement) {
      window.requestAnimationFrame(() => {
        first.focus();
      });
    }
  }
}

function handleAddItemFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const error = form.querySelector('[data-form-error]');
  if (error instanceof HTMLElement) {
    error.textContent = 'Das direkte Hinzufügen von Items steht in dieser Vorschau noch nicht zur Verfügung.';
    error.classList.remove('hidden');
  }

  showToast('Das Hinzufügen von Items ist in dieser Vorschau noch nicht möglich.', { type: 'info' });
}

async function handleAddItemButtonClick(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }

  try {
    const targetRoute = await findAvailableAddItemRoute();
    if (targetRoute) {
      window.location.assign(targetRoute);
      return;
    }
  } catch (error) {
    // Swallow detection errors and continue with the fallback behaviour.
    void error;
  }

  const triggerEvent = new CustomEvent('open:add-item', {
    bubbles: true,
    cancelable: true,
    detail: {
      trigger: button,
      action: button.dataset.action || 'add-item',
    },
  });

  const notCancelled = button.dispatchEvent(triggerEvent);
  if (!notCancelled) {
    return;
  }

  if (!openAddItemFallbackModal({ trigger: button }) && typeof openModal === 'function') {
    const fallback = document.createElement('div');
    fallback.className = 'space-y-4';
    const message = document.createElement('p');
    message.className = 'text-sm leading-relaxed text-slate-400';
    message.textContent = 'Das Item-Modal konnte nicht geöffnet werden.';
    fallback.appendChild(message);
    openModal(fallback, { ariaLabel: 'Item hinzufügen' });
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

  const filterName = (select.dataset.filter ?? select.name ?? '').toString().trim();
  if (!filterName) {
    return;
  }

  const value = select.value ?? '';
  const normalized = value.trim();
  const currentFilters = sanitizeFilters(getFilters());
  const nextFilters = { ...currentFilters };

  if (normalized) {
    nextFilters[filterName] = normalized;
  } else {
    delete nextFilters[filterName];
  }

  if (areFiltersEqual(currentFilters, nextFilters)) {
    return;
  }

  setFilter(filterName, normalized);
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
  const type = (formData.get('type') ?? '').toString();
  const material = (formData.get('material') ?? '').toString();

  const normalizedQuery = query.trim();
  const normalizedRarity = rarity.trim();
  const normalizedType = type.trim();
  const normalizedMaterial = material.trim();

  const currentFilters = sanitizeFilters(getFilters());
  const nextFilters = { ...currentFilters };

  if (normalizedType) {
    nextFilters.type = normalizedType;
  } else {
    delete nextFilters.type;
  }

  if (normalizedMaterial) {
    nextFilters.material = normalizedMaterial;
  } else {
    delete nextFilters.material;
  }

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

function getPaginationElement() {
  const grid = refs.gridContainer;
  return grid?.parentElement?.querySelector('[data-js="pagination"]') ?? null;
}

function bindPaginationEvents() {
  const container = getPaginationElement();
  if (!container || container.dataset.paginationBound === 'true') {
    return;
  }

  container.addEventListener('click', handlePaginationClick);
  container.addEventListener('change', handlePaginationChange);
  container.dataset.paginationBound = 'true';
}

function handlePaginationClick(event) {
  const trigger = event.target instanceof Element ? event.target.closest('[data-page-action]') : null;
  if (!trigger) {
    return;
  }

  if (trigger instanceof HTMLButtonElement && trigger.disabled) {
    return;
  }

  const action = trigger.dataset.pageAction;
  if (!action) {
    return;
  }

  event.preventDefault();

  const snapshot = getState();
  const currentPage = Number.isFinite(snapshot.page) && snapshot.page > 0 ? Math.floor(snapshot.page) : 1;

  if (action === 'prev') {
    const nextPage = Math.max(1, currentPage - 1);
    if (nextPage === currentPage) {
      return;
    }

    setPage(nextPage);
    applyFiltersAndRender({ showSkeleton: true });
    updateUrlFromState({ replace: false });
    return;
  }

  if (action === 'next') {
    const nextPage = currentPage + 1;
    setPage(nextPage);
    applyFiltersAndRender({ showSkeleton: true });
    updateUrlFromState({ replace: false });
  }
}

function handlePaginationChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.dataset.js !== 'page-size') {
    return;
  }

  const value = Number.parseInt(target.value, 10);
  if (Number.isNaN(value) || value <= 0) {
    return;
  }

  const snapshot = getState();
  if (value === snapshot.pageSize) {
    return;
  }

  setPageSize(value);
  setPage(1);
  applyFiltersAndRender({ showSkeleton: true });
  updateUrlFromState({ replace: false });
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
  if (success) {
    showToast('Permalink wurde kopiert.', { type: 'success' });
  } else {
    showToast('Permalink konnte nicht kopiert werden.', { type: 'error' });
  }

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
      showToast('Details konnten nicht geladen werden.', { type: 'error' });
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
  const previouslyFocusedElement = document.activeElement;

  if (skeletonCount !== snapshot.pageSize) {
    setPageSize(skeletonCount);
  }


  hasInitialDataLoaded = false;

  renderSkeleton(skeletonCount);

  try {
    const sanitizedFilters = sanitizeFilters(snapshot.filters);
    const response = await getItems({
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
      search: snapshot.searchQuery,
      filters: sanitizedFilters,
    });

    if (requestId !== activeRequestId) {
      return;
    }

    setAllItems(response.items);
    hasInitialDataLoaded = true;
    if (lastItemLoadFailed) {
      showToast('Die Liste wurde erfolgreich aktualisiert.', { type: 'success' });
    }
    lastItemLoadFailed = false;
    applyFiltersAndRender();
    updateUrlFromState({ replace: true });
    if (pendingModalItemId) {
      maybeOpenItemFromUrl({ history: 'replace' });
    }
  } catch (error) {
    console.error('Fehler beim Laden der Items', error);
    hasInitialDataLoaded = true;
    lastItemLoadFailed = true;
    setAllItems([]);
    setItems([]);
    renderEmptyState('Die Liste konnte nicht geladen werden.');
    showToast('Die Liste konnte nicht geladen werden.', { type: 'error' });
    updateUrlFromState({ replace: true });
    if (!isModalOpen()) {
      restoreFocus(previouslyFocusedElement);
    }
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

    const typeSelect = refs.filterType;
    const type = typeof snapshot.filters?.type === 'string' ? snapshot.filters.type : '';
    if (typeSelect && typeSelect.value !== type) {
      typeSelect.value = type;
    }

    const materialSelect = refs.filterMaterial;
    const material = typeof snapshot.filters?.material === 'string' ? snapshot.filters.material : '';
    if (materialSelect && materialSelect.value !== material) {
      materialSelect.value = material;
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
  initializeAuthControls();
  loadAndRenderItems();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
