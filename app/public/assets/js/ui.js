import { refs } from './dom.js';

let toastContainer = null;
const TOAST_DEFAULT_TIMEOUT = 4800;
const TOAST_TRANSITION_MS = 220;
const TOAST_VARIANTS = {
  success: {
    accent: 'rgba(34,197,94,0.85)',
    background: 'rgba(15,23,42,0.95)',
    text: '#e2e8f0',
  },
  error: {
    accent: 'rgba(248,113,113,0.85)',
    background: 'rgba(15,23,42,0.95)',
    text: '#fef2f2',
  },
  info: {
    accent: 'rgba(96,165,250,0.7)',
    background: 'rgba(15,23,42,0.92)',
    text: '#e2e8f0',
  },
};

const rarityStyles = {
  gewöhnlich: {
    label: 'Gewöhnlich',
    className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
  },
  selten: {
    label: 'Selten',
    className: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  episch: {
    label: 'Episch',
    className: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  },
  legendär: {
    label: 'Legendär',
    className: 'border border-purple-500/40 bg-purple-500/10 text-purple-200',
  },
};

const fallbackRarity = {
  label: 'Unbekannt',
  className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
};

const AUTH_CONTAINER_SELECTORS = ['[data-js="auth"]', '#profile-container'];
const AUTH_HANDLER_KEY = typeof Symbol === 'function' ? Symbol('auth-handler') : '__authHandler';

function findAuthContainer() {
  if (typeof document === 'undefined') {
    return null;
  }

  const root = refs.root instanceof HTMLElement ? refs.root : null;
  for (const selector of AUTH_CONTAINER_SELECTORS) {
    if (!selector) {
      continue;
    }

    if (root) {
      const withinRoot = root.querySelector(selector);
      if (withinRoot instanceof HTMLElement) {
        return withinRoot;
      }
    }

    const globalMatch = document.querySelector(selector);
    if (globalMatch instanceof HTMLElement) {
      return globalMatch;
    }
  }

  return null;
}

function ensureAuthElements() {
  const container = findAuthContainer();
  if (!container) {
    return null;
  }

  const providerAttr = container.getAttribute('data-auth-provider');
  const provider = container.dataset.authProvider || providerAttr || '';
  const isSupabaseManaged =
    container.dataset.supabaseAuth === 'true' || container.getAttribute('data-supabase-auth') === 'true';

  if (isSupabaseManaged || provider.toLowerCase() === 'supabase') {
    return null;
  }

  if (container.dataset.authInitialized !== 'true') {
    container.setAttribute('role', container.getAttribute('role') || 'status');
    container.setAttribute('aria-live', container.getAttribute('aria-live') || 'polite');
    container.setAttribute('aria-atomic', container.getAttribute('aria-atomic') || 'true');
    container.dataset.authInitialized = 'true';
  }

  let status = container.querySelector('[data-auth-status]');
  if (!(status instanceof HTMLElement)) {
    status = document.createElement('span');
    status.dataset.authStatus = 'true';
    status.className = 'text-sm font-medium text-slate-200';
    container.appendChild(status);
  }

  let action = container.querySelector('[data-auth-action]');
  if (!(action instanceof HTMLButtonElement)) {
    if (action instanceof HTMLElement) {
      action.remove();
    }

    action = document.createElement('button');
    action.type = 'button';
    action.dataset.authAction = 'login';
    action.className =
      'ml-3 inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
    container.appendChild(action);
  }

  return { container, status, action };
}

function unbindAuthAction(button) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const previous = button[AUTH_HANDLER_KEY];
  if (typeof previous === 'function') {
    button.removeEventListener('click', previous);
    delete button[AUTH_HANDLER_KEY];
  }
}

function bindAuthAction(button, handler) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  unbindAuthAction(button);

  if (typeof handler !== 'function') {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    return;
  }

  button[AUTH_HANDLER_KEY] = handler;
  button.addEventListener('click', handler);
  button.disabled = false;
  button.removeAttribute('aria-disabled');
}

function formatUserDisplayName(user) {
  if (!user || typeof user !== 'object') {
    return 'Demo Nutzer';
  }

  const properties = ['displayName', 'name', 'username'];
  for (const property of properties) {
    const value = user[property];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  if (typeof user.email === 'string') {
    const [local] = user.email.split('@');
    if (local && local.trim().length > 0) {
      return local.trim();
    }
  }

  return 'Demo Nutzer';
}

export function renderAuthState(user, { isLoading = false, onLogin, onLogout } = {}) {
  const elements = ensureAuthElements();
  if (!elements) {
    return false;
  }

  const { container, status, action } = elements;
  const authenticated = Boolean(user);
  const loading = Boolean(isLoading);
  const displayName = formatUserDisplayName(user);

  container.dataset.authState = authenticated ? 'authenticated' : 'anonymous';
  container.setAttribute('aria-busy', loading ? 'true' : 'false');

  if (authenticated) {
    status.textContent = `Angemeldet als ${displayName}`;
  } else if (loading) {
    status.textContent = 'Anmeldung wird vorbereitet…';
  } else {
    status.textContent = 'Nicht angemeldet';
  }

  action.dataset.authAction = authenticated ? 'logout' : 'login';
  action.textContent = loading ? 'Bitte warten…' : authenticated ? 'Abmelden' : 'Einloggen';

  const label = authenticated ? `Als ${displayName} abmelden` : 'Einloggen';
  const announcedLabel = loading ? 'Vorgang wird ausgeführt' : label;
  action.setAttribute('aria-label', announcedLabel);
  action.setAttribute('title', announcedLabel);

  if (loading) {
    action.disabled = true;
    action.setAttribute('aria-disabled', 'true');
  }

  const handler = loading
    ? null
    : authenticated
    ? typeof onLogout === 'function'
      ? (event) => {
          event.preventDefault();
          onLogout();
        }
      : null
    : typeof onLogin === 'function'
    ? (event) => {
        event.preventDefault();
        onLogin();
      }
    : null;

  bindAuthAction(action, handler);

  return true;
}

function ensureToastContainer() {
  if (typeof document === 'undefined') {
    return null;
  }

  if (toastContainer instanceof HTMLElement && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  const preset = document.getElementById('toast-container');
  if (preset instanceof HTMLElement) {
    toastContainer = preset;
    return toastContainer;
  }

  const container = document.createElement('div');
  container.className = 'app-toast-container';
  container.dataset.js = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'true');

  Object.assign(container.style, {
    position: 'fixed',
    top: '1.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '0.75rem',
    width: 'min(22rem, calc(100vw - 2rem))',
    pointerEvents: 'none',
    zIndex: '1000',
  });

  document.body.appendChild(container);
  toastContainer = container;
  return toastContainer;
}

function resolveToastTheme(type) {
  const key = typeof type === 'string' ? type.toLowerCase() : 'info';
  if (Object.prototype.hasOwnProperty.call(TOAST_VARIANTS, key)) {
    return TOAST_VARIANTS[key];
  }
  return TOAST_VARIANTS.info;
}

function createToastElement(message, theme) {
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  Object.assign(toast.style, {
    boxSizing: 'border-box',
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderLeft: `4px solid ${theme.accent}`,
    background: theme.background,
    color: theme.text,
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.35)',
    backdropFilter: 'blur(8px)',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    opacity: '0',
    transform: 'translateY(-10px)',
    transition: `opacity ${TOAST_TRANSITION_MS}ms ease, transform ${TOAST_TRANSITION_MS}ms ease`,
    pointerEvents: 'none',
  });

  return toast;
}

function hideToast(toast, container) {
  if (!(toast instanceof HTMLElement)) {
    return;
  }

  if (toast.dataset.dismissed === 'true') {
    return;
  }

  toast.dataset.dismissed = 'true';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-14px)';

  const remove = () => {
    toast.removeEventListener('transitionend', remove);
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }

    if (container instanceof HTMLElement && container.childElementCount === 0) {
      container.removeAttribute('data-visible');
    }
  };

  toast.addEventListener('transitionend', remove);
  setTimeout(remove, TOAST_TRANSITION_MS + 60);
}

export function showToast(message, options = {}) {
  const container = ensureToastContainer();
  if (!(container instanceof HTMLElement)) {
    return () => {};
  }

  const { type = 'info', timeout = TOAST_DEFAULT_TIMEOUT } = options ?? {};
  const normalizedMessage = typeof message === 'string' ? message.trim() : String(message ?? '').trim();
  const text = normalizedMessage.length > 0 ? normalizedMessage : 'Hinweis';
  const theme = resolveToastTheme(type);

  const toast = createToastElement(text, theme);
  container.appendChild(toast);
  container.dataset.visible = 'true';

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  const safeTimeout = Number.isFinite(timeout) && timeout >= 2000 ? timeout : TOAST_DEFAULT_TIMEOUT;
  const hide = () => hideToast(toast, container);
  const timeoutId = setTimeout(hide, safeTimeout);

  const cleanup = () => {
    clearTimeout(timeoutId);
    hide();
  };

  return cleanup;
}

function normalizeLabel(value, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : fallback;
}

function formatSlug(item) {
  const source = normalizeLabel(item.slug ?? item.id ?? item.name, '').toLowerCase();
  if (!source) {
    return 'unbekannt';
  }

  return source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unbekannt';
}

function getRarityMeta(value) {
  if (!value) {
    return fallbackRarity;
  }

  const key = value.toString().toLowerCase();
  return rarityStyles[key] ?? {
    label: normalizeLabel(value, fallbackRarity.label),
    className: fallbackRarity.className,
  };
}

function createBadgeDot(colorClass) {
  const dot = document.createElement('span');
  dot.className = `h-2 w-2 rounded-full ${colorClass}`;
  return dot;
}

function createInfoPill(text, colorClass, fallbackText) {
  const pill = document.createElement('span');
  pill.className = 'inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1';

  const dot = createBadgeDot(colorClass);
  const label = document.createElement('span');
  label.textContent = normalizeLabel(text, fallbackText);

  pill.append(dot, label);
  return pill;
}

function resolveItemImage(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  const candidates = [
    item.image,
    item.imageUrl,
    item.imageURL,
    item.image_url,
    item.thumbnail,
    item.thumbnailUrl,
    item.thumbnail_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return '';
}

function createItemCard(item) {
  const article = document.createElement('article');
  article.className = 'relative rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-500/5';
  article.dataset.itemId = String(item.id);

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col gap-4';
  article.appendChild(wrapper);

  const header = document.createElement('div');
  header.className = 'flex items-start gap-4';
  wrapper.appendChild(header);

  const avatar = document.createElement('span');
  avatar.className = 'relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10 text-lg font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-500/30';
  const fallbackInitial = normalizeLabel(item.name, '?').charAt(0).toUpperCase() || '?';
  const imageUrl = resolveItemImage(item);

  if (imageUrl) {
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = `Abbildung von ${normalizeLabel(item.name, 'diesem Item')}`;
    image.loading = 'lazy';
    image.className = 'h-full w-full object-cover';
    avatar.appendChild(image);
  } else {
    avatar.textContent = fallbackInitial;
  }
  header.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'flex-1 space-y-3';
  header.appendChild(meta);

  const slug = document.createElement('p');
  slug.className = 'text-xs uppercase tracking-[0.3em] text-slate-500';
  slug.textContent = formatSlug(item);
  meta.appendChild(slug);

  const title = document.createElement('h3');
  title.className = 'text-lg font-semibold text-slate-100';
  title.textContent = normalizeLabel(item.name, 'Unbenanntes Item');
  meta.appendChild(title);

  const rarityRow = document.createElement('div');
  rarityRow.className = 'flex flex-wrap items-center gap-2';
  meta.appendChild(rarityRow);

  const rarityMeta = getRarityMeta(item.rarity);
  const rarityBadge = document.createElement('span');
  rarityBadge.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${rarityMeta.className}`;
  rarityBadge.textContent = rarityMeta.label;
  rarityRow.appendChild(rarityBadge);

  if (item.description) {
    const description = document.createElement('p');
    description.className = 'text-sm leading-relaxed text-slate-400';
    description.textContent = item.description;
    wrapper.appendChild(description);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-3 text-xs text-slate-500';
  metaRow.append(
    createInfoPill(item.type, 'bg-emerald-400', 'Unbekannter Typ'),
    createInfoPill(item.material, 'bg-indigo-400', 'Unbekanntes Material'),
  );
  wrapper.appendChild(metaRow);

  const actionRow = document.createElement('div');
  actionRow.className = 'flex justify-end';
  wrapper.appendChild(actionRow);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.dataset.itemId = String(item.id);
  actionButton.className = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
  actionButton.textContent = 'Details ansehen';
  actionRow.appendChild(actionButton);

  return article;
}

function createSkeletonCard() {
  const article = document.createElement('article');
  article.className = 'relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 p-5 shadow-2xl shadow-emerald-500/5';
  article.setAttribute('aria-hidden', 'true');

  const wrapper = document.createElement('div');
  wrapper.className = 'flex animate-pulse flex-col gap-4';
  article.appendChild(wrapper);

  const header = document.createElement('div');
  header.className = 'flex items-start gap-4';
  wrapper.appendChild(header);

  const avatar = document.createElement('div');
  avatar.className = 'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800/60';
  header.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'flex-1 space-y-3';
  header.appendChild(meta);

  const slugLine = document.createElement('div');
  slugLine.className = 'h-2 w-24 rounded bg-slate-800/70';
  meta.appendChild(slugLine);

  const titleLine = document.createElement('div');
  titleLine.className = 'h-3 w-32 rounded bg-slate-800/70';
  meta.appendChild(titleLine);

  const badgeLine = document.createElement('div');
  badgeLine.className = 'h-5 w-28 rounded-full bg-slate-800/70';
  meta.appendChild(badgeLine);

  const descriptionLine = document.createElement('div');
  descriptionLine.className = 'h-3 w-full rounded bg-slate-800/60';
  wrapper.appendChild(descriptionLine);

  const descriptionLineShort = document.createElement('div');
  descriptionLineShort.className = 'h-3 w-2/3 rounded bg-slate-800/60';
  wrapper.appendChild(descriptionLineShort);

  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-3';
  wrapper.appendChild(metaRow);

  for (let index = 0; index < 2; index += 1) {
    const pill = document.createElement('div');
    pill.className = 'h-6 w-32 rounded-full bg-slate-800/60';
    metaRow.appendChild(pill);
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'flex justify-end';
  wrapper.appendChild(actionRow);

  const actionPlaceholder = document.createElement('div');
  actionPlaceholder.className = 'h-9 w-32 rounded-lg bg-slate-800/60';
  actionRow.appendChild(actionPlaceholder);

  return article;
}

function createDetailDefinition(term, value) {
  const definitionTerm = document.createElement('dt');
  definitionTerm.className = 'text-xs font-semibold uppercase tracking-[0.2em] text-slate-500';
  definitionTerm.textContent = term;

  const definition = document.createElement('dd');
  definition.className = 'text-sm leading-relaxed text-slate-300';
  definition.textContent = normalizeLabel(value, 'Unbekannt');

  return [definitionTerm, definition];
}

function createActionButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
  button.textContent = label;
  return button;
}

const paginationButtonClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';

function ensurePaginationContainer() {
  const grid = refs.gridContainer;
  const parent = grid?.parentElement;

  if (!grid || !parent) {
    return null;
  }

  let container = parent.querySelector('[data-js="pagination"]');
  if (!container) {
    container = document.createElement('div');
    container.dataset.js = 'pagination';
    container.className = 'app-pagination mt-6 border-t border-slate-800/60 pt-6';
    parent.appendChild(container);
  }

  return container;
}

function clearPagination() {
  const container = ensurePaginationContainer();
  if (!container) {
    return;
  }

  container.hidden = true;
  container.innerHTML = '';
}

function normalizePageSizeOptions(currentSize, providedOptions = []) {
  const unique = new Set();

  if (Array.isArray(providedOptions)) {
    providedOptions.forEach((size) => {
      if (Number.isFinite(size) && size > 0) {
        unique.add(Math.floor(size));
      }
    });
  }

  if (Number.isFinite(currentSize) && currentSize > 0) {
    unique.add(Math.floor(currentSize));
  }

  return Array.from(unique)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
}

function renderPagination(meta = {}, { disabled = false } = {}) {
  const container = ensurePaginationContainer();
  if (!container) {
    return;
  }

  const totalItems = Number.isFinite(meta.totalItems) ? meta.totalItems : 0;
  const pageSize = Number.isFinite(meta.pageSize) && meta.pageSize > 0 ? Math.floor(meta.pageSize) : 1;
  const rawPage = Number.isFinite(meta.page) && meta.page > 0 ? Math.floor(meta.page) : 1;

  if (totalItems <= 0) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(rawPage, 1), totalPages);
  const pageSizes = normalizePageSizeOptions(pageSize, meta.pageSizes);

  const shouldShowControls = totalPages > 1 || pageSizes.length > 1;
  if (!shouldShowControls) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  container.hidden = false;
  container.innerHTML = '';
  container.setAttribute('aria-live', 'polite');

  const layout = document.createElement('div');
  layout.className = 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between';
  container.appendChild(layout);

  const infoBlock = document.createElement('div');
  infoBlock.className = 'space-y-1';
  layout.appendChild(infoBlock);

  const pageInfo = document.createElement('p');
  pageInfo.className = 'text-xs uppercase tracking-[0.3em] text-slate-500';
  pageInfo.textContent = `Seite ${currentPage} von ${totalPages}`;
  infoBlock.appendChild(pageInfo);

  const totalInfo = document.createElement('p');
  totalInfo.className = 'text-sm text-slate-400';
  totalInfo.textContent = `${totalItems} Ergebnisse`;
  infoBlock.appendChild(totalInfo);

  const controlBlock = document.createElement('div');
  controlBlock.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4';
  layout.appendChild(controlBlock);

  const nav = document.createElement('div');
  nav.className = 'flex items-center gap-2';
  controlBlock.appendChild(nav);

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.dataset.pageAction = 'prev';
  prevButton.className = paginationButtonClass;
  prevButton.textContent = 'Zurück';
  prevButton.disabled = disabled || currentPage <= 1;
  nav.appendChild(prevButton);

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.dataset.pageAction = 'next';
  nextButton.className = paginationButtonClass;
  nextButton.textContent = 'Vor';
  nextButton.disabled = disabled || currentPage >= totalPages;
  nav.appendChild(nextButton);

  if (totalPages <= 1) {
    nav.hidden = true;
  }

  if (pageSizes.length > 1) {
    const sizeWrapper = document.createElement('label');
    sizeWrapper.className = 'flex items-center gap-2 text-xs text-slate-400';
    sizeWrapper.setAttribute('aria-label', 'Elemente pro Seite');

    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'uppercase tracking-[0.2em] text-slate-500';
    sizeLabel.textContent = 'Pro Seite';
    sizeWrapper.appendChild(sizeLabel);

    const select = document.createElement('select');
    select.dataset.js = 'page-size';
    select.className = 'rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
    select.disabled = disabled;

    pageSizes.forEach((size) => {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = String(size);
      if (size === pageSize) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    sizeWrapper.appendChild(select);
    controlBlock.appendChild(sizeWrapper);
  }
}

export function buildItemDetailView(item) {
  const safeId = normalizeLabel(item.id ?? item.slug ?? item.name, '').toLowerCase() || 'item';
  const titleId = `item-detail-title-${safeId}`;

  const container = document.createElement('div');
  container.className = 'space-y-6';

  const header = document.createElement('header');
  header.className = 'space-y-2';
  container.appendChild(header);

  const slug = document.createElement('p');
  slug.className = 'text-xs uppercase tracking-[0.3em] text-slate-500';
  slug.textContent = formatSlug(item);
  header.appendChild(slug);

  const title = document.createElement('h2');
  title.className = 'text-xl font-semibold text-slate-100';
  title.id = titleId;
  title.textContent = normalizeLabel(item.name, 'Unbenanntes Item');
  header.appendChild(title);

  if (item.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-slate-400';
    subtitle.textContent = normalizeLabel(item.subtitle, '');
    header.appendChild(subtitle);
  }

  const description = document.createElement('p');
  description.className = 'text-sm leading-relaxed text-slate-400';
  description.textContent = normalizeLabel(
    item.description,
    'Für dieses Item liegt keine Beschreibung vor.',
  );
  container.appendChild(description);

  const metaList = document.createElement('dl');
  metaList.className = 'grid gap-4 sm:grid-cols-2';

  const rarityMeta = getRarityMeta(item.rarity);
  [
    ['Seltenheit', rarityMeta.label],
    ['Typ', item.type],
    ['Material', item.material],
    ['Kategorie', item.category ?? item.collection],
    ['Level', item.level ? String(item.level) : ''],
  ]
    .filter(([, value]) => normalizeLabel(value, ''))
    .forEach(([term, value]) => {
      const [termEl, definitionEl] = createDetailDefinition(term, value);
      metaList.append(termEl, definitionEl);
    });

  if (Array.isArray(item.tags) && item.tags.length > 0) {
    const [termEl, definitionEl] = createDetailDefinition('Tags', item.tags.join(', '));
    metaList.append(termEl, definitionEl);
  }

  container.appendChild(metaList);

  const actions = document.createElement('div');
  actions.className = 'flex flex-wrap justify-end gap-3 pt-4';

  const permalinkButton = createActionButton('Link kopieren');
  permalinkButton.dataset.modalAction = 'copy-permalink';
  permalinkButton.dataset.itemId = String(item.id ?? safeId);
  actions.appendChild(permalinkButton);

  const closeButton = createActionButton('Schließen');
  closeButton.dataset.modalAction = 'dismiss';
  actions.appendChild(closeButton);

  container.appendChild(actions);

  return { element: container, titleId };
}

export function buildMissingItemDetail(itemId) {
  const titleId = `item-detail-title-${normalizeLabel(itemId, '').toLowerCase() || 'unbekannt'}`;
  const container = document.createElement('div');
  container.className = 'space-y-4';

  const title = document.createElement('h2');
  title.className = 'text-xl font-semibold text-slate-100';
  title.id = titleId;
  title.textContent = 'Item konnte nicht geladen werden';
  container.appendChild(title);

  const message = document.createElement('p');
  message.className = 'text-sm leading-relaxed text-slate-400';
  message.textContent = 'Bitte versuche es später erneut oder wähle ein anderes Item aus der Liste.';
  container.appendChild(message);

  const actions = document.createElement('div');
  actions.className = 'flex justify-end pt-2';

  const closeButton = createActionButton('Schließen');
  closeButton.dataset.modalAction = 'dismiss';
  actions.appendChild(closeButton);

  container.appendChild(actions);

  return { element: container, titleId };
}

export function renderGrid(items = [], meta = {}) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;
  if (!grid) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

  items.forEach((item) => {
    const card = createItemCard(item);
    if (card) {
      wrapper.appendChild(card);
    }
  });

  fragment.appendChild(wrapper);

  grid.innerHTML = '';
  grid.appendChild(fragment);
  grid.setAttribute('aria-busy', 'false');

  if (empty) {
    empty.hidden = true;
    empty.innerHTML = '';
  }

  renderPagination(meta, { disabled: false });
}

export function renderEmptyState(message = 'Keine Einträge gefunden.', details = '') {

  const grid = refs.gridContainer;
  const empty = refs.emptyState;

  if (grid) {
    grid.innerHTML = '';
    grid.setAttribute('aria-busy', 'false');
  }

  if (empty) {
    empty.hidden = false;
    const panel = document.createElement('div');
    panel.className = 'rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400';
    const messageText = document.createElement('p');
    messageText.className = 'font-medium text-slate-300';
    messageText.textContent = message;

    panel.appendChild(messageText);

    if (details) {
      const detailsText = document.createElement('p');
      detailsText.className = 'mt-2 text-xs text-slate-500';
      detailsText.textContent = details;
      panel.appendChild(detailsText);
    }

    empty.innerHTML = '';
    empty.appendChild(panel);
  }

  clearPagination();
}

export function renderSkeleton(count = 6, meta) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;
  if (!grid) {
    return;
  }

  const numeric = Number.isFinite(count) ? Math.floor(count) : 0;
  const safeCount = Math.max(1, Math.min(12, numeric || 6));

  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

  for (let index = 0; index < safeCount; index += 1) {
    wrapper.appendChild(createSkeletonCard());
  }

  fragment.appendChild(wrapper);

  grid.innerHTML = '';
  grid.appendChild(fragment);
  grid.setAttribute('aria-busy', 'true');

  if (empty) {
    empty.hidden = true;
    empty.innerHTML = '';
  }

  if (meta) {
    renderPagination(meta, { disabled: true });
  } else {
    clearPagination();
  }
}
