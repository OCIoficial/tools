/**
 * De dónde salen los datos. Google (src/google) y los datos de ejemplo (src/sample) implementan
 * las mismas interfaces, así los componentes no saben de dónde vienen.
 */

export interface Spreadsheet {
  id: string
  title: string
  sheets: string[]
}

export interface SpreadsheetSource {
  /** Si volver a cargar una hoja puede traer datos nuevos (no en lo pegado: no hay de dónde recargar). */
  canReload: boolean
  /** Deja elegir una planilla; null si se cancela. */
  pick(): Promise<Spreadsheet | null>
  /** Filas de una hoja, como strings, sin celdas vacías al final. */
  loadSheet(spreadsheet: Spreadsheet, sheet: string): Promise<string[][]>
}

/** Qué está haciendo una carga larga, y cuánto lleva si se puede medir. */
export interface LoadProgress {
  /** Por ejemplo "Downloading alumnos.zip". */
  message: string
  /** Avance medible: sin total no hay barra, solo el indicador animado. */
  done?: number
  total?: number
  unit?: 'bytes' | 'files'
}

/** Un archivo o carpeta de Drive elegido; con esto se vuelve a descargar ("Reload"). */
export type DriveOrigin =
  | { kind: 'drive-folder'; id: string; name: string }
  | { kind: 'drive-archive'; id: string; name: string }
  | { kind: 'drive-file'; id: string; name: string; mimeType: string }

/** De dónde salieron los archivos de un adjunto o de una fuente de rutas. */
export type Origin = { kind: 'upload' } | { kind: 'sample' } | DriveOrigin

export const isDriveOrigin = (origin: Origin): origin is DriveOrigin => origin.kind.startsWith('drive-')
