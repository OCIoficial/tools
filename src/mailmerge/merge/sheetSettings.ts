import { DEFAULT_NORMALIZATION, type Normalization } from './normalize.ts'

/** Configuración que depende de los datos de una hoja, y por eso se guarda por hoja. */
export interface SheetSettings {
  hasHeader: boolean
  normalization: Normalization
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  hasHeader: false,
  normalization: DEFAULT_NORMALIZATION,
}

/** Identifica una hoja: id del spreadsheet + nombre de la hoja. */
export function sheetKey(spreadsheetId: string, sheet: string): string {
  return `${spreadsheetId}::${sheet}`
}
