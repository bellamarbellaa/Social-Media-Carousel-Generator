/**
 * Brand identity for this automation. Copy this file to `brand.config.ts` (gitignored) and fill
 * in your own values — your real branding never gets committed.
 */

export const BRAND_HANDLE = "@youraccount";

// Voice/tone guidance injected into the copy-generation prompt. Replace with your own brand
// voice — this is the main lever for how the generated copy actually sounds.
export const VOICE_PROMPT = `Write in a warm, direct, conversational voice. Speak directly to the
reader ("you"). Avoid corporate language and generic self-help clichés. Keep sentences short and
confident. Cover headline: a hook, not a summary. Body slides: one clear idea each. Outro: one
reflective line plus a soft, non-pushy call to action.`;

// Optional: a data URI (e.g. "data:image/png;base64,...") for your logo, PNG with a transparent
// background recommended. Leave undefined to skip the "follow for more" closing slide entirely —
// the carousel will just be the 5 generated content slides.
export const LOGO_DATA_URI: string | undefined = undefined;

// Tagline shown under the logo on the closing slide. Only used if LOGO_DATA_URI is set.
export const FOLLOW_TAGLINE = "Follow for more.";

// Optional: a data URI for a background image on the closing slide. Leave undefined to use a
// solid color fill instead.
export const FOLLOW_BG_DATA_URI: string | undefined = undefined;
