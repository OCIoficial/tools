import { hasCells, parseCsv, trimRows } from './delimited.ts'
import type { SpreadsheetSource } from './sources.ts'

const TEXT_EXTENSIONS = ['csv', 'tsv', 'txt']
const WORKBOOK_EXTENSIONS = ['xlsx', 'xlsm', 'ods']

/** For the system file picker: shows only these formats. */
export const SPREADSHEET_ACCEPT = [...TEXT_EXTENSIONS, ...WORKBOOK_EXTENSIONS].map((ext) => `.${ext}`).join(',')

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** Sheets of an Excel or LibreOffice workbook, as formatted text (what each cell shows). */
async function readWorkbook(data: Uint8Array): Promise<Map<string, string[][]>> {
  // Dynamic import: SheetJS is downloaded only the first time a workbook is uploaded.
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array' })
  return new Map(
    workbook.SheetNames.map((name) => {
      // raw: false returns the formatted text ("31-03-2026", "$45.000"), like the Sheets API.
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
      return [name, trimRows(rows.map((cells) => cells.map(String)))]
    }),
  )
}

/**
 * Spreadsheet uploaded as a file: CSV (with detected separator and encoding), Excel or
 * LibreOffice. It is read once when uploaded; it is not reloaded, because the file is a copy.
 */
export async function fileSpreadsheet(file: File): Promise<SpreadsheetSource> {
  const extension = extensionOf(file.name)
  const data = new Uint8Array(await file.arrayBuffer())

  let sheets: Map<string, string[][]>
  if (TEXT_EXTENSIONS.includes(extension)) {
    sheets = new Map([[file.name, parseCsv(data)]])
  } else if (WORKBOOK_EXTENSIONS.includes(extension)) {
    try {
      sheets = await readWorkbook(data)
    } catch (e) {
      throw new Error(`Could not read "${file.name}": ${(e as Error).message}`)
    }
  } else {
    throw new Error(`"${file.name}" is not a supported file. Use CSV, Excel (.xlsx) or LibreOffice (.ods).`)
  }

  const names = [...sheets.keys()].filter((name) => hasCells(sheets.get(name) ?? []))
  if (names.length === 0) throw new Error(`"${file.name}" has no cells.`)

  return {
    canReload: false,
    // Id by name: uploading the same file again restores its header and normalization.
    pick: async () => ({ id: `file:${file.name}`, title: file.name, sheets: names }),
    loadSheet: async (_spreadsheet, sheet) => sheets.get(sheet) ?? [],
  }
}
