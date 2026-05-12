import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { getDb } from "./db.ts";
import { configRoute } from "./routes/config.ts";
import { episodesRoute } from "./routes/episodes.ts";
import { linesRoute } from "./routes/lines.ts";
import { pipelineRoute } from "./routes/pipeline.ts";
import { usageRoute } from "./routes/usage.ts";

// Force-initialise the DB on boot so migrations run before any request lands.
getDb();

const app = new Hono();
app.use("*", cors({ origin: "http://localhost:5173" }));

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/config", configRoute);
app.route("/api/episodes", episodesRoute);
app.route("/api/lines", linesRoute);
app.route("/api", pipelineRoute);
app.route("/api/usage", usageRoute);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`coffee-subs server listening on http://localhost:${port}`);
});
