import type { SpreadsheetSource } from '../sources.ts'
import { SAMPLE_SPREADSHEET } from './sampleSpreadsheet.ts'

/**
 * Datos de ejemplo para probar la interfaz sin Google (solo en desarrollo): implementan las
 * mismas fuentes que Google, en memoria. Se importan dinámicamente para no quedar en producción.
 */
export const sampleSpreadsheets: SpreadsheetSource = {
  canReload: false,
  pick: async () => ({ id: 'sample', title: SAMPLE_SPREADSHEET.title, sheets: Object.keys(SAMPLE_SPREADSHEET.sheets) }),
  loadSheet: async (_spreadsheet, sheet) => SAMPLE_SPREADSHEET.sheets[sheet] ?? [],
}

export { sampleFiles, sampleSharedFile } from './sampleFiles.ts'
