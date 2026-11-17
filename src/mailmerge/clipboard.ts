import { hasCells, parseDelimited, trimRows } from './delimited.ts'
import type { SpreadsheetSource } from './sources.ts'

/**
 * Cells of the first table in an HTML document. Google Sheets (and Excel) copy the selected
 * cells as a <table>, which keeps the line breaks inside a cell.
 */
export function parseHtmlTable(html: string): string[][] | null {
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')
  if (!table) return null
  return [...table.rows].map((row) =>
    [...row.cells].flatMap((cell) => {
      // <br> is a line break inside the cell.
      for (const br of cell.querySelectorAll('br')) br.replaceWith('\n')
      // A merged cell spans several columns: the others are left empty, as in the spreadsheet.
      return [cell.textContent ?? '', ...Array<string>(Math.max(0, cell.colSpan - 1)).fill('')]
    }),
  )
}

/**
 * Cells of a paste. The paste event is used (not navigator.clipboard): it asks for no permissions
 * and works the same on a phone, with "Paste" from the system menu.
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

/** Pasted spreadsheet: a single sheet, no Google. It is not reloaded: there is nowhere to reload from. */
export function pastedSpreadsheet(rows: string[][]): SpreadsheetSource {
  return {
    canReload: false,
    // Fixed id: the header and the normalization of pasted data are remembered between pastes.
    pick: async () => ({ id: 'clipboard', title: 'Pasted cells', sheets: ['Pasted'] }),
    loadSheet: async () => rows,
  }
}
