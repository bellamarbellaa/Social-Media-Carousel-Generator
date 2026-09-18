import { schedules, logger } from "@trigger.dev/sdk";
import {
  getTokenAgeDays,
  getCurrentToken,
  saveRefreshedToken,
  markTokenRefreshFailed,
} from "../../lib/ig-token-store.js";
import { refreshLongLivedToken } from "../../lib/instagram.js";

// Meta long-lived tokens last ~60 days; refresh once they're 50+ days old.
const REFRESH_THRESHOLD_DAYS = 50;

export const refreshIgToken = schedules.task({
  id: "carousel-refresh-ig-token",
  cron: { pattern: "0 3 * * *", timezone: "Asia/Jakarta" },
  maxDuration: 60,
  run: async () => {
    try {
      const ageDays = await getTokenAgeDays();
      if (ageDays < REFRESH_THRESHOLD_DAYS) {
        logger.info(`IG token is ${ageDays.toFixed(1)} days old, not refreshing yet.`);
        return { skipped: "not-due", ageDays };
      }

      const currentToken = await getCurrentToken();
      const newToken = await refreshLongLivedToken(currentToken);
      await saveRefreshedToken(newToken);

      logger.info("IG access token refreshed.");
      return { refreshed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("IG token refresh failed", { message });
      await markTokenRefreshFailed(message);
      throw error;
    }
  },
});
