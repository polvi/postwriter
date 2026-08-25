// The wire format of a sent note. The Supernote SDK exposes note content
// only as per-page elements (there is no raw .note read), so a "note" here
// is pages of strokes and text boxes with geometry normalised to 0..1 so it
// lands correctly on a recipient device with a different digitizer size.
//
// plugin/src/noteFormat.ts mirrors these types (types only, no zod) so the
// React Native bundle does not pull in the validator.

import { z } from 'zod';

export const NOTE_FORMAT_VERSION = 1;
/** Hard cap on a serialised note; a few thousand strokes is ~1 MB. */
export const MAX_NOTE_BYTES = 20 * 1024 * 1024;

const unit = z.number().min(0).max(1);

const strokeSchema = z.object({
  kind: z.literal('stroke'),
  layer: z.number().int().min(0).max(3).default(0),
  penColor: z.number().int(),
  penType: z.number().int(),
  thickness: z.number(),
  /** Flat [x0, y0, x1, y1, ...] in 0..1 of the EMR digitizer extent. */
  pts: z.array(unit).min(4).refine((a) => a.length % 2 === 0, 'pts must be x,y pairs'),
  /** Optional per-point pressure, same length as pts/2. */
  prs: z.array(z.number().int().min(0)).optional(),
});

const textSchema = z.object({
  kind: z.literal('text'),
  layer: z.number().int().min(0).max(3).default(0),
  text: z.string().max(100_000),
  fontSize: z.number().positive(),
  /** Text box rectangle in 0..1 of the page pixel size. */
  rect: z.object({ left: unit, top: unit, right: unit, bottom: unit }),
  textAlign: z.number().int().default(0),
  textFrameWidthType: z.number().int().default(1),
});

export const elementSchema = z.discriminatedUnion('kind', [strokeSchema, textSchema]);

export const pageSchema = z.object({
  elements: z.array(elementSchema).max(50_000),
});

export const noteSchema = z.object({
  v: z.literal(NOTE_FORMAT_VERSION),
  title: z.string().trim().min(1).max(120),
  isPortrait: z.boolean(),
  /** Sender's digitizer extent, informational (points are already normalised). */
  emr: z.object({ width: z.number().positive(), height: z.number().positive() }),
  pages: z.array(pageSchema).min(1).max(500),
});

export type NoteDoc = z.infer<typeof noteSchema>;
export type NoteElement = z.infer<typeof elementSchema>;

export function elementCount(note: NoteDoc): number {
  return note.pages.reduce((n, p) => n + p.elements.length, 0);
}
