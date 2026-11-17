import { hasCells, parseDelimited, trimRows } from './delimited.ts'
import type { SpreadsheetSource } from './sources.ts'

/**
 * Celdas de la primera tabla de un HTML. Google Sheets (y Excel) copian las celdas
 * seleccionadas como una <table>, que conserva los saltos de línea dentro de una celda.
 */
export function parseHtmlTable(html: string): string[][] | null {
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')
  if (!table) return null
  return [...table.rows].map((row) =>
    [...row.cells].flatMap((cell) => {
      // <br> es un salto de línea dentro de la celda.
      for (const br of cell.querySelectorAll('br')) br.replaceWith('\n')
      // Una celda combinada ocupa varias columnas: las demás quedan vacías, como en la planilla.
      return [cell.textContent ?? '', ...Array<string>(Math.max(0, cell.colSpan - 1)).fill('')]
    }),
  )
}

/**
 * Celdas de un pegado. Se usa el evento paste (no navigator.clipboard): no pide permisos y
 * funciona igual en el teléfono, con "Pegar" del menú del sistema.
 */
export function readPastedTable(data: DataTransfer): string[][] {
  const html = data.getData('text/html')
  const text = data.getData('text/plain')
  const rows = trimRows((html ? parseHtmlTable(html) : null) ?? parseDelimited(text, '\t'))
  if (!hasCells(rows)) {
    throw new Error('Nothing to paste. Select and copy cells in a spreadsheet first.')
  }
  return rows
}

/** Planilla pegada: una sola hoja, sin Google. No se recarga: no hay de dónde. */
export function pastedSpreadsheet(rows: string[][]): SpreadsheetSource {
  return {
    canReload: false,
    // Id fijo: el encabezado y la normalización de lo pegado se recuerdan entre pegados.
    pick: async () => ({ id: 'clipboard', title: 'Pasted cells', sheets: ['Pasted'] }),
    loadSheet: async () => rows,
  }
}
