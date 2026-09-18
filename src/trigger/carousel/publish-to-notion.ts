import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendCarouselContent, savePublishMetadata, type PhotoCredit } from "../../lib/notion.js";
import { uploadImage } from "../../lib/supabase-storage.js";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

export const publishToNotion = schemaTask({
  id: "carousel-publish-to-notion",
  schema: z.object({
    pageId: z.string(),
    topic: z.string(),
    slides: z.array(z.object({ filename: z.string(), base64Png: z.string() })),
    caption: z.string(),
    hashtags: z.array(z.string()),
    credits: z.array(
      z.object({ photographer: z.string(), photographerUrl: z.string(), pexelsUrl: z.string() })
    ),
  }),
  run: async (payload) => {
    const dryRun = process.env.DRY_RUN === "true";

    if (dryRun) {
      const dir = join(process.cwd(), "local-dry-run-output", slugify(payload.topic));
      await mkdir(dir, { recursive: true });
      for (const slide of payload.slides) {
        await writeFile(join(dir, slide.filename), Buffer.from(slide.base64Png, "base64"));
      }
      await writeFile(
        join(dir, "caption.txt"),
        [payload.caption, "", payload.hashtags.join(" "), "", "Credits:", ...payload.credits.map(
          (c: PhotoCredit) => `${c.photographer} — ${c.pexelsUrl}`
        )].join("\n")
      );
      return { dryRun: true, outputDir: dir };
    }

    await appendCarouselContent(
      payload.pageId,
      payload.slides.map((s) => ({ buffer: Buffer.from(s.base64Png, "base64"), filename: s.filename })),
      payload.caption,
      payload.hashtags,
      payload.credits
    );

    const slug = slugify(payload.topic);
    const slideUrls = await Promise.all(
      payload.slides.map((s) => uploadImage(Buffer.from(s.base64Png, "base64"), `${slug}/${s.filename}`))
    );
    const fullCaption = [payload.caption, "", payload.hashtags.join(" ")].join("\n");
    await savePublishMetadata(payload.pageId, slideUrls, fullCaption);

    return { dryRun: false };
  },
});
