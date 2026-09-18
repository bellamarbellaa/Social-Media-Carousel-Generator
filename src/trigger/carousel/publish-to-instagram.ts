import { schedules, logger } from "@trigger.dev/sdk";
import { getTopReviewedRow, markPosted, markPublishError } from "../../lib/notion.js";
import { getCurrentToken } from "../../lib/ig-token-store.js";
import {
  createChildContainer,
  createCarouselContainer,
  pollContainerStatus,
  publishContainer,
  getPermalink,
} from "../../lib/instagram.js";

export const publishToInstagram = schedules.task({
  id: "carousel-publish-to-instagram",
  cron: { pattern: "0 20 * * *", timezone: "Asia/Jakarta" }, // nightly — posts whatever's top of the Reviewed queue
  maxDuration: 300,
  run: async () => {
    const dryRun = process.env.DRY_RUN === "true";

    const row = await getTopReviewedRow();
    if (!row) {
      logger.info("No Reviewed rows found, skipping tonight's post.");
      return { skipped: "nothing-reviewed" };
    }

    if (row.slideUrls.length === 0) {
      const message = "Row has no Slide URLs — it wasn't published through the current pipeline.";
      logger.error(message, { pageId: row.pageId });
      await markPublishError(row.pageId, message);
      return { error: message };
    }

    try {
      const accessToken = await getCurrentToken();

      const childIds: string[] = [];
      for (const url of row.slideUrls) {
        childIds.push(await createChildContainer(url, accessToken));
      }

      const carouselId = await createCarouselContainer(childIds, row.fullCaption, accessToken);
      await pollContainerStatus(carouselId, accessToken);

      if (dryRun) {
        logger.info("DRY_RUN: carousel container ready, stopping before publish.", {
          pageId: row.pageId,
          carouselId,
          childIds,
        });
        return { dryRun: true, carouselId };
      }

      const mediaId = await publishContainer(carouselId, accessToken);
      const permalink = await getPermalink(mediaId, accessToken);

      await markPosted(row.pageId, permalink);
      return { topic: row.topic, permalink };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Instagram publish failed", { pageId: row.pageId, message });
      await markPublishError(row.pageId, message);
      throw error;
    }
  },
});
