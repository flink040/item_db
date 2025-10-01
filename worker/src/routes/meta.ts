import type { Bindings } from '../bindings'

type MetaEnv = Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>

type MetaFetchResult<T> = {
  status: number
  data: T[]
  etag: string | null
}

type FetchOptions = {
  ifNoneMatch?: string | null
}

const ensureArray = <T>(rows: T[] | null | undefined): T[] =>
  Array.isArray(rows) ? rows : []

const createMetaError = (scope: string, error: unknown, status: number) => {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: string }).message === 'string'
      ? (error as { message?: string }).message || `Fehler beim Laden von ${scope}.`
      : `Fehler beim Laden von ${scope}.`

  return Object.assign(new Error(message), {
    cause: error ?? undefined,
    status: status || 500,
    scope,
  })
}

const fetchMeta = async <T>(env: MetaEnv, scope: string, path: string, options?: FetchOptions) => {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const headers = new Headers({
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  })

  if (options?.ifNoneMatch) {
    headers.set('If-None-Match', options.ifNoneMatch)
  }

  const response = await fetch(url, { headers })

  if (response.status === 304) {
    return { status: 304, data: [] as T[], etag: response.headers.get('etag') }
  }

  if (!response.ok) {
    const error = await response
      .clone()
      .json()
      .catch(() => ({ message: response.statusText }))
    throw createMetaError(scope, error, response.status)
  }

  const payload = await response.json()
  return {
    status: response.status,
    data: ensureArray(payload),
    etag: response.headers.get('etag'),
  }
}

export const fetchMaterialsList = (
  env: MetaEnv,
  options?: FetchOptions
): Promise<MetaFetchResult<{ id: number; slug: string; label: string }>> =>
  fetchMeta(env, 'materials', 'materials?select=id,slug,label&order=label.asc', options)

export const fetchItemTypesList = (
  env: MetaEnv,
  options?: FetchOptions
): Promise<MetaFetchResult<{ id: number; slug: string; label: string }>> =>
  fetchMeta(env, 'item_types', 'item_types?select=id,slug,label&order=label.asc', options)

export const fetchRaritiesList = (
  env: MetaEnv,
  options?: FetchOptions
): Promise<MetaFetchResult<{ id: number; slug: string; label: string; sort?: number }>> =>
  fetchMeta(
    env,
    'rarities',
    'rarities?select=id,slug,label,sort&order=sort.asc&order=label.asc',
    options
  )
