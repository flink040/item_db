import { Hono, type Context } from "hono"
import { createClient } from "@supabase/supabase-js"

import type { Bindings } from "../types"

type SupabaseClient = ReturnType<typeof createClient>

export type MetaEnv = {
  Bindings: Bindings
  Variables: {
    supabase?: SupabaseClient
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "content-type": "application/json",
} as const

const withCors = <T>(context: Context<MetaEnv>, payload: T, status = 200) =>
  context.json(payload, status, corsHeaders)

const resolveSupabaseClient = (c: Context<MetaEnv>) => {
  const cached = c.get("supabase") as SupabaseClient | undefined
  if (cached) {
    return cached
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = c.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials are not configured")
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  c.set("supabase", client)

  return client
}

const createListHandler = (table: string) => async (c: Context<MetaEnv>) => {
  let client: SupabaseClient
  try {
    client = resolveSupabaseClient(c)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase client unavailable"
    return withCors(c, { error: message }, 500)
  }

  try {
    const { data, error } = await client
      .from(table)
      .select("id, slug, label, sort")
      .order("sort", { ascending: true })

    if (error) {
      return withCors(c, { error: error.message }, 500)
    }

    return withCors(c, data ?? [], 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return withCors(c, { error: message }, 500)
  }
}

export const registerMetaRoutes = (app: Hono<MetaEnv>, options?: { prefix?: string }) => {
  const prefix = options?.prefix ?? ""
  const path = (segment: string) => `${prefix}${segment}`

  app.get(path("/rarities"), createListHandler("rarities"))
  app.get(path("/item_types"), createListHandler("item_types"))
  app.get(path("/materials"), createListHandler("materials"))
}

const meta = new Hono<MetaEnv>()
registerMetaRoutes(meta)

export default meta
