import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import puppeteer from "puppeteer";
import { BRAND_COLORS, FONT_FACE_CSS, FRAME_BORDER, SLIDE_HEIGHT, SLIDE_WIDTH } from "../../lib/brand.js";
import { BRAND_HANDLE, LOGO_DATA_URI, FOLLOW_TAGLINE, FOLLOW_BG_DATA_URI } from "../../lib/brand.config.js";
import { SlideSchema } from "./types.js";
import type { RenderedSlide } from "./types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escapes HTML, then renders **bold** markers as <strong> and literal newlines as <br> —
 * the copy prompt intentionally uses both for rhythm/emphasis (see brand.config.ts's
 * VOICE_PROMPT), so this has to actually turn them into real formatting, not print
 * literal asterisks.
 */
function formatRichText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function dotsHtml(index: number, total: number): string {
  const dots = Array.from({ length: total }, (_, i) =>
    i === index
      ? `<div class="dot filled"></div>`
      : `<div class="dot"></div>`
  ).join("");
  return `<div class="dots">${dots}</div>`;
}

function dotsAllFilledHtml(total: number): string {
  const dots = Array.from({ length: total }, () => `<div class="dot filled"></div>`).join("");
  return `<div class="dots">${dots}</div>`;
}

function buildSlideHtml(
  slide: { kind: string; headline: string; body?: string },
  backdropDataUri: string,
  index: number,
  total: number
): string {
  const headline = formatRichText(slide.headline);
  const body = slide.body ? formatRichText(slide.body) : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${FONT_FACE_CSS}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; }
  body {
    background: ${BRAND_COLORS.blush};
    padding: ${FRAME_BORDER}px;
    font-family: 'Poppins', sans-serif;
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 24px;
    overflow: hidden;
  }
  .photo {
    position: absolute;
    inset: 0;
    background-image: url(${backdropDataUri});
    background-size: cover;
    background-position: center;
  }
  .scrim {
    position: absolute;
    inset: 0;
    /* Dusty Mauve → darker wine, same mood-backdrop gradient direction as the no-photo
       system — gives warm-white text reliable contrast even over a busy photo, instead of
       the old pure-ink scrim which was weakest exactly where the headline/body text sits. */
    background: linear-gradient(160deg,
      rgba(147,120,128,0.62) 0%,
      rgba(110,75,87,0.72) 100%);
  }
  .content {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 56px 64px;
    color: ${BRAND_COLORS.warmWhite};
  }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .handle {
    font-weight: 600;
    font-size: 22px;
    letter-spacing: 0.1em;
  }
  .rule {
    flex: 1;
    height: 1px;
    background: rgba(250,247,245,0.5);
  }
  .dots { display: flex; gap: 10px; }
  .dot {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid ${BRAND_COLORS.yellow};
  }
  .dot.filled { background: ${BRAND_COLORS.yellow}; }
  .middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    text-align: center;
  }
  .headline {
    font-weight: 800;
    color: ${BRAND_COLORS.yellow};
    font-size: 64px;
    line-height: 1.12;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .body-text {
    font-weight: 400;
    font-size: 34px;
    line-height: 1.4;
    text-wrap: balance;
  }
  .headline strong, .body-text strong {
    font-weight: 800; /* only 400/600/800 are embedded, so bold always maps to 800 */
    color: inherit;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .slide-num {
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.08em;
  }
  .arrow {
    width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid ${BRAND_COLORS.yellow};
    display: flex; align-items: center; justify-content: center;
    color: ${BRAND_COLORS.yellow};
    font-size: 20px;
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="photo"></div>
    <div class="scrim"></div>
    <div class="content">
      <div class="header">
        <div class="handle">${BRAND_HANDLE.toUpperCase()}</div>
        <div class="rule"></div>
        ${dotsHtml(index, total)}
      </div>
      <div class="middle">
        <div class="headline">${headline}</div>
        ${body ? `<div class="body-text">${body}</div>` : ""}
      </div>
      <div class="footer">
        <div class="slide-num">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
        <div class="arrow">&#8594;</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Static "follow for more" closer — not derived from generated copy or Pexels. Only rendered
 * when a logo is configured (see brand.config.ts); the generic template has no logo, so this
 * slide is skipped entirely and the carousel is just the 5 content slides.
 *
 * Background: the configured FOLLOW_BG_DATA_URI image (if set) under a light, translucent
 * warm-white wash — not a dark scrim like the content slides. The logo is predominantly black
 * text, so a dark overlay would hide it; the wash tames a busy background image while keeping
 * dark logo/text legible. Falls back to a solid blush fill if no background image is configured.
 */
function buildFollowSlideHtml(): string {
  const tagline = escapeHtml(FOLLOW_TAGLINE);
  const hasBg = Boolean(FOLLOW_BG_DATA_URI);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${FONT_FACE_CSS}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; }
  body {
    background: ${BRAND_COLORS.blush};
    padding: ${FRAME_BORDER}px;
    font-family: 'Poppins', sans-serif;
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 24px;
    overflow: hidden;
    background: ${BRAND_COLORS.blush};
  }
  .bg-photo {
    position: absolute;
    inset: 0;
    background-image: url(${FOLLOW_BG_DATA_URI});
    background-size: cover;
    background-position: center;
  }
  .wash {
    position: absolute;
    inset: 0;
    background: rgba(250, 247, 245, 0.78);
  }
  .content {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 56px 64px;
    color: ${BRAND_COLORS.inkStart};
  }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .handle {
    font-weight: 600;
    font-size: 22px;
    letter-spacing: 0.1em;
  }
  .rule {
    flex: 1;
    height: 1px;
    background: rgba(10,10,10,0.25);
  }
  .dots { display: flex; gap: 10px; }
  .dot {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid ${BRAND_COLORS.inkStart};
  }
  .dot.filled { background: ${BRAND_COLORS.inkStart}; }
  .middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 40px;
    text-align: center;
  }
  .logo {
    width: 58%;
    height: auto;
    display: block;
  }
  .tagline {
    font-weight: 600;
    font-size: 30px;
    line-height: 1.4;
    max-width: 780px;
    text-wrap: balance;
  }
  .footer {
    display: flex;
    justify-content: center;
  }
  .footer-handle {
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.08em;
  }
</style>
</head>
<body>
  <div class="frame">
    ${hasBg ? `<div class="bg-photo"></div><div class="wash"></div>` : ""}
    <div class="content">
      <div class="header">
        <div class="handle">${BRAND_HANDLE.toUpperCase()}</div>
        <div class="rule"></div>
        ${dotsAllFilledHtml(5)}
      </div>
      <div class="middle">
        <img class="logo" src="${LOGO_DATA_URI}" />
        <div class="tagline">${tagline}</div>
      </div>
      <div class="footer">
        <div class="footer-handle">${BRAND_HANDLE.toUpperCase()}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const renderSlides = schemaTask({
  id: "carousel-render-slides",
  schema: z.object({
    slides: z.array(SlideSchema),
    backdropDataUris: z.array(z.string()),
  }),
  run: async (payload): Promise<RenderedSlide[]> => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT });

      const rendered: RenderedSlide[] = [];
      const ordinals = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

      for (let i = 0; i < payload.slides.length; i++) {
        const slide = payload.slides[i]!;
        const backdrop = payload.backdropDataUris[i]!;
        const html = buildSlideHtml(slide, backdrop, i, payload.slides.length);
        await page.setContent(html, { waitUntil: "networkidle0" });
        const buffer = await page.screenshot({ type: "png" });
        rendered.push({
          filename: `${ordinals[i] ?? `Slide${i + 1}`}.png`,
          base64Png: Buffer.from(buffer).toString("base64"),
        });
      }

      // Static "follow for more" closer — only when a logo is configured (brand.config.ts).
      if (LOGO_DATA_URI) {
        await page.setContent(buildFollowSlideHtml(), { waitUntil: "networkidle0" });
        const followBuffer = await page.screenshot({ type: "png" });
        rendered.push({
          filename: `${ordinals[payload.slides.length] ?? `Slide${payload.slides.length + 1}`}.png`,
          base64Png: Buffer.from(followBuffer).toString("base64"),
        });
      }

      return rendered;
    } finally {
      await browser.close();
    }
  },
});
