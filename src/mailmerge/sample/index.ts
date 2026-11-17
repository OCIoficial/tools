import type { SpreadsheetSource } from '../sources.ts'
import { SAMPLE_SPREADSHEET } from './sampleSpreadsheet.ts'

/**
 * Sample data to try the UI without Google (development only): implements the same
 * sources as Google, in memory. Imported dynamically so it does not end up in production.
 */
export const sampleSpreadsheets: SpreadsheetSource = {
  canReload: false,
  pick: async () => ({ id: 'sample', title: SAMPLE_SPREADSHEET.title, sheets: Object.keys(SAMPLE_SPREADSHEET.sheets) }),
  loadSheet: async (_spreadsheet, sheet) => SAMPLE_SPREADSHEET.sheets[sheet] ?? [],
}

export { sampleFiles, sampleSharedFile } from './sampleFiles.ts'
