import { jsPDF } from "jspdf";
import logoUrl from "../assets/logo.png";
import type { User } from "./fields";
import { titleCase } from "./data";

/*
 * Reimplementation of the Typst template used by the original TUI
 * (tools/credentials/credentials/typstgen.py):
 *
 *  US letter, no page margin. Each entry is a 4 column table padded by
 *  50pt horizontally and 13pt vertically:
 *
 *    <phase>        | nombre    | usuario | contraseña |
 *    <logo>         | full name | user    | pass       |
 *
 *  A dashed cut line follows every entry (when there's room for it on the
 *  page), so consecutive entries on a page are always separated. Unlike the
 *  Typst template (which skipped the line when <120pt remained), the line
 *  never depends on whether another entry would fit.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const PAD_X = 50;
const PAD_Y = 13;
const INSET = 5;
const FONT_SIZE = 11;
const MONO_SIZE = 11;
const MIN_MONO_SIZE = 7;
const BLOCK_GAP = 13.2; // Typst default block spacing (1.2em)
const LOGO_W = 141.73; // 5cm

const TABLE_W = PAGE_W - 2 * PAD_X;
const FR = TABLE_W / (1.8 + 1.8 + 1 + 1);
const COL_W = [1.8 * FR, 1.8 * FR, FR, FR];
const COL_X = COL_W.reduce<number[]>((xs, w) => [...xs, xs[xs.length - 1] + w], [PAD_X]);

interface Assets {
  serif: string;
  mono: string;
  logo: Uint8Array;
  logoRatio: number;
}

let assetsPromise: Promise<Assets> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}

function pngRatio(png: Uint8Array): number {
  // PNG IHDR: width at byte 16, height at byte 20 (big endian).
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return view.getUint32(20) / view.getUint32(16);
}

/** Load (once) the fonts and the logo needed to build the PDFs. */
export function loadAssets(): Promise<Assets> {
  assetsPromise ??= (async () => {
    const base = `${import.meta.env.BASE_URL}credentials/`;
    const [serif, mono, logo] = await Promise.all([
      fetchBuffer(`${base}fonts/cmu-serif.ttf`),
      fetchBuffer(`${base}fonts/cmu-typewriter.ttf`),
      fetchBuffer(logoUrl),
    ]);
    const logoBytes = new Uint8Array(logo);
    return {
      serif: toBase64(serif),
      mono: toBase64(mono),
      logo: logoBytes,
      logoRatio: pngRatio(logoBytes),
    };
  })().catch((e) => {
    assetsPromise = null;
    throw e;
  });
  return assetsPromise;
}

export async function generatePdf(phase: string, users: User[]): Promise<Uint8Array> {
  const assets = await loadAssets();
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  doc.addFileToVFS("cmu-serif.ttf", assets.serif);
  doc.addFont("cmu-serif.ttf", "CMUSerif", "normal");
  doc.addFileToVFS("cmu-typewriter.ttf", assets.mono);
  doc.addFont("cmu-typewriter.ttf", "CMUTypewriter", "normal");
  doc.setProperties({ title: phase, creator: "OCI credentials" });
  doc.setLineWidth(1);
  doc.setDrawColor(0);
  doc.setTextColor(0);

  const logoH = LOGO_W * assets.logoRatio;
  // Computer Modern cap height is ~0.683em.
  const capHeight = (size: number) => size * 0.683;
  const lineH = FONT_SIZE * 1.2;
  const headerH = capHeight(FONT_SIZE) + 2 * INSET + 3;

  let y = 0;
  let firstOnPage = true;

  users.forEach((u) => {
    const fullname = titleCase(`${u.firstName} ${u.lastName}`.trim());

    doc.setFont("CMUSerif", "normal").setFontSize(FONT_SIZE);
    const nameLines: string[] = doc.splitTextToSize(fullname, COL_W[1] - 2 * INSET);
    // Usernames/passwords must be typed exactly, so shrink them to fit on
    // one line rather than breaking them; wrap only below MIN_MONO_SIZE.
    const fitMono = (text: string, width: number) => {
      doc.setFont("CMUTypewriter", "normal");
      let size = MONO_SIZE;
      while (size > MIN_MONO_SIZE && doc.setFontSize(size).getTextWidth(text) > width) size -= 0.5;
      doc.setFontSize(size);
      return { size, lines: doc.splitTextToSize(text, width) as string[] };
    };
    const user = fitMono(u.username, COL_W[2] - 2 * INSET);
    const pass = fitMono(u.password, COL_W[3] - 2 * INSET);
    const userLines = user.lines;
    const passLines = pass.lines;

    const textLines = Math.max(nameLines.length, userLines.length, passLines.length, 1);
    const textBlockH = capHeight(FONT_SIZE) + (textLines - 1) * lineH;
    const bodyH = Math.max(logoH, textBlockH) + 2 * INSET;
    const entryH = PAD_Y + headerH + bodyH + PAD_Y;

    // `y` is just below the previous entry's cut line (or 0 on a new page).
    if (!firstOnPage && y + entryH > PAGE_H) {
      doc.addPage();
      y = 0;
    }
    firstOnPage = false;

    const top = y + PAD_Y;
    const headerMid = top + headerH / 2;
    const bodyTop = top + headerH;
    const bodyMid = bodyTop + bodyH / 2;
    const bottom = bodyTop + bodyH;

    // Grid: vertical lines between columns and at the right edge,
    // horizontal lines spanning every column except the first.
    doc.setLineDashPattern([], 0);
    for (let i = 1; i <= 4; i++) doc.line(COL_X[i], top, COL_X[i], bottom);
    for (const ly of [top, bodyTop, bottom]) doc.line(COL_X[1], ly, COL_X[4], ly);

    // Header row.
    doc.setFont("CMUSerif", "normal").setFontSize(FONT_SIZE);
    const headerBaseline = headerMid + capHeight(FONT_SIZE) / 2;
    doc.text(phase, COL_X[0] + INSET, headerBaseline);
    const center = (i: number) => COL_X[i] + COL_W[i] / 2;
    doc.text("nombre", center(1), headerBaseline, { align: "center" });
    doc.text("usuario", center(2), headerBaseline, { align: "center" });
    doc.text("contraseña", center(3), headerBaseline, { align: "center" });

    // Body row.
    doc.addImage(assets.logo, "PNG", COL_X[0] + INSET, bodyMid - logoH / 2, LOGO_W, logoH);

    const drawCentered = (lines: string[], col: number, font: "CMUSerif" | "CMUTypewriter", size: number) => {
      doc.setFont(font, "normal").setFontSize(size);
      const blockH = capHeight(size) + (lines.length - 1) * lineH;
      const first = bodyMid - blockH / 2 + capHeight(size);
      lines.forEach((line, i) => doc.text(line, center(col), first + i * lineH, { align: "center" }));
    };
    drawCentered(nameLines, 1, "CMUSerif", FONT_SIZE);
    drawCentered(userLines, 2, "CMUTypewriter", user.size);
    drawCentered(passLines, 3, "CMUTypewriter", pass.size);

    // Dashed cut line below every entry, if it fits on the page.
    y = bottom + PAD_Y + BLOCK_GAP;
    if (y <= PAGE_H - 2) {
      doc.setLineDashPattern([3, 2], 0);
      doc.line(0, y, PAGE_W, y);
      doc.setLineDashPattern([], 0);
    }
    y += BLOCK_GAP;
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
