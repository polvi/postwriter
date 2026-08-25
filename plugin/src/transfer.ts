/**
 * Note <-> wire format. The SDK exposes a note only as per-page elements
 * whose point data lives in native memory behind lazy accessors, so
 * "reading a note" is materialising every stroke's points, and "writing" is
 * creating elements and pushing points back through the same accessors.
 */

import type { Element } from 'sn-plugin-lib';
import { device, getEmrSize } from './device';
import type { NoteDoc, NoteElement, NotePage, StrokeElement, TextElement } from './noteFormat';
import { NOTE_FORMAT_VERSION } from './noteFormat';

const TYPE_STROKE = 0;
const TYPE_TEXT = 500;
export const INBOX_DIR = '/storage/emulated/0/INBOX';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export type Progress = (line: string) => void;

/** Serialise the whole note at `notePath`. */
export async function readNote(notePath: string, progress: Progress): Promise<NoteDoc> {
  const total = await device.totalPages(notePath);
  const emr = await getEmrSize();
  const pages: NotePage[] = [];
  let isPortrait = true;
  for (let page = 0; page < total; page++) {
    progress(`reading page ${page + 1}/${total}`);
    const size = await device.pageSize(notePath, page).catch(() => ({ width: 1404, height: 1872 }));
    if (page === 0) isPortrait = size.height >= size.width;
    const source = await device.elements(notePath, page);
    const elements: NoteElement[] = [];
    for (const el of source) {
      try {
        const out = await serialiseElement(el, emr, size);
        if (out) elements.push(out);
      } finally {
        // Elements from getElements hold native memory until recycled.
        // Some hosts hand back plain objects with no recycle(); then the
        // comm API's recycleElement(uuid) is the fallback.
        try {
          if (typeof el.recycle === 'function') await el.recycle();
          else if (el.uuid) device.recycle(el.uuid);
        } catch {
          /* best effort */
        }
      }
    }
    pages.push({ elements });
  }
  return { v: NOTE_FORMAT_VERSION, title: titleFor(notePath), isPortrait, emr, pages };
}

async function serialiseElement(
  el: Element,
  emr: { width: number; height: number },
  size: { width: number; height: number },
): Promise<NoteElement | null> {
  if (el.type === TYPE_STROKE && el.stroke) {
    const count = await el.stroke.points.size();
    if (count < 2) return null;
    const points = await el.stroke.points.getRange(0, count);
    const pts: number[] = [];
    for (const p of points) pts.push(clamp01(p.x / emr.width), clamp01(p.y / emr.height));
    let prs: number[] | undefined;
    try {
      const pressures = await el.stroke.pressures.getRange(0, count);
      if (pressures.length === count) prs = pressures.map((v) => Math.max(0, Math.round(v)));
    } catch {
      prs = undefined;
    }
    const s: StrokeElement = {
      kind: 'stroke',
      layer: el.layerNum ?? 0,
      penColor: el.stroke.penColor,
      penType: el.stroke.penType,
      thickness: el.thickness,
      pts,
    };
    if (prs) s.prs = prs;
    return s;
  }
  if (el.type === TYPE_TEXT && el.textBox?.textContentFull) {
    const r = el.textBox.textRect;
    if (!r) return null;
    const t: TextElement = {
      kind: 'text',
      layer: el.layerNum ?? 0,
      text: el.textBox.textContentFull,
      fontSize: el.textBox.fontSize || 24,
      rect: {
        left: clamp01(r.left / size.width),
        top: clamp01(r.top / size.height),
        right: clamp01(r.right / size.width),
        bottom: clamp01(r.bottom / size.height),
      },
      textAlign: el.textBox.textAlign ?? 0,
      textFrameWidthType: el.textBox.textFrameWidthType ?? 1,
    };
    return t;
  }
  return null;
}

/**
 * Rebuild `note` as a fresh .note file at `notePath`. Throws on the first
 * failure; the caller must not report delivery unless this returns.
 */
export async function writeNote(note: NoteDoc, notePath: string, progress: Progress): Promise<void> {
  const template = await device.template();
  const emr = await getEmrSize();
  progress('creating note');
  await device.createNote(notePath, template, note.isPortrait);
  for (let page = 0; page < note.pages.length; page++) {
    progress(`writing page ${page + 1}/${note.pages.length}`);
    if (page > 0) await device.insertPage(notePath, page, template);
    const size = await device.pageSize(notePath, page).catch(() => ({ width: 1404, height: 1872 }));
    const built: Element[] = [];
    for (const src of note.pages[page]?.elements ?? []) {
      const el = src.kind === 'stroke' ? await buildStroke(page, src, emr) : await buildText(page, src, size);
      if (el) built.push(el);
    }
    if (built.length === 0) continue;
    try {
      await device.insertElements(notePath, page, built);
    } catch (error) {
      for (const el of built) device.recycle(el.uuid);
      throw error;
    }
  }
}

async function buildStroke(page: number, s: StrokeElement, emr: { width: number; height: number }): Promise<Element | null> {
  const el = await device.createElement(TYPE_STROKE);
  if (!el.stroke) return null;
  const points: { x: number; y: number }[] = [];
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i + 1 < s.pts.length; i += 2) {
    const x = Math.round((s.pts[i] ?? 0) * emr.width);
    const y = Math.round((s.pts[i + 1] ?? 0) * emr.height);
    points.push({ x, y });
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  el.pageNum = page;
  el.layerNum = s.layer;
  el.thickness = s.thickness;
  // insertElements silently drops trails whose maxX/maxY are 0.
  el.maxX = Math.max(maxX, 1);
  el.maxY = Math.max(maxY, 1);
  el.stroke.penColor = s.penColor;
  el.stroke.penType = s.penType;
  await el.stroke.points.setRange(0, points.length, points);
  const prs = s.prs && s.prs.length === points.length ? [...s.prs] : points.map(() => 2048);
  await el.stroke.pressures.setRange(0, points.length, prs);
  if ((await el.stroke.points.size()) !== points.length) {
    device.recycle(el.uuid);
    return null;
  }
  return el;
}

async function buildText(page: number, t: TextElement, size: { width: number; height: number }): Promise<Element | null> {
  const el = await device.createElement(TYPE_TEXT);
  if (!el.textBox) return null;
  const left = Math.round(t.rect.left * size.width);
  const top = Math.round(t.rect.top * size.height);
  const right = Math.round(t.rect.right * size.width);
  const bottom = Math.round(t.rect.bottom * size.height);
  el.pageNum = page;
  el.layerNum = t.layer;
  el.maxX = Math.max(right, 1);
  el.maxY = Math.max(bottom, 1);
  el.textBox.fontSize = t.fontSize;
  el.textBox.textContentFull = t.text;
  el.textBox.textRect = { left, top, right, bottom };
  el.textBox.textAlign = t.textAlign;
  el.textBox.textFrameWidthType = t.textFrameWidthType;
  return el;
}

export function titleFor(notePath: string): string {
  const base = notePath.split('/').pop() ?? 'note';
  return base.replace(/\.note$/i, '') || 'note';
}

/** Where a pulled note lands. INBOX is one of the six permission-scoped dirs and there is no mkdir. */
export function inboxPathFor(from: string, title: string, when: Date = new Date()): string {
  const who = from.split('@')[0]?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'someone';
  const safeTitle = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'note';
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${INBOX_DIR}/${who}-${safeTitle}-${stamp}.note`;
}
