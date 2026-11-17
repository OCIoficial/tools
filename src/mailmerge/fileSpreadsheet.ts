import { hasCells, parseCsv, trimRows } from './delimited.ts'
import type { SpreadsheetSource } from './sources.ts'

const TEXT_EXTENSIONS = ['csv', 'tsv', 'txt']
const WORKBOOK_EXTENSIONS = ['xlsx', 'xlsm', 'ods']

/** Para el selector de archivos del sistema: muestra solo estos formatos. */
export const SPREADSHEET_ACCEPT = [...TEXT_EXTENSIONS, ...WORKBOOK_EXTENSIONS].map((ext) => `.${ext}`).join(',')

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** Hojas de un libro de Excel o LibreOffice, como texto formateado (lo que se ve en cada celda). */
async function readWorkbook(data: Uint8Array): Promise<Map<string, string[][]>> {
  // Import dinámico: SheetJS se descarga solo la primera vez que se sube un libro.
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array' })
  return new Map(
    workbook.SheetNames.map((name) => {
      // raw: false entrega el texto formateado ("31-03-2026", "$45.000"), como la Sheets API.
      const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '' })
      return [name, trimRows(rows.map((cells) => cells.map(String)))]
    }),
  )
}

/**
 * Planilla subida como archivo: CSV (con separador y codificación detectados), Excel o
 * LibreOffice. Se lee una vez al subirla; no se recarga, porque el archivo es una copia.
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
    // Id por nombre: subir de nuevo el mismo archivo recupera su encabezado y normalización.
    pick: async () => ({ id: `file:${file.name}`, title: file.name, sheets: names }),
    loadSheet: async (_spreadsheet, sheet) => sheets.get(sheet) ?? [],
  }
}
