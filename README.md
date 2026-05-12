# Coffee Cantonese Subtitle Translator

Local browser-accessed app that translates Cantonese `.srt` subtitle files into
natural contemporary spoken English for the **Entrebox (集氣箱)** YouTube channel.

See the plan file at `/root/.claude/plans/i-have-been-talking-shiny-storm.md`
for the full design.

## Layout

```
server/   Hono + better-sqlite3 + @google/genai
web/      Vite + React 19 + Tailwind v4
shared/   Shared TypeScript types
data/     SQLite DB + plaintext config.json (gitignored)
```

## Requirements

- Node.js 22 LTS
- pnpm (or npm)

## First-time setup

```bash
pnpm install -C server
pnpm install -C web
```

If you see `better-sqlite3` errors at startup, rebuild it against your Node:

```bash
pnpm rebuild -C server better-sqlite3
```

## Run

Two processes — server on `:3001`, Vite dev server on `:5173`:

```bash
pnpm -C server dev      # tsx watch src/index.ts
pnpm -C web dev         # Vite, proxies /api → :3001
```

Open http://localhost:5173.

## Configuration

On first run, go to **Settings** and enter:

- Gemini API key (stored plaintext in `data/config.json`)
- Library folder (absolute path containing `.srt` files)

## Threat model

This is a **single-user local-only** tool. The Gemini API key is stored as
plaintext in `data/config.json`. The trust boundary is your filesystem: anyone
who can read `data/` can read the key. This matches the convention of tools
like `npm` (`~/.npmrc`), `gcloud`, and VS Code settings. If you need stronger
guarantees, do not run this tool.

`data/` is gitignored. Do not commit anything from it.

## Tests

```bash
pnpm -C server test     # vitest
```
