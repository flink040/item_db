
(function () {
  'use strict';

  const globalScope =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;

  if (!globalScope || !globalScope.document) {
    return;
  }

  const doc = globalScope.document;

  const MODAL_SELECTOR = '[data-moderation-modal]';
  const LIST_SELECTOR = '[data-moderation-list]';
  const LOADING_SELECTOR = '[data-moderation-loading]';
  const ERROR_SELECTOR = '[data-moderation-error]';
  const EMPTY_SELECTOR = '[data-moderation-empty]';
  const REFRESH_SELECTOR = '[data-moderation-refresh]';
  const ITEM_SELECTOR = '[data-moderation-item]';
  const DIFF_CONTAINER_SELECTOR = '[data-moderation-diff]';
  const ACTION_SELECTOR = '[data-moderation-action]';
  const LABEL_SELECTOR = '[data-moderation-button-label]';
  const SPINNER_SELECTOR = '[data-moderation-button-spinner]';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const RARITY_PRESETS = {
    common: {
      label: 'Gewöhnlich',
      className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
    },
    gewöhnlich: {
      label: 'Gewöhnlich',
      className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
    },
    rare: {
      label: 'Selten',
      className: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    },
    selten: {
      label: 'Selten',
      className: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    },
    epic: {
      label: 'Episch',
      className: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
    },
    episch: {
      label: 'Episch',
      className: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
    },
    legendary: {
      label: 'Legendär',
      className: 'border border-purple-500/40 bg-purple-500/10 text-purple-200',
    },
    legendär: {
      label: 'Legendär',
      className: 'border border-purple-500/40 bg-purple-500/10 text-purple-200',
    },
  };

  const RARITY_FALLBACK = {
    label: 'Unbekannt',
    className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
  };

  const TOAST_THEMES = {
    success: {
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    },
    error: {
      className: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    },
    warning: {
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    },
    info: {
      className: 'border-slate-700/60 bg-slate-900/80 text-slate-200',
    },
  };

  const DIFF_IGNORED_FIELDS = new Set([
    'id',
    'item_id',
    'itemId',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'published_at',
    'publishedAt',
    'moderated_at',
    'moderatedAt',
    'version',
    'version_id',
    'versionId',
    'created_by',
    'createdBy',
    'updated_by',
    'updatedBy',
    'editor_id',
    'editorId',
  ]);

  function onReady(callback) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function resolveApiBase() {
    const runtime = globalScope.APP_CONFIG && typeof globalScope.APP_CONFIG === 'object' ? globalScope.APP_CONFIG : null;
    const env = globalScope.__ENV && typeof globalScope.__ENV === 'object' ? globalScope.__ENV : null;
    const candidates = [runtime && runtime.API_BASE, env && env.API_BASE, '/api'];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed.replace(/\/$/, '');
        }
      }
    }

    return '/api';
  }

  function buildApiUrl(base, path, params) {
    const trimmedBase = typeof base === 'string' ? base.trim() : '';
    const prefix = trimmedBase.endsWith('/') ? trimmedBase.slice(0, -1) : trimmedBase;
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const origin = globalScope.location && typeof globalScope.location.origin === 'string' ? globalScope.location.origin : 'http://localhost';
    const url = new URL(prefix + normalizedPath, origin);

    if (params) {
      for (let index = 0; index < params.length; index += 1) {
        const entry = params[index];
        if (!entry || entry.length < 2) {
          continue;
        }
        const key = entry[0];
        const value = entry[1];
        if (value === null || value === undefined) {
          continue;
        }
        const stringValue = typeof value === 'string' ? value.trim() : String(value);
        if (stringValue) {
          url.searchParams.set(key, stringValue);
        }
      }
    }

    return url.toString();
  }

  function parseJsonResponse(response) {
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.toLowerCase().includes('application/json')) {
      return response.json().catch(function () {
        return null;
      });
    }

    return response
      .text()
      .then(function (text) {
        if (!text) {
          return null;
        }

        try {
          return JSON.parse(text);
        } catch (error) {
          void error;
          return { message: text };
        }
      })
      .catch(function () {
        return null;
      });
  }

  function createResponseError(payload, fallbackMessage) {
    if (payload instanceof Error) {
      return payload;
    }

    const messages = [];

    if (payload && typeof payload === 'object') {
      const errorValue = payload.error;
      if (typeof errorValue === 'string') {
        messages.push(errorValue);
      } else if (errorValue && typeof errorValue === 'object') {
        if (typeof errorValue.message === 'string') {
          messages.push(errorValue.message);
        }
        if (typeof errorValue.details === 'string') {
          messages.push(errorValue.details);
        }
      }

      if (typeof payload.message === 'string') {
        messages.push(payload.message);
      }
      if (typeof payload.msg === 'string') {
        messages.push(payload.msg);
      }
      if (typeof payload.detail === 'string') {
        messages.push(payload.detail);
      }
    }

    const resolvedMessage = (messages.find(function (value) {
      return typeof value === 'string' && value.trim().length > 0;
    }) || fallbackMessage || 'Unbekannter Fehler.').trim();

    const error = new Error(resolvedMessage);
    return error;
  }

  function extractItems(payload) {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    if (payload.data && Array.isArray(payload.data.items)) {
      return payload.data.items;
    }

    if (Array.isArray(payload.items)) {
      return payload.items;
    }

    if (Array.isArray(payload.results)) {
      return payload.results;
    }

    if (Array.isArray(payload.records)) {
      return payload.records;
    }

    return [];
  }

  function isAbortError(error) {
    if (!error) {
      return false;
    }

    if (error.name === 'AbortError') {
      return true;
    }

    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return error.code === DOMException.ABORT_ERR;
    }

    return false;
  }

  function pickString() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return '';
  }

  function normalizeId(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (value && typeof value === 'object') {
      if (typeof value.id === 'string' && value.id.trim()) {
        return value.id.trim();
      }
      if (typeof value.uuid === 'string' && value.uuid.trim()) {
        return value.uuid.trim();
      }
    }

    return '';
  }

  function normalizeRarity(data) {
    const candidates = [
      data && data.rarities && data.rarities.label,
      data && data.rarities && data.rarities.name,
      data && data.rarity_label,
      data && data.rarity,
      data && data.rarityName,
      data && data.rarity_name,
      data && data.rarity_code,
      data && data.rarityCode,
      data && data.rarity_display,
    ];

    const rawLabel = pickString.apply(null, candidates);
    if (!rawLabel) {
      return RARITY_FALLBACK;
    }

    const key = rawLabel.trim().toLowerCase();
    const preset = RARITY_PRESETS[key];
    if (preset) {
      return { label: preset.label, className: preset.className };
    }

    return {
      label: rawLabel,
      className: RARITY_FALLBACK.className,
    };
  }

  function normalizeCreator(data) {
    const candidates = [
      data && data.profiles && data.profiles.username,
      data && data.profiles && data.profiles.display_name,
      data && data.profiles && data.profiles.displayName,
      data && data.profiles && data.profiles.full_name,
      data && data.profiles && data.profiles.fullName,
      data && data.profiles && data.profiles.name,
      data && data.creator && data.creator.username,
      data && data.creator && data.creator.display_name,
      data && data.creator && data.creator.name,
      data && data.created_by && data.created_by.username,
      data && data.created_by && data.created_by.display_name,
      data && data.created_by && data.created_by,
      data && data.owner && data.owner.username,
      data && data.owner,
      data && data.author,
      data && data.submitted_by,
    ];

    const resolved = pickString.apply(null, candidates);
    if (resolved) {
      return resolved;
    }

    return 'Unbekannt';
  }

  function extractVersions(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (Array.isArray(data.item_versions)) {
      return data.item_versions;
    }

    if (Array.isArray(data.versions)) {
      return data.versions;
    }

    if (Array.isArray(data.previous_versions)) {
      return data.previous_versions;
    }

    return null;
  }

  function normalizeVersionData(version) {
    if (!version || typeof version !== 'object') {
      return {};
    }

    if (version.data && typeof version.data === 'object') {
      return version.data;
    }

    if (version.payload && typeof version.payload === 'object') {
      return version.payload;
    }

    return version;
  }

  function getVersionTimestamp(version) {
    if (!version || typeof version !== 'object') {
      return Number.NaN;
    }

    const candidates = [
      version.created_at,
      version.updated_at,
      version.createdAt,
      version.updatedAt,
      version.inserted_at,
      version.insertedAt,
      version.timestamp,
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        const parsed = Date.parse(String(candidate));
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }

    if (typeof version.version === 'number') {
      return version.version;
    }

    return Number.NaN;
  }

  function escapeSelector(value) {
    if (globalScope.CSS && typeof globalScope.CSS.escape === 'function') {
      return globalScope.CSS.escape(value);
    }

    return value.replace(/[^a-zA-Z0-9_-]/g, function (character) {
      return '\\' + character;
    });
  }

  function createSpinner() {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('h-4', 'w-4', 'animate-spin');

    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 3a9 9 0 1 1-9 9');
    svg.appendChild(path);

    return svg;
  }

  function createActionButton(action, label, extraClasses, options) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.moderationAction = action;

    const config = options || {};
    const baseClasses = [
      'inline-flex',
      'items-center',
      'justify-center',
      'gap-2',
      'rounded-lg',
      'px-4',
      'py-2',
      'text-sm',
      'font-semibold',
      'transition',
      'focus:outline-none',
      'focus-visible:ring',
      'focus-visible:ring-emerald-500/60',
    ];

    if (config.size === 'sm') {
      baseClasses.splice(baseClasses.indexOf('px-4'), 1, 'px-3');
      baseClasses.splice(baseClasses.indexOf('py-2'), 1, 'py-1.5');
      baseClasses.splice(baseClasses.indexOf('text-sm'), 1, 'text-xs');
      baseClasses.splice(baseClasses.indexOf('font-semibold'), 1, 'font-medium');
    }

    button.className = baseClasses.join(' ') + (extraClasses ? ' ' + extraClasses : '');

    if (config.showSpinner === false) {
      button.textContent = label;
    } else {
      const labelSpan = doc.createElement('span');
      labelSpan.dataset.moderationButtonLabel = 'true';
      labelSpan.textContent = label;

      const spinner = createSpinner();
      spinner.dataset.moderationButtonSpinner = 'true';
      spinner.classList.add('hidden');

      button.append(labelSpan, spinner);
    }

    return button;
  }

  function formatDiffValue(value) {
    if (value === null || value === undefined) {
      return '–';
    }

    if (typeof value === 'string') {
      if (value.length > 160) {
        return value.slice(0, 157) + '…';
      }
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    try {
      const serialized = JSON.stringify(value);
      if (typeof serialized === 'string' && serialized.length > 160) {
        return serialized.slice(0, 157) + '…';
      }
      return serialized || '–';
    } catch (error) {
      void error;
      return String(value);
    }
  }

  function isEqual(a, b) {
    if (a === b) {
      return true;
    }

    if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) {
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object' && a && b) {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (error) {
        void error;
      }
    }

    return false;
  }

  function computeDiffEntries(item) {
    const versions = extractVersions(item.raw);

    if (!Array.isArray(versions) || versions.length === 0) {
      return {
        entries: [],
        message: 'Keine Versionsdaten verfügbar.',
      };
    }

    const sorted = versions
      .slice()
      .sort(function (a, b) {
        const tsB = getVersionTimestamp(b);
        const tsA = getVersionTimestamp(a);
        if (Number.isNaN(tsA) && Number.isNaN(tsB)) {
          return 0;
        }
        if (Number.isNaN(tsA)) {
          return 1;
        }
        if (Number.isNaN(tsB)) {
          return -1;
        }
        return tsB - tsA;
      });

    const latestData = normalizeVersionData(sorted[0]);
    const previousData = sorted.length > 1 ? normalizeVersionData(sorted[1]) : null;

    if (!previousData || Object.keys(previousData).length === 0) {
      return {
        entries: [],
        message: 'Keine vorherige Version zum Vergleichen gefunden.',
      };
    }

    const keys = new Set();
    Object.keys(latestData || {}).forEach(function (key) {
      keys.add(key);
    });
    Object.keys(previousData || {}).forEach(function (key) {
      keys.add(key);
    });

    const entries = [];

    keys.forEach(function (key) {
      if (DIFF_IGNORED_FIELDS.has(key)) {
        return;
      }

      const before = previousData ? previousData[key] : undefined;
      const after = latestData ? latestData[key] : undefined;

      if (isEqual(before, after)) {
        return;
      }

      entries.push({ key, before, after });
    });

    if (entries.length === 0) {
      return {
        entries: [],
        message: 'Keine Unterschiede zur vorherigen Version.',
      };
    }

    return { entries };
  }

  function renderDiff(container, diffResult) {
    container.innerHTML = '';

    if (!diffResult) {
      const paragraph = doc.createElement('p');
      paragraph.className = 'text-xs text-slate-300';
      paragraph.textContent = 'Keine Unterschiede zur vorherigen Version.';
      container.appendChild(paragraph);
      return;
    }

    if (diffResult.message && diffResult.entries && diffResult.entries.length === 0) {
      const message = doc.createElement('p');
      message.className = 'text-xs text-slate-300';
      message.textContent = diffResult.message;
      container.appendChild(message);
      return;
    }

    if (!diffResult.entries || diffResult.entries.length === 0) {
      const message = doc.createElement('p');
      message.className = 'text-xs text-slate-300';
      message.textContent = 'Keine Unterschiede zur vorherigen Version.';
      container.appendChild(message);
      return;
    }

    const list = doc.createElement('ul');
    list.className = 'space-y-3';

    diffResult.entries.forEach(function (entry) {
      const listItem = doc.createElement('li');
      listItem.className = 'rounded-lg border border-slate-800/70 bg-slate-900/60 p-3';

      const title = doc.createElement('p');
      title.className = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
      title.textContent = entry.key;

      const beforeRow = doc.createElement('p');
      beforeRow.className = 'mt-2 text-[0.75rem] text-rose-300';
      const beforeLabel = doc.createElement('span');
      beforeLabel.className = 'text-slate-500';
      beforeLabel.textContent = 'Alt: ';
      const beforeValue = doc.createElement('span');
      beforeValue.textContent = formatDiffValue(entry.before);
      beforeRow.append(beforeLabel, beforeValue);

      const afterRow = doc.createElement('p');
      afterRow.className = 'mt-1 text-[0.75rem] text-emerald-300';
      const afterLabel = doc.createElement('span');
      afterLabel.className = 'text-slate-500';
      afterLabel.textContent = 'Neu: ';
      const afterValue = doc.createElement('span');
      afterValue.textContent = formatDiffValue(entry.after);
      afterRow.append(afterLabel, afterValue);

      listItem.append(title, beforeRow, afterRow);
      list.appendChild(listItem);
    });

    container.appendChild(list);
  }

  function showToast(message, variant) {
    const container = doc.getElementById('toast-container');
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const theme = TOAST_THEMES[variant] || TOAST_THEMES.info;

    const toast = doc.createElement('div');
    toast.className = 'pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg transition ' + theme.className;

    const content = doc.createElement('div');
    content.className = 'flex items-center justify-between gap-3';

    const text = doc.createElement('p');
    text.className = 'flex-1';
    text.textContent = message;

    content.appendChild(text);
    toast.appendChild(content);
    container.appendChild(toast);

    let timeoutId = globalScope.setTimeout(function () {
      toast.classList.add('opacity-0');
      globalScope.setTimeout(function () {
        toast.remove();
      }, 200);
    }, 5000);

    toast.addEventListener('mouseenter', function () {
      globalScope.clearTimeout(timeoutId);
    });

    toast.addEventListener('mouseleave', function () {
      timeoutId = globalScope.setTimeout(function () {
        toast.classList.add('opacity-0');
        globalScope.setTimeout(function () {
          toast.remove();
        }, 200);
      }, 2000);
    });
  }

  onReady(function () {
    const modal = doc.querySelector(MODAL_SELECTOR);
    if (!(modal instanceof HTMLElement)) {
      return;
    }

    const listEl = modal.querySelector(LIST_SELECTOR);
    if (!(listEl instanceof HTMLElement)) {
      return;
    }

    const loadingEl = modal.querySelector(LOADING_SELECTOR);
    const errorEl = modal.querySelector(ERROR_SELECTOR);
    const emptyEl = modal.querySelector(EMPTY_SELECTOR);
    const refreshButtons = Array.prototype.slice.call(modal.querySelectorAll(REFRESH_SELECTOR));

    const apiBase = resolveApiBase();
    const items = new Map();

    let abortController = null;
    let isLoading = false;
    let modalVisible = !modal.classList.contains('hidden') && modal.getAttribute('aria-hidden') !== 'true';

    function setLoading(loading) {
      isLoading = Boolean(loading);
      if (loadingEl instanceof HTMLElement) {
        loadingEl.classList.toggle('hidden', !loading);
      }
      listEl.setAttribute('aria-busy', loading ? 'true' : 'false');
    }

    function setError(message) {
      if (!(errorEl instanceof HTMLElement)) {
        return;
      }

      if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      } else {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
      }
    }

    function updateEmptyState() {
      const hasItems = items.size > 0;
      if (emptyEl instanceof HTMLElement) {
        if (!hasItems && !isLoading) {
          emptyEl.classList.remove('hidden');
        } else {
          emptyEl.classList.add('hidden');
        }
      }
      if (hasItems) {
        listEl.classList.remove('hidden');
      } else if (!isLoading) {
        listEl.classList.add('hidden');
      }
    }

    function cancelPendingRequests() {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      setLoading(false);
    }

    function normalizeItem(data) {
      const id = normalizeId(data && (data.id || data.item_id || data.uuid));
      if (!id) {
        return null;
      }

      const name = pickString(
        data && data.name,
        data && data.title,
        data && data.item_name,
        data && data.display_name,
        data && data.label
      ) || 'Unbenanntes Item';

      const rarity = normalizeRarity(data || {});
      const creator = normalizeCreator(data || {});
      const versions = extractVersions(data || {});
      const hasDiff = Array.isArray(versions) && versions.length > 1;

      return {
        id,
        name,
        rarityLabel: rarity.label,
        rarityClass: rarity.className,
        creator,
        raw: data,
        hasDiff,
        diffCache: null,
      };
    }

    function createItemElement(item) {
      const element = doc.createElement('li');
      element.className = 'rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-sm shadow-emerald-500/10';
      element.dataset.moderationItem = 'true';
      element.setAttribute('data-moderation-item-id', item.id);

      const header = doc.createElement('div');
      header.className = 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between';

      const info = doc.createElement('div');
      info.className = 'space-y-2';

      const title = doc.createElement('p');
      title.className = 'text-base font-semibold text-slate-100';
      title.textContent = item.name;

      const meta = doc.createElement('div');
      meta.className = 'flex flex-wrap items-center gap-2 text-sm text-slate-400';

      const rarityBadge = doc.createElement('span');
      rarityBadge.className = 'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ' + item.rarityClass;
      rarityBadge.textContent = item.rarityLabel;

      const creator = doc.createElement('span');
      creator.className = 'text-xs text-slate-500';
      creator.textContent = 'Eingereicht von ' + item.creator;

      meta.append(rarityBadge, creator);
      info.append(title, meta);

      const actions = doc.createElement('div');
      actions.className = 'flex flex-col gap-2 sm:flex-row sm:flex-wrap';

      const publishButton = createActionButton('publish', 'Veröffentlichen', 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950');
      const rejectButton = createActionButton('reject', 'Ablehnen', 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300');

      actions.append(publishButton, rejectButton);
      header.append(info, actions);
      element.appendChild(header);

      if (item.hasDiff) {
        const toolsRow = doc.createElement('div');
        toolsRow.className = 'mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400';
        const diffButton = createActionButton(
          'diff',
          'Diff ansehen',
          'border border-slate-700/60 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-200',
          { showSpinner: false, size: 'sm' }
        );
        diffButton.setAttribute('aria-expanded', 'false');
        toolsRow.appendChild(diffButton);
        element.appendChild(toolsRow);
      }

      const diffContainer = doc.createElement('div');
      diffContainer.className = 'mt-3 hidden rounded-xl border border-slate-800/70 bg-slate-900/60 p-3 text-xs text-slate-300';
      diffContainer.dataset.moderationDiff = 'true';
      diffContainer.setAttribute('aria-live', 'polite');
      element.appendChild(diffContainer);

      return element;
    }

    function renderItems(data) {
      listEl.innerHTML = '';
      items.clear();

      const entries = Array.isArray(data) ? data : [];
      for (let index = 0; index < entries.length; index += 1) {
        const normalized = normalizeItem(entries[index]);
        if (!normalized) {
          continue;
        }
        items.set(normalized.id, normalized);
        listEl.appendChild(createItemElement(normalized));
      }

      updateEmptyState();
    }

    function setButtonLoading(button, loading) {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const spinner = button.querySelector(SPINNER_SELECTOR);
      const label = button.querySelector(LABEL_SELECTOR);

      if (loading) {
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
        button.setAttribute('aria-busy', 'true');
        if (spinner instanceof SVGElement) {
          spinner.classList.remove('hidden');
        }
        if (label instanceof HTMLElement) {
          label.classList.add('opacity-0');
        }
      } else {
        button.disabled = false;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
        button.removeAttribute('aria-busy');
        if (spinner instanceof SVGElement) {
          spinner.classList.add('hidden');
        }
        if (label instanceof HTMLElement) {
          label.classList.remove('opacity-0');
        }
      }
    }

    function removeItem(itemId) {
      const selectorId = escapeSelector(itemId);
      const element = listEl.querySelector('[data-moderation-item-id="' + selectorId + '"]');
      if (element instanceof HTMLElement) {
        element.remove();
      }
      items.delete(itemId);
      updateEmptyState();
    }

    function handleDiff(itemId, button) {
      const item = items.get(itemId);
      if (!item) {
        return;
      }

      const element = listEl.querySelector('[data-moderation-item-id="' + escapeSelector(itemId) + '"]');
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const diffContainer = element.querySelector(DIFF_CONTAINER_SELECTOR);
      if (!(diffContainer instanceof HTMLElement)) {
        showToast('Keine Versionsdaten verfügbar.', 'info');
        return;
      }

      if (!item.hasDiff) {
        diffContainer.textContent = 'Keine vorherige Version zum Vergleichen vorhanden.';
        diffContainer.classList.remove('hidden');
        if (button instanceof HTMLElement) {
          button.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      if (!item.diffCache) {
        item.diffCache = computeDiffEntries(item);
      }

      renderDiff(diffContainer, item.diffCache);

      const willShow = diffContainer.classList.contains('hidden');
      diffContainer.classList.toggle('hidden', !willShow);
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-expanded', willShow ? 'true' : 'false');
      }
    }

    function handleModerationAction(action, itemId, triggerButton) {
      const item = items.get(itemId);
      if (!item) {
        return;
      }

      const element = listEl.querySelector('[data-moderation-item-id="' + escapeSelector(itemId) + '"]');
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const relatedButtons = Array.prototype.slice.call(element.querySelectorAll(ACTION_SELECTOR));
      relatedButtons.forEach(function (button) {
        if (button !== triggerButton) {
          button.disabled = true;
        }
      });

      setButtonLoading(triggerButton, true);
      setError('');

      const endpoint = buildApiUrl(apiBase, '/items/' + encodeURIComponent(itemId));
      const headers = { Accept: 'application/json' };
      let requestInit;

      if (action === 'publish') {
        headers['Content-Type'] = 'application/json';
        requestInit = {
          method: 'PATCH',
          credentials: 'include',
          headers,
          body: JSON.stringify({ is_published: true }),
        };
      } else if (action === 'reject') {
        requestInit = {
          method: 'DELETE',
          credentials: 'include',
          headers,
        };
      } else {
        relatedButtons.forEach(function (button) {
          button.disabled = false;
        });
        setButtonLoading(triggerButton, false);
        return;
      }

      fetch(endpoint, requestInit)
        .then(function (response) {
          return parseJsonResponse(response).then(function (payload) {
            if (!response.ok) {
              throw createResponseError(
                payload,
                action === 'publish'
                  ? 'Item konnte nicht veröffentlicht werden.'
                  : 'Item konnte nicht abgelehnt werden.'
              );
            }
            return payload;
          });
        })
        .then(function () {
          const successMessage =
            action === 'publish'
              ? '„' + item.name + '“ wurde veröffentlicht.'
              : '„' + item.name + '“ wurde abgelehnt.';
          showToast(successMessage, action === 'publish' ? 'success' : 'warning');
          setButtonLoading(triggerButton, false);
          removeItem(itemId);
        })
        .catch(function (error) {
          if (isAbortError(error)) {
            return;
          }
          console.error('[moderation] Aktion ' + action + ' fehlgeschlagen.', error);
          const message =
            (error && error.message) ||
            (action === 'publish'
              ? 'Item konnte nicht veröffentlicht werden.'
              : 'Item konnte nicht abgelehnt werden.');
          setError(message);
          showToast(message, 'error');
          setButtonLoading(triggerButton, false);
          relatedButtons.forEach(function (button) {
            button.disabled = false;
          });
        });
    }

    function loadItems() {
      if (!modalVisible) {
        return;
      }

      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      abortController = new AbortController();
      setLoading(true);
      setError('');

      const url = buildApiUrl(apiBase, '/items', [['is_published', 'false']]);

      fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: abortController.signal,
      })
        .then(function (response) {
          return parseJsonResponse(response).then(function (payload) {
            if (!response.ok) {
              throw createResponseError(payload, 'Unveröffentlichte Items konnten nicht geladen werden.');
            }
            return payload;
          });
        })
        .then(function (payload) {
          const list = extractItems(payload);
          renderItems(list);
        })
        .catch(function (error) {
          if (isAbortError(error)) {
            return;
          }
          console.error('[moderation] Fehler beim Laden der Items.', error);
          const message = (error && error.message) || 'Unveröffentlichte Items konnten nicht geladen werden.';
          setError(message);
          updateEmptyState();
        })
        .finally(function () {
          if (abortController) {
            abortController = null;
          }
          setLoading(false);
        });
    }

    listEl.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest(ACTION_SELECTOR);
      if (!(button instanceof HTMLElement)) {
        return;
      }

      const action = button.getAttribute('data-moderation-action');
      const itemElement = button.closest(ITEM_SELECTOR);
      if (!(itemElement instanceof HTMLElement)) {
        return;
      }

      const itemId = itemElement.getAttribute('data-moderation-item-id');
      if (!itemId) {
        return;
      }

      event.preventDefault();

      if (action === 'diff') {
        handleDiff(itemId, button);
        return;
      }

      handleModerationAction(action, itemId, button);
    });

    refreshButtons.forEach(function (button) {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      button.addEventListener('click', function (event) {
        event.preventDefault();
        loadItems();
      });
    });

    function handleVisibilityChange() {
      const visible = !modal.classList.contains('hidden') && modal.getAttribute('aria-hidden') !== 'true';
      if (visible && !modalVisible) {
        modalVisible = true;
        loadItems();
      } else if (!visible && modalVisible) {
        modalVisible = false;
        cancelPendingRequests();
      }
    }

    const observer = new MutationObserver(function () {
      handleVisibilityChange();
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });

    function attachToModalApi() {
      const api = globalScope.ModerationModal;
      if (!api || typeof api.open !== 'function') {
        return false;
      }

      if (!api.__moderationEnhanced) {
        const originalOpen = api.open.bind(api);
        api.open = function patchedOpen(trigger) {
          const result = originalOpen(trigger);
          loadItems();
          return result;
        };

        if (typeof api.close === 'function') {
          const originalClose = api.close.bind(api);
          api.close = function patchedClose() {
            cancelPendingRequests();
            return originalClose.apply(this, arguments);
          };
        }

        api.__moderationEnhanced = true;
      }

      return true;
    }

    (function waitForModalApi(attempt) {
      if (attachToModalApi()) {
        return;
      }
      if (attempt > 25) {
        return;
      }
      globalScope.setTimeout(function () {
        waitForModalApi(attempt + 1);
      }, 150);
    })(0);

    if (modalVisible) {
      loadItems();
    }
  });
})();
