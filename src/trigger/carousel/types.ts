import { z } from "zod";

export const SlideSchema = z.object({
  kind: z.enum(["cover", "body", "outro"]),
  headline: z.string(),
  body: z.string().optional(),
  searchQuery: z.string(),
});

export const GeneratedCopySchema = z.object({
  slides: z.array(SlideSchema).length(5),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

export type Slide = z.infer<typeof SlideSchema>;
export type GeneratedCopy = z.infer<typeof GeneratedCopySchema>;

export interface Backdrop {
  dataUri: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export interface RenderedSlide {
  filename: string;
  base64Png: string;
}
