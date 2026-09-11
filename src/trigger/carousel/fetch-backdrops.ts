import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { getBackdrops } from "../../lib/pexels.js";
import type { Backdrop } from "./types.js";

export const fetchBackdrops = schemaTask({
  id: "carousel-fetch-backdrops",
  schema: z.object({
    queries: z.array(z.string()),
    context: z.array(z.object({ headline: z.string(), body: z.string().optional() })),
  }),
  run: async (payload): Promise<Backdrop[]> => {
    return getBackdrops(payload.queries, payload.context);
  },
});
