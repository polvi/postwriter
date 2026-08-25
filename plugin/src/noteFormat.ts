// Mirror of apps/web/worker/note-format.ts (types only; the worker owns the
// zod validator). Keep the two in sync when the format changes.

export const NOTE_FORMAT_VERSION = 1 as const;

export interface StrokeElement {
  kind: 'stroke';
  layer: number;
  penColor: number;
  penType: number;
  thickness: number;
  /** Flat [x0, y0, x1, y1, ...] in 0..1 of the EMR digitizer extent. */
  pts: number[];
  /** Optional per-point pressure, same length as pts/2. */
  prs?: number[];
}

export interface TextElement {
  kind: 'text';
  layer: number;
  text: string;
  fontSize: number;
  /** Text box rectangle in 0..1 of the page pixel size. */
  rect: { left: number; top: number; right: number; bottom: number };
  textAlign: number;
  textFrameWidthType: number;
}

export type NoteElement = StrokeElement | TextElement;

export interface NotePage {
  elements: NoteElement[];
}

export interface NoteDoc {
  v: typeof NOTE_FORMAT_VERSION;
  title: string;
  isPortrait: boolean;
  emr: { width: number; height: number };
  pages: NotePage[];
}

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  title: string;
  pages: number;
  bytes: number;
  created_at: string;
  delivered_at: string | null;
}

export interface UserInfo {
  login: string;
  name: string;
  last_seen?: string;
}
