import { create } from "zustand";
import { autoMap, detectHeader, parseTable, pdfFileNames, type Rows } from "./lib/data";
import { EMPTY_MAPPING, type Mapping, type User } from "./lib/fields";

export interface GeneratedPdf {
  name: string;
  count: number;
  bytes: Uint8Array;
}

/** Where the PDFs are uploaded; the same shape as the Drive folder from google/. */
export interface UploadFolder {
  id: string;
  name: string;
}

export type Upload =
  | { status: "uploading"; folder: UploadFolder; done: number; total: number }
  | { status: "done"; folder: UploadFolder; total: number }
  | { status: "failed"; folder: UploadFolder; done: number; total: number; error: string };

export const PHASES = ["Regional", "Final"];

/**
 * Everything Credentials shows. It lives outside React, so the data is still there after
 * switching to another app and back.
 */
interface State {
  rows: Rows | null;
  /** Where the rows came from (file name or "pasted text"). */
  source: string;
  hasHeader: boolean;
  mapping: Mapping;
  groupSites: boolean;
  phaseName: string;
  year: string;
  error: string | null;
  generating: boolean;
  /** Generated PDFs; null when there are none or the inputs changed since. */
  pdfs: GeneratedPdf[] | null;
  /** Index of the PDF shown in the preview. */
  current: number;
  /** Upload of the current PDFs to Google Drive, if one was started. */
  upload: Upload | null;
}

export const useStore = create<State>(() => ({
  rows: null,
  source: "",
  hasHeader: false,
  mapping: EMPTY_MAPPING,
  groupSites: true,
  phaseName: PHASES[0],
  year: String(new Date().getFullYear()),
  error: null,
  generating: false,
  pdfs: null,
  current: 0,
  upload: null,
}));

const set = useStore.setState;

/** Changes an input of the PDFs: previously generated PDFs become stale. */
function setInput(input: Partial<State>) {
  if (useStore.getState().upload?.status === "uploading") return;
  set({ ...input, pdfs: null, upload: null });
}

export function loadText(text: string, source: string) {
  try {
    const rows = parseTable(text);
    const hasHeader = detectHeader(rows);
    setInput({ rows, source, hasHeader, mapping: autoMap(rows, hasHeader), error: null });
  } catch (e) {
    set({ error: `Error loading data: ${e instanceof Error ? e.message : String(e)}` });
  }
}

export function setHasHeader(hasHeader: boolean) {
  const { rows } = useStore.getState();
  setInput(rows ? { hasHeader, mapping: autoMap(rows, hasHeader) } : { hasHeader });
}

export const setMapping = (mapping: Mapping) => setInput({ mapping });
export const setGroupSites = (groupSites: boolean) => setInput({ groupSites });
export const setPhaseName = (phaseName: string) => setInput({ phaseName });
export const setYear = (year: string) => setInput({ year });
export const setError = (error: string | null) => set({ error });
export const setCurrent = (current: number) => set({ current });

export const phaseOf = (state: Pick<State, "phaseName" | "year">) => `${state.phaseName} ${state.year}`.trim();

/** Heavy libraries (jsPDF, fonts) are loaded on demand. */
export const loadPdfLib = () => import("./lib/pdf");

/** Generates one PDF per group of users. */
export async function generate(groups: Map<string, User[]>): Promise<void> {
  if (useStore.getState().upload?.status === "uploading") return;
  const phase = phaseOf(useStore.getState());
  set({ generating: true, error: null });
  try {
    const { generatePdf } = await loadPdfLib();
    const pdfs: GeneratedPdf[] = [];
    for (const [name, users] of groups) {
      pdfs.push({ name, count: users.length, bytes: await generatePdf(phase, users) });
      // jsPDF blocks the main thread; yield so the UI stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    set({ pdfs, current: 0, upload: null });
  } catch (e) {
    set({ error: `Error generating PDFs: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    set({ generating: false });
  }
}

export const isUploading = (state: Pick<State, "upload">) => state.upload?.status === "uploading";

/**
 * Uploads every PDF to a folder as a separate file, one at a time. The files keep the names
 * they get in the .zip. On an error it stops, and the PDFs already uploaded stay in Drive.
 */
export async function uploadAll(
  folder: UploadFolder,
  upload: (name: string, bytes: Uint8Array) => Promise<void>,
): Promise<void> {
  const { pdfs } = useStore.getState();
  if (!pdfs || isUploading(useStore.getState())) return;
  const names = pdfFileNames(pdfs.map((pdf) => pdf.name));
  const total = pdfs.length;
  set({ upload: { status: "uploading", folder, done: 0, total } });
  for (let i = 0; i < total; i++) {
    try {
      await upload(names[i], pdfs[i].bytes);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ upload: { status: "failed", folder, done: i, total, error } });
      return;
    }
    set({ upload: { status: "uploading", folder, done: i + 1, total } });
  }
  set({ upload: { status: "done", folder, total } });
}

export const clearUpload = () => set({ upload: null });
