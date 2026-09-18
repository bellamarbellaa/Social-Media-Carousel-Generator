# Social Carousel Automation

A scheduled Trigger.dev automation that pulls the next queued topic from a Notion database,
generates a 5-slide Instagram carousel (AI copy + Pexels stock photo backdrops, rendered with
Puppeteer), and writes the finished slide PNGs plus caption back into that Notion page for
review. Every carousel lands in "Ready for Review" state for a human to check in Notion first —
nothing posts until you mark it `Reviewed`. Once a row is `Reviewed`, a nightly task publishes it
to Instagram via the Meta Graph API and flips it to `Posted`.

## How it works

1. A scheduled task (default: daily, 6.00 am Jakarta/Asia time) queries a Notion database for the first row with
   `Status = Queued`.
2. It generates 5 slides of copy via an OpenAI-compatible gateway, validated against a strict
   JSON schema.
3. For each slide, it searches Pexels for candidate stock photos and has the same gateway model
   pick the best match per slide from the candidates' descriptions.
4. It renders all 5 slides to PNG with Puppeteer, at 1080×1350 (Instagram's recommended feed
   resolution).
5. It uploads the PNGs and writes the caption/hashtags/photo credits back to the Notion page, also
   uploads each slide to a public Supabase Storage bucket, and flips its status to
   `Ready For Review`.
6. You review it in Notion and, when happy, change its status to `Reviewed`.
7. Each night (default: 20:00 Jakarta/Asia time), `carousel-publish-to-instagram` checks for the
   top `Reviewed` row. If one exists, it publishes the carousel to Instagram via the Meta Graph
   API's two-step container flow and flips the row to `Posted` with the live post URL. If none
   exists, it skips quietly — nothing posts that night.
8. A separate daily task, `carousel-refresh-ig-token`, keeps the Instagram access token (which
   expires after ~60 days) alive automatically, so posting doesn't silently break.

If you configure a logo (see below), a 6th static "follow for more" closing slide is appended
automatically. Without one, the carousel is just the 5 generated slides.

## Setup

1. **Notion — Carousel Queue**: create a database with these properties — `Topic` (title),
   `Pillar` (select), `Status` (status, must include `Queued`, `Ready For Review`, `Reviewed`, and
   `Posted` options at minimum), `Angle` (rich text, optional), `Priority` (number, optional),
   `Generated At` (date), `Run ID` (rich text), `Slide URLs` (rich text), `Full Caption`
   (rich text), `Instagram Post URL` (url), `Publish Error` (rich text). Share a Notion internal
   integration with the database.
2. **Notion — IG Token Store**: create a second database (anywhere in the same workspace) with a
   `Name` (title), `Access Token` (rich text), `Issued At` (date), `Status` (select: `OK`,
   `Needs Attention`), `Last Checked` (date), `Last Error` (rich text) — and one empty row in it.
   Share it with the same integration. This is where the live Instagram token lives; it gets
   updated automatically once you seed it (see step 5 below).
3. **Supabase Storage**: in an existing or new Supabase project, create a **public** bucket
   (Storage → New bucket → toggle "Public bucket") to hold rendered slides — e.g.
   `carousel-slides`. Grab your project URL and `service_role` key from Project Settings → API.
4. **Instagram API** (one-time, do this in a browser — this is Meta's newer standalone Instagram
   API with Instagram Login, not the older Facebook-Login-based one):
   1. Create an app at [developers.facebook.com](https://developers.facebook.com), choosing the
      "Manage messaging & content on Instagram" use case — this gives the app its own separate
      **Instagram app ID/secret**, shown on the app's "Instagram API" use case page.
   2. On that page, under **Permissions and features**, add `instagram_business_content_publish`
      (needed for posting — not included in the default messaging permission set).
   3. Under **2. Generate access tokens**, add your Instagram account and assign it the
      **Instagram Tester** role (Roles tab) — you then have to accept that invite from inside the
      Instagram app itself (Settings → Apps and websites). Then click **Generate token**.
   4. If the generated token is short-lived, exchange it for a long-lived one (~60 days):
      `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=<ig_app_secret>&access_token=<short_lived_token>`
   5. Get your Instagram professional account ID:
      `GET https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=<long_lived_token>`
      → `user_id` is your `IG_USER_ID`.
5. **Env vars**: `cp .env.example .env` and fill in your Gateway/Pexels/Notion/Supabase/Instagram
   credentials — the long-lived token from step 4.4 as `IG_ACCESS_TOKEN`, the Instagram app secret
   from step 4.1 as `IG_APP_SECRET`. The first run of `carousel-publish-to-instagram` or
   `carousel-refresh-ig-token` copies `IG_ACCESS_TOKEN` into the IG Token Store row automatically —
   after that, refreshing only ever needs the token itself, not the app secret.
6. **Brand config**: `cp src/lib/brand.config.example.ts src/lib/brand.config.ts` and fill in
   your voice/tone guidance. Optionally set `LOGO_DATA_URI`/`FOLLOW_BG_DATA_URI` (base64 data
   URIs) to enable the 6th closing slide.
7. **Trigger.dev**: `npx trigger.dev@latest login`, then `npx trigger.dev@latest init` to link a
   project (this fills in the `project` field in `trigger.config.ts`).
8. **Local dev**: `npx trigger.dev@latest dev`, then trigger `carousel-orchestrator` from the
   dashboard. Set `DRY_RUN=true` in `.env` to write rendered PNGs to `local-dry-run-output/`
   instead of touching Notion, for iterating on layout without spending real API calls. With
   `DRY_RUN=true`, `carousel-publish-to-instagram` also stops right before the final publish call
   so you can verify the container flow without posting for real.
9. **Deploy**: add every env var to the Trigger.dev dashboard (staging and prod), plus
   `PUPPETEER_EXECUTABLE_PATH` (needed only in the dashboard, not locally), then
   `npx trigger.dev@latest deploy`.

## Built with

- **[Trigger.dev v4](https://trigger.dev)** — TypeScript background task orchestration,
  scheduling, retries, and the orchestrator+processor pattern used across the pipeline stages
- **[Puppeteer](https://pptr.dev)** — headless Chrome rendering of HTML/CSS slide templates to PNG
- **[Notion API](https://developers.notion.com)** — the task queue, review workflow, file uploads
  back to the source page, and the live Instagram token store
- **[Pexels API](https://www.pexels.com/api/)** — stock photo search for slide backdrops
- **[Supabase Storage](https://supabase.com/storage)** — public hosting for rendered slides, since
  the Instagram Graph API needs a public `image_url` per slide
- **[Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform)**
  (Meta) — publishing the approved carousel and keeping the long-lived access token refreshed
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
src/trigger/carousel/    the 7 Trigger.dev tasks (orchestrator + 4 processors + 2 standalone)
src/lib/                 Notion/Pexels/gateway/Supabase/Instagram API clients, brand constants
src/lib/brand.config.ts  your brand identity (gitignored — copy from .example)
assets/fonts/            embedded font files (committed, generic default)
assets/brand/            your logo/background images (gitignored)
```

Each generation pipeline stage is a separate Trigger.dev task chained with `triggerAndWait`, so a
failure in one stage only retries that stage. If any stage fails after the row has been claimed,
its status resets to `Queued` rather than getting stuck. `carousel-publish-to-instagram` and
`carousel-refresh-ig-token` are independent scheduled tasks, not part of that chain — a publish
failure leaves the row at `Reviewed` with a `Publish Error` message instead of touching the
generation pipeline's state.
