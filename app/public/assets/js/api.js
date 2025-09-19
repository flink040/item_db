const CONFIG = Object.freeze({
  API_BASE: '/api',
  SUPABASE_URL: null,
  SUPABASE_ANON_KEY: null,
});

const ALL_ITEMS_PAGE_SIZE = Number.POSITIVE_INFINITY;

let supabaseClientPromise = null;
let supabaseConfigSignature = null;

const MOCK_AUTH_DELAY_MS = 180;
let mockAuthenticatedUser = null;

function sanitizeConfigString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return sanitizeConfigString(String(value));
}

function waitForAuth(duration = MOCK_AUTH_DELAY_MS) {
  const numeric = Number.isFinite(duration) ? Math.max(0, Math.min(600, Math.floor(duration))) : 0;
  if (numeric <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, numeric);
  });
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function resolveDisplayName(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    return 'Demo Nutzer';
  }

  const candidates = ['displayName', 'name', 'username'];
  for (const key of candidates) {
    const candidate = normalizeOptionalString(credentials[key]);
    if (candidate) {
      return candidate;
    }
  }

  const emailCandidate = normalizeOptionalString(credentials.email);
  if (emailCandidate) {
    const [localPart] = emailCandidate.split('@');
    if (localPart && localPart.trim().length > 0) {
      return localPart.trim();
    }
  }

  return 'Demo Nutzer';
}

function cloneUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const clone = {
    id: normalizeOptionalString(user.id) || 'mock-user',
    displayName: normalizeOptionalString(user.displayName) || 'Demo Nutzer',
  };

  const username = normalizeOptionalString(user.username ?? user.name);
  if (username) {
    clone.username = username;
  }

  const email = normalizeOptionalString(user.email);
  if (email) {
    clone.email = email;
  }

  return clone;
}

function createMockUser(credentials) {
  const displayName = resolveDisplayName(credentials);
  const username = normalizeOptionalString(credentials?.username ?? credentials?.name);
  const email = normalizeOptionalString(credentials?.email);

  const user = {
    id: 'mock-user',
    displayName,
  };

  if (username) {
    user.username = username;
  }

  if (email) {
    user.email = email;
  }

  return user;
}

function readRuntimeConfig() {
  const runtime = typeof globalThis !== 'undefined' ? globalThis.APP_CONFIG : null;
  const overrides = {};

  if (runtime && typeof runtime === 'object') {
    if ('API_BASE' in runtime) {
      const apiBase = sanitizeConfigString(runtime.API_BASE);
      if (apiBase) {
        overrides.API_BASE = apiBase;
      }
    }

    if ('SUPABASE_URL' in runtime) {
      const supabaseUrl = sanitizeConfigString(runtime.SUPABASE_URL);
      if (supabaseUrl) {
        overrides.SUPABASE_URL = supabaseUrl;
      }
    }

    if ('SUPABASE_ANON_KEY' in runtime) {
      const supabaseAnonKey = sanitizeConfigString(runtime.SUPABASE_ANON_KEY);
      if (supabaseAnonKey) {
        overrides.SUPABASE_ANON_KEY = supabaseAnonKey;
      }
    }
  }

  return {
    API_BASE: overrides.API_BASE ?? CONFIG.API_BASE,
    SUPABASE_URL: overrides.SUPABASE_URL ?? CONFIG.SUPABASE_URL,
    SUPABASE_ANON_KEY: overrides.SUPABASE_ANON_KEY ?? CONFIG.SUPABASE_ANON_KEY,
  };
}

function getResolvedConfig() {
  return readRuntimeConfig();
}

function hasSupabaseConfig(config = getResolvedConfig()) {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
}

function toError(error, fallbackMessage) {
  if (error instanceof Error) {
    if (!error.message && fallbackMessage) {
      error.message = fallbackMessage;
    }
    return error;
  }

  const message =
    typeof error === 'string' && error.trim().length > 0 ? error.trim() : fallbackMessage || 'Unbekannter Fehler.';
  const fallbackError = new Error(message);

  if (error && typeof error === 'object') {
    try {
      fallbackError.cause = error;
    } catch {
      // Ignoriere Fälle, in denen cause nicht gesetzt werden kann.
    }
  }

  return fallbackError;
}

function sanitizeFilters(filters) {
  const sanitized = {};

  if (!filters || typeof filters !== 'object') {
    return sanitized;
  }

  Object.entries(filters).forEach(([key, value]) => {
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

function normalizeListOptions(options = {}) {
  const rawPage = options.page ?? 1;
  const numericPage = Number(rawPage);
  if (!Number.isFinite(numericPage) || numericPage < 1) {
    throw new Error('Ungültige Seitenzahl.');
  }

  const rawPageSize = options.pageSize ?? 6;
  const allowAll = rawPageSize === ALL_ITEMS_PAGE_SIZE;
  const numericPageSize = allowAll ? ALL_ITEMS_PAGE_SIZE : Number(rawPageSize);
  if (!allowAll && (!Number.isFinite(numericPageSize) || numericPageSize < 1)) {
    throw new Error('Ungültige Seitengröße.');
  }

  const search = typeof options.search === 'string' ? options.search.trim() : '';
  const filters = sanitizeFilters(options.filters);

  return {
    page: Math.floor(numericPage),
    pageSize: allowAll ? ALL_ITEMS_PAGE_SIZE : Math.floor(numericPageSize),
    allowAll,
    search,
    filters,
  };
}

function applyPagination(items, options) {
  const source = Array.isArray(items) ? items : [];
  const total = source.length;

  if (options.allowAll) {
    return {
      items: source.slice(),
      total,
      page: options.page,
      pageSize: ALL_ITEMS_PAGE_SIZE,
    };
  }

  if (total === 0) {
    return {
      items: [],
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  const startIndex = (options.page - 1) * options.pageSize;
  if (startIndex >= total) {
    return {
      items: [],
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  const endIndex = startIndex + options.pageSize;
  return {
    items: source.slice(startIndex, endIndex),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

function buildSearchParams(options) {
  const params = new URLSearchParams();

  if (options.search) {
    params.set('search', options.search);
  }

  Object.entries(options.filters).forEach(([key, value]) => {
    params.set(key, String(value));
  });

  if (!options.allowAll) {
    params.set('page', String(options.page));
    params.set('pageSize', String(options.pageSize));
  }

  return params;
}

function buildApiUrl(path) {
  const { API_BASE } = getResolvedConfig();
  const base = typeof API_BASE === 'string' && API_BASE.length > 0 ? API_BASE : CONFIG.API_BASE;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function fetchFromApi(path, options = {}) {
  const urlBase = buildApiUrl(path);
  const query = options.searchParams ? options.searchParams.toString() : '';
  const url = query ? `${urlBase}?${query}` : urlBase;

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API-Request fehlgeschlagen (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Ungültige API-Antwort.');
  }

  return response.json();
}

async function fetchItemsFromApi(options) {
  const searchParams = buildSearchParams(options);
  const payload = await fetchFromApi('/items', { searchParams });

  let items = null;
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) {
      items = payload.items;
    } else if (Array.isArray(payload.data)) {
      items = payload.data;
    }
  }

  if (!Array.isArray(items)) {
    throw new Error('Ungültige API-Antwort.');
  }

  const result = applyPagination(items, options);
  const total = typeof payload?.total === 'number' ? payload.total : result.total;

  return {
    items: result.items,
    total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

async function createSupabaseClient(url, anonKey) {
  try {
    const supabaseModule = await import('https://esm.sh/@supabase/supabase-js@2');
    const { createClient } = supabaseModule ?? {};
    if (typeof createClient !== 'function') {
      throw new Error('Supabase SDK konnte nicht geladen werden.');
    }
    return createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  } catch (error) {
    throw toError(error, 'Supabase SDK konnte nicht geladen werden.');
  }
}

async function getSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getResolvedConfig();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const signature = `${SUPABASE_URL}::${SUPABASE_ANON_KEY}`;
  if (!supabaseClientPromise || supabaseConfigSignature !== signature) {
    supabaseConfigSignature = signature;
    supabaseClientPromise = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY).catch((error) => {
      supabaseClientPromise = null;
      supabaseConfigSignature = null;
      throw error;
    });
  }

  return supabaseClientPromise;
}

async function fetchItemsFromSupabase(options) {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Supabase ist nicht konfiguriert.');
  }

  const { data, error, count } = await client.from('items').select('*', { count: 'exact', head: false });
  if (error) {
    throw error;
  }

  const items = Array.isArray(data) ? data : [];
  const result = applyPagination(items, options);
  const total = typeof count === 'number' ? count : result.total;

  return {
    items: result.items,
    total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

function normalizeItemId(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const normalized = typeof value === 'string' ? value.trim() : String(value).trim();
  return normalized;
}

async function fetchItemByIdFromApi(id) {
  const url = buildApiUrl(`/items/${encodeURIComponent(id)}`);
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });

  if (response.status === 404) {
    throw new Error('Item wurde nicht gefunden.');
  }

  if (!response.ok) {
    throw new Error(`API-Request fehlgeschlagen (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Ungültige API-Antwort.');
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    throw new Error('Ungültige API-Antwort.');
  }

  return payload;
}

async function fetchItemByIdFromSupabase(id) {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Supabase ist nicht konfiguriert.');
  }

  const byId = await client.from('items').select('*').eq('id', id).maybeSingle();
  if (byId.error) {
    throw byId.error;
  }
  if (byId.data) {
    return byId.data;
  }

  const bySlug = await client.from('items').select('*').eq('slug', id).maybeSingle();
  if (bySlug.error) {
    throw bySlug.error;
  }
  if (bySlug.data) {
    return bySlug.data;
  }

  throw new Error('Item wurde nicht gefunden.');
}

export async function getItems(options = {}) {
  const normalizedOptions = normalizeListOptions(options);
  let supabaseError = null;

  if (hasSupabaseConfig()) {
    try {
      return await fetchItemsFromSupabase(normalizedOptions);
    } catch (error) {
      supabaseError = toError(error, 'Die Items konnten nicht geladen werden.');
    }
  }

  try {
    return await fetchItemsFromApi(normalizedOptions);
  } catch (error) {
    const apiError = toError(error, 'Die Items konnten nicht geladen werden.');
    if (supabaseError) {
      try {
        apiError.cause = supabaseError;
      } catch {
        // Ignoriere Fälle, in denen cause nicht gesetzt werden kann.
      }
    }
    throw apiError;
  }
}

export async function getItemById(id) {
  const normalizedId = normalizeItemId(id);
  if (!normalizedId) {
    throw new Error('Eine Item-ID ist erforderlich.');
  }

  let supabaseError = null;

  if (hasSupabaseConfig()) {
    try {
      return await fetchItemByIdFromSupabase(normalizedId);
    } catch (error) {
      supabaseError = toError(error, 'Item konnte nicht geladen werden.');
    }
  }

  try {
    return await fetchItemByIdFromApi(normalizedId);
  } catch (error) {
    const apiError = toError(error, 'Item konnte nicht geladen werden.');
    if (supabaseError) {
      try {
        apiError.cause = supabaseError;
      } catch {
        // Ignoriere Fälle, in denen cause nicht gesetzt werden kann.
      }
    }
    throw apiError;
  }
}

export const loadItemById = getItemById;

export async function login(credentials = {}) {
  await waitForAuth();
  mockAuthenticatedUser = createMockUser(credentials);
  return cloneUser(mockAuthenticatedUser);
}

export async function logout() {
  await waitForAuth(Math.floor(MOCK_AUTH_DELAY_MS / 2));
  mockAuthenticatedUser = null;
  return true;
}

export async function getUser() {
  await Promise.resolve();
  return cloneUser(mockAuthenticatedUser);
}
