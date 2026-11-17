/**
 * Text with cells separated by a character (tab when pasting, comma or semicolon in a CSV).
 * A cell with the separator, a line break or quotes goes in quotes, and its quotes are
 * doubled, as Google Sheets, Excel and LibreOffice write it.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  while (i < text.length) {
    if (cell === '' && text[i] === '"') {
      // Quoted cell: it ends at the quote that is not doubled.
      i++
      while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
        cell += text[i]
        i += text[i] === '"' ? 2 : 1
      }
      i++
      continue
    }
    const char = text[i++]
    if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows
}

/** Removes the empty cells at the end of each row, like the Sheets API, so no empty columns are created. */
export function trimRows(rows: string[][]): string[][] {
  return rows.map((cells) => {
    let end = cells.length
    while (end > 0 && cells[end - 1].trim() === '') end--
    return cells.slice(0, end)
  })
}

export const hasCells = (rows: string[][]) => rows.some((cells) => cells.length > 0)

const DELIMITERS = [',', ';', '\t', '|']

/**
 * Separator of a CSV: the one that splits the first rows into the same number of columns (more
 * than one). Excel in Spanish saves with semicolons, because the comma is the decimal separator.
 */
export function detectDelimiter(text: string): string {
  // About 50 rows are enough and avoid going through a large file four times.
  const sample = text.split(/\r?\n/, 50).join('\n')
  let best = { delimiter: ',', score: 0 }
  for (const delimiter of DELIMITERS) {
    const counts = parseDelimited(sample, delimiter)
      .filter((cells) => cells.some((cell) => cell.trim() !== ''))
      .map((cells) => cells.length)
    if (counts.length === 0) continue
    // The most common number of columns, and in how many rows it repeats.
    const frequency = new Map<number, number>()
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1)
    const [columns, rows] = [...frequency].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    if (columns < 2) continue
    // Consistency between rows first; with equal consistency, more columns.
    const score = rows / counts.length + columns / 1000
    if (score > best.score) best = { delimiter, score }
  }
  return best.delimiter
}

/**
 * Text of a file: UTF-8 if it is valid; otherwise Windows-1252 (Latin-1), the encoding
 * Excel on Windows saves CSVs with, so accents and ñ do not come out garbled.
 */
export function decodeText(data: Uint8Array): string {
  try {
    // ignoreBOM: false (the default) removes the UTF-8 BOM that Excel adds.
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

/** Reads a CSV: detects encoding and separator, and honors the "sep=;" line that Excel adds. */
export function parseCsv(data: Uint8Array): string[][] {
  let text = decodeText(data)
  const declared = /^sep=(.)\r?\n/.exec(text)
  if (declared) text = text.slice(declared[0].length)
  return trimRows(parseDelimited(text, declared ? declared[1] : detectDelimiter(text)))
}
