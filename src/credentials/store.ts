import { create } from "zustand";
import { autoMap, detectHeader, parseTable, type Rows } from "./lib/data";
import { EMPTY_MAPPING, type Mapping, type User } from "./lib/fields";

export interface GeneratedPdf {
  name: string;
  count: number;
  bytes: Uint8Array;
}

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
}));

const set = useStore.setState;

/** Changes an input of the PDFs: previously generated PDFs become stale. */
function setInput(input: Partial<State>) {
  set({ ...input, pdfs: null });
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
    set({ pdfs, current: 0 });
  } catch (e) {
    set({ error: `Error generating PDFs: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    set({ generating: false });
  }
}
