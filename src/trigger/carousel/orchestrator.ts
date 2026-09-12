import { schedules, logger } from "@trigger.dev/sdk";
import { generateCopy } from "./generate-copy.js";
import { fetchBackdrops } from "./fetch-backdrops.js";
import { renderSlides } from "./render-slides.js";
import { publishToNotion } from "./publish-to-notion.js";
import {
  countReadyForReview,
  getTopQueuedRow,
  claimRow,
  resetToQueued,
  markReadyForReview,
} from "../../lib/notion.js";

const READY_FOR_REVIEW_CAP = 5;

export const carouselOrchestrator = schedules.task({
  id: "carousel-orchestrator",
  cron: { pattern: "0,5,10 6 * * *", timezone: "Asia/Jakarta" }, // 3 runs: 06:00, 06:05, 06:10
  maxDuration: 900, // waits on every downstream stage via triggerAndWait
  run: async (_payload, { ctx }) => {
    const dryRun = process.env.DRY_RUN === "true";

    const readyCount = await countReadyForReview();
    if (readyCount > READY_FOR_REVIEW_CAP) {
      logger.info(`Ready For Review already has ${readyCount} rows (cap ${READY_FOR_REVIEW_CAP}), skipping run.`);
      return { skipped: "ready-for-review-cap" };
    }

    const row = await getTopQueuedRow();
    if (!row) {
      logger.info("No Queued rows found, exiting.");
      return { skipped: "nothing-queued" };
    }

    if (!dryRun) {
      await claimRow(row.pageId, ctx.run.id);
    }

    try {
      const copy = await generateCopy.triggerAndWait({
        topic: row.topic,
        pillar: row.pillar,
        angle: row.angle,
      }).unwrap();

      const backdrops = await fetchBackdrops.triggerAndWait({
        queries: copy.slides.map((s) => s.searchQuery),
        context: copy.slides.map((s) => ({ headline: s.headline, body: s.body })),
      }).unwrap();

      const rendered = await renderSlides.triggerAndWait({
        slides: copy.slides,
        backdropDataUris: backdrops.map((b) => b.dataUri),
      }).unwrap();

      await publishToNotion.triggerAndWait({
        pageId: row.pageId,
        topic: row.topic,
        slides: rendered,
        caption: copy.caption,
        hashtags: copy.hashtags,
        credits: backdrops.map((b) => ({
          photographer: b.photographer,
          photographerUrl: b.photographerUrl,
          pexelsUrl: b.pexelsUrl,
        })),
      }).unwrap();

      if (!dryRun) {
        await markReadyForReview(row.pageId);
      }

      return { topic: row.topic, dryRun };
    } catch (error) {
      if (!dryRun) {
        await resetToQueued(row.pageId);
      }
      throw error;
    }
  },
});
