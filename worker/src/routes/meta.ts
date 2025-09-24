import { createClient } from '@supabase/supabase-js'
import type { Bindings } from '../bindings'

type MetaEnv = Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>
type ServiceRoleClient = ReturnType<typeof createClient<any, any>>

type PostgrestQueryResult<T> = {
  data: T[] | null
  error: { message?: string } | null
  status: number
}

const createServiceRoleClient = (env: MetaEnv): ServiceRoleClient =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

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

const executeListQuery = async <T>(
  env: MetaEnv,
  scope: string,
  queryBuilder: (client: ServiceRoleClient) => Promise<PostgrestQueryResult<T>>
): Promise<T[]> => {
  const client = createServiceRoleClient(env)
  const { data, error, status } = await queryBuilder(client)

  if (error) {
    throw createMetaError(scope, error, status)
  }
  return ensureArray(data)
}

export const fetchMaterialsList = (env: MetaEnv) =>
  executeListQuery(env, 'materials', (client) =>
    client
      .from('materials')
      .select('id, slug, label')
      .order('label', { ascending: true })
  )

export const fetchItemTypesList = (env: MetaEnv) =>
  executeListQuery(env, 'item_types', (client) =>
    client
      .from('item_types')
      .select('id, slug, label')
      .order('label', { ascending: true })
  )

export const fetchRaritiesList = (env: MetaEnv) =>
  executeListQuery(env, 'rarities', (client) =>
    client
      .from('rarities')
      .select('id, slug, label, sort')
      .order('sort', { ascending: true })
      .order('label', { ascending: true })
  )
