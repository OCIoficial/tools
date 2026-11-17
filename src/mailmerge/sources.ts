/**
 * Where the data comes from. Google (mailmerge/google) and the sample data (mailmerge/sample)
 * implement the same interfaces, so the components do not know where it comes from.
 */

export interface Spreadsheet {
  id: string
  title: string
  sheets: string[]
}

export interface SpreadsheetSource {
  /** Whether reloading a sheet can bring new data (not for pasted data: there is nowhere to reload from). */
  canReload: boolean
  /** Lets the user choose a spreadsheet; null if cancelled. */
  pick(): Promise<Spreadsheet | null>
  /** Rows of a sheet, as strings, without empty cells at the end. */
  loadSheet(spreadsheet: Spreadsheet, sheet: string): Promise<string[][]>
}

/** What a long load is doing, and how far along it is if it can be measured. */
export interface LoadProgress {
  /** For example "Downloading students.zip". */
  message: string
  /** Measurable progress: without a total there is no bar, only the animated indicator. */
  done?: number
  total?: number
  unit?: 'bytes' | 'files'
}

/** A Drive file or folder that was chosen; with this it is downloaded again ("Reload"). */
export type DriveOrigin =
  | { kind: 'drive-folder'; id: string; name: string }
  | { kind: 'drive-archive'; id: string; name: string }
  | { kind: 'drive-file'; id: string; name: string; mimeType: string }

/** Where the files of an attachment or of a path source came from. */
export type Origin = { kind: 'upload' } | { kind: 'sample' } | DriveOrigin

export const isDriveOrigin = (origin: Origin): origin is DriveOrigin => origin.kind.startsWith('drive-')
