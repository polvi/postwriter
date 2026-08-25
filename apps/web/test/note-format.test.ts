import { describe, expect, test } from 'bun:test';
import { elementCount, noteSchema } from '../worker/note-format';

const stroke = { kind: 'stroke', penColor: 0, penType: 1, thickness: 2, pts: [0, 0, 0.5, 0.5] };
const text = { kind: 'text', text: 'hi', fontSize: 24, rect: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.2 } };

function doc(overrides: Record<string, unknown> = {}) {
  return { v: 1, title: 'A note', isPortrait: true, emr: { width: 21632, height: 16224 }, pages: [{ elements: [stroke, text] }], ...overrides };
}

describe('note format', () => {
  test('accepts a well-formed note and fills defaults', () => {
    const r = noteSchema.safeParse(doc());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.pages[0]?.elements[0]).toMatchObject({ layer: 0 });
    expect(r.data.pages[0]?.elements[1]).toMatchObject({ textAlign: 0, textFrameWidthType: 1 });
    expect(elementCount(r.data)).toBe(2);
  });

  test('rejects odd point arrays, out-of-range coords, wrong version, empty notes', () => {
    expect(noteSchema.safeParse(doc({ pages: [{ elements: [{ ...stroke, pts: [0, 0, 1] }] }] })).success).toBe(false);
    expect(noteSchema.safeParse(doc({ pages: [{ elements: [{ ...stroke, pts: [0, 0, 2, 2] }] }] })).success).toBe(false);
    expect(noteSchema.safeParse(doc({ v: 2 })).success).toBe(false);
    expect(noteSchema.safeParse(doc({ pages: [] })).success).toBe(false);
    expect(noteSchema.safeParse(doc({ title: '  ' })).success).toBe(false);
  });

  test('an empty page is fine (blank pages are part of a note)', () => {
    expect(noteSchema.safeParse(doc({ pages: [{ elements: [] }] })).success).toBe(true);
  });
});
