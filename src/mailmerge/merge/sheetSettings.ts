import { DEFAULT_NORMALIZATION, type Normalization } from './normalize.ts'

/** Settings that depend on a sheet's data, and are therefore saved per sheet. */
export interface SheetSettings {
  hasHeader: boolean
  normalization: Normalization
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  hasHeader: false,
  normalization: DEFAULT_NORMALIZATION,
}

/** Identifies a sheet: spreadsheet id + sheet name. */
export function sheetKey(spreadsheetId: string, sheet: string): string {
  return `${spreadsheetId}::${sheet}`
}
