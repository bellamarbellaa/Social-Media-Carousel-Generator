# Social Carousel Automation

A scheduled Trigger.dev automation that pulls the next queued topic from a Notion database,
generates a 5-slide Instagram carousel (AI copy + Pexels stock photo backdrops, rendered with
Puppeteer), and writes the finished slide PNGs plus caption back into that Notion page for
review. Nothing is auto-published — every carousel lands in "Ready for Review" for a human to
check before it goes anywhere.

## How it works

1. A scheduled task (default: daily) queries a Notion database for the highest-priority row with
   `Status = Queued`.
2. It generates 5 slides of copy via an OpenAI-compatible gateway, validated against a strict
   JSON schema.
3. For each slide, it searches Pexels for candidate stock photos and has the same gateway model
   pick the best match per slide from the candidates' descriptions.
4. It renders all 5 slides to PNG with Puppeteer, at 1080×1350 (Instagram's recommended feed
   resolution).
5. It uploads the PNGs and writes the caption/hashtags/photo credits back to the Notion page, and
   flips its status to `Ready For Review`.

If you configure a logo (see below), a 6th static "follow for more" closing slide is appended
automatically. Without one, the carousel is just the 5 generated slides.

## Setup

1. **Notion**: create a database with these properties — `Topic` (title), `Pillar` (select),
   `Status` (status, must include a `Queued` and a `Ready For Review` option at minimum),
   `Angle` (rich text, optional), `Priority` (number, optional), `Generated At` (date),
   `Run ID` (rich text). Share a Notion internal integration with the database.
2. **Env vars**: `cp .env.example .env` and fill in your Gateway/Pexels/Notion credentials.
3. **Brand config**: `cp src/lib/brand.config.example.ts src/lib/brand.config.ts` and fill in
   your voice/tone guidance. Optionally set `LOGO_DATA_URI`/`FOLLOW_BG_DATA_URI` (base64 data
   URIs) to enable the 6th closing slide.
4. **Trigger.dev**: `npx trigger.dev@latest login`, then `npx trigger.dev@latest init` to link a
   project (this fills in the `project` field in `trigger.config.ts`).
5. **Local dev**: `npx trigger.dev@latest dev`, then trigger `carousel-orchestrator` from the
   dashboard. Set `DRY_RUN=true` in `.env` to write rendered PNGs to `local-dry-run-output/`
   instead of touching Notion, for iterating on layout without spending real API calls.
6. **Deploy**: add every env var to the Trigger.dev dashboard (staging and prod), plus
   `PUPPETEER_EXECUTABLE_PATH` (needed only in the dashboard, not locally), then
   `npx trigger.dev@latest deploy`.

## Built with

- **[Trigger.dev v4](https://trigger.dev)** — TypeScript background task orchestration,
  scheduling, retries, and the orchestrator+processor pattern used across the 5 pipeline stages
- **[Puppeteer](https://pptr.dev)** — headless Chrome rendering of HTML/CSS slide templates to PNG
- **[Notion API](https://developers.notion.com)** — the task queue, review workflow, and file
  uploads back to the source page
- **[Pexels API](https://www.pexels.com/api/)** — stock photo search for slide backdrops
- **An OpenAI-compatible LLM gateway** — copy generation and backdrop selection, model swappable
  via one env var (`GATEWAY_MODEL`)
- **[Zod](https://zod.dev)** — runtime schema validation on LLM output, so a malformed response
  gets retried instead of rendering a broken carousel
- **TypeScript** end to end

Built with **[Claude Code](https://claude.com/claude-code)** (Anthropic's AI coding agent) as a
pair-programming partner throughout — architecture, implementation, and the iterative
prompt/rendering refinement that shaped the final voice and layout.

## Project structure

```
src/trigger/carousel/    the 5 Trigger.dev tasks (orchestrator + 4 processors)
src/lib/                 Notion/Pexels/gateway API clients, brand constants
src/lib/brand.config.ts  your brand identity (gitignored — copy from .example)
assets/fonts/            embedded font files (committed, generic default)
assets/brand/            your logo/background images (gitignored)
```

Each pipeline stage is a separate Trigger.dev task chained with `triggerAndWait`, so a failure in
one stage only retries that stage. If any stage fails after the row has been claimed, its status
resets to `Queued` rather than getting stuck.
