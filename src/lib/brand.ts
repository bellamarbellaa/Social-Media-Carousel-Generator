import { POPPINS_400_BASE64, POPPINS_600_BASE64, POPPINS_800_BASE64 } from "./fonts.generated.js";

// A warm, editorial color system — swap these for your own brand palette.
// Each color has exactly one job — don't reach for a new one.
// Each color has exactly one job — don't reach for a new one.
export const BRAND_COLORS = {
  yellow: "#F3EC50", // headlines only
  warmWhite: "#FAF7F5", // everything else inside the frame: body, hairlines, handle, CTA
  blush: "#FDB2D2", // outer frame border only — never text or an accent inside the frame
  inkStart: "#0A0A0A", // photo scrim gradient start
  inkEnd: "#2A2A2A", // photo scrim gradient end
} as const;

// Poppins only, three weights, three jobs (carousel-production.md — a three-font
// system was tried and rejected after checking against real published posts).
export const BRAND_FONTS = {
  headline: { family: "Poppins", weight: 800 },
  label: { family: "Poppins", weight: 600 },
  body: { family: "Poppins", weight: 400 },
} as const;

// Embedded as base64 so rendering never depends on network access to Google Fonts —
// Puppeteer in production has no network guarantee, and a failed font fetch would
// silently fall back to a system font instead of throwing.
export const FONT_FACE_CSS = `
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  src: url(data:font/woff2;base64,${POPPINS_400_BASE64}) format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  src: url(data:font/woff2;base64,${POPPINS_600_BASE64}) format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 800;
  src: url(data:font/woff2;base64,${POPPINS_800_BASE64}) format('woff2');
}
`;

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
export const FRAME_BORDER = 21; // 14px at the 720px reference size, scaled 1.5x to 1080px
