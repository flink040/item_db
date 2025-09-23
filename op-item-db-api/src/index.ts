import { Hono } from "hono"


import { registerMetaRoutes, type MetaEnv } from "./routes/meta"


const DEFAULT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

const cors = (overrides: Record<string, string> = {}) => ({
  ...DEFAULT_CORS_HEADERS,
  "content-type": "application/json",
  ...overrides,
})

const app = new Hono<MetaEnv>()
app.get("/api/health", (c) => c.json({ ok: true }, 200, cors()))
registerMetaRoutes(app, { prefix: "/api" })
app.options("*", (c) =>
  c.text("", 204, cors({ "content-type": "text/plain; charset=UTF-8", "Access-Control-Max-Age": "600" }))
)

app.notFound((c) => {
  if (c.req.path === "/api" || c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404, cors())
  }

  return c.env.ASSETS.fetch(c.req.raw)
})

app.onError((err, c) => {
  console.error("[worker] unhandled error", err)
  return c.json({ error: "internal_error" }, 500, cors())
})

export default app
