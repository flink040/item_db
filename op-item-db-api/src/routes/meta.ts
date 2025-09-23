import { Hono, type Context } from "hono"
import { createClient } from "@supabase/supabase-js"

import type { Bindings } from "../types"

type MetaEnv = {
  Bindings: Bindings
  Variables: {
    supabase?: ReturnType<typeof createClient>
  }
}

const meta = new Hono<MetaEnv>()

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "content-type": "application/json",
} as const

const withCors = <T>(context: Context<MetaEnv>, payload: T, status = 200) =>
  context.json(payload, status, corsHeaders)

const resolveSupabaseClient = (c: Context<MetaEnv>) => {
  const cached = c.get("supabase")
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

const list = async (c: Context<MetaEnv>, table: string) => {
  let client
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

meta.get("/rarities", (c) => list(c, "rarities"))
meta.get("/item_types", (c) => list(c, "item_types"))
meta.get("/materials", (c) => list(c, "materials"))

export default meta
