import { refs } from './dom.js';
import { getState, setFilters, setItems, setPage, setSearchQuery, subscribe } from './state.js';
import { getItems, loadItemById } from './api.js';
import { renderEmptyState, renderGrid, renderSkeleton } from './ui.js';
import { openModal } from './modal.js';

let activeRequestId = 0;
let ignoreNextMenuClick = false;
let ignoreNextBackToTopClick = false;
let smoothScrollBound = false;
let backToTopBound = false;

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
  if (form) {
    form.addEventListener('submit', handleSearchSubmit);
  }

  const grid = refs.gridContainer;
  if (grid) {
    grid.addEventListener('click', handleGridClick);
  }

  registerMenuToggle();
  setupSmoothScroll();
  setupBackToTop();
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

function handleSearchSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const query = (formData.get('search') ?? '').toString().trim();
  const rarity = (formData.get('rarity') ?? '').toString().trim();

  setSearchQuery(query);
  setFilters({ rarity });
  setPage(1);

  loadAndRenderItems();
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

  showItemDetails(itemId);
}

function buildModalContent(item) {
  const container = document.createElement('div');
  container.className = 'app-modal__content';

  const title = document.createElement('h2');
  title.className = 'app-modal__title';
  title.textContent = item.name;

  const description = document.createElement('p');
  description.className = 'app-modal__description';
  description.textContent = item.description || 'Keine Beschreibung verfügbar.';

  const details = document.createElement('dl');
  details.className = 'app-modal__meta';

  const metaEntries = [
    ['Seltenheit', item.rarity || 'unbekannt'],
    ['Typ', item.type || 'unbekannt'],
    ['Material', item.material || 'unbekannt'],
  ];

  metaEntries.forEach(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    details.append(term, definition);
  });

  container.append(title, description, details);
  return container;
}

async function showItemDetails(itemId) {
  try {
    const item = await loadItemById(itemId);
    openModal(buildModalContent(item));
  } catch (error) {
    console.error('Fehler beim Laden eines Items', error);
    const fallback = document.createElement('div');
    fallback.className = 'app-modal__error';
    fallback.textContent = 'Details konnten nicht geladen werden.';
    openModal(fallback);
  }
}

async function loadAndRenderItems() {
  const requestId = ++activeRequestId;
  const { page, pageSize, searchQuery, filters } = getState();

  renderSkeleton(pageSize);

  try {
    const response = await getItems({
      page,
      pageSize,
      search: searchQuery,
      filters,
    });

    if (requestId !== activeRequestId) {
      return;
    }

    setItems(response.items);

    if (response.items.length > 0) {
      renderGrid(response.items);
    } else {
      renderEmptyState();
    }
  } catch (error) {
    console.error('Fehler beim Laden der Items', error);
    renderEmptyState('Die Liste konnte nicht geladen werden.');
  }
}

function registerStateSync() {
  subscribe((snapshot) => {
    const input = refs.searchInput;
    if (input && input.value !== snapshot.searchQuery) {
      input.value = snapshot.searchQuery;
    }

    const raritySelect = refs.filterRarity;
    const rarity = snapshot.filters?.rarity ?? '';
    if (raritySelect && raritySelect.value !== rarity) {
      raritySelect.value = rarity;
    }
  });
}

function init() {
  createLayout();
  registerEventListeners();
  registerStateSync();
  loadAndRenderItems();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
