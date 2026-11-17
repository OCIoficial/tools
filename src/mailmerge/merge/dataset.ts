export interface Column {
  /** Header as it appears in the spreadsheet, or the column letter if there is no header. */
  header: string
  /** Name of the variable in the template. */
  key: string
}

export type Row = Record<string, string>

export interface Dataset {
  columns: Column[]
  rows: Row[]
  /** Source sheet (see sheetKey), for its saved settings. */
  sheetKey?: string
}

/** "Café Owner" → "cafe_owner" */
export function toVariableName(header: string): string {
  const name = header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!name) return 'column'
  return /^[0-9]/.test(name) ? `_${name}` : name
}

/** 0 → "A", 25 → "Z", 26 → "AA", as in the spreadsheet. */
export function columnLetter(index: number): string {
  let letter = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  }
  return letter
}

/**
 * Turns the values of a sheet into columns and rows. If `hasHeader`, the first row
 * gives the names; if not, the columns are named as in the spreadsheet (A, B, C...).
 */
export function toDataset(values: string[][], hasHeader: boolean): Dataset {
  const headerRow = hasHeader ? (values[0] ?? []) : []
  const dataRows = hasHeader ? values.slice(1) : values
  // The API omits the empty cells at the end of each row, so rows have different lengths.
  const width = Math.max(0, ...values.map((cells) => cells.length))

  const used = new Set<string>()
  const columns: Column[] = []
  for (let index = 0; index < width; index++) {
    const name = headerRow[index]?.trim()
    // Without a header, the column is named by its letter: {{ A }}, {{ B }}...
    const base = name ? toVariableName(name) : columnLetter(index)
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`
    used.add(key)
    columns.push({ header: name || columnLetter(index), key })
  }

  const rows = dataRows
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => Object.fromEntries(columns.map((column, i) => [column.key, cells[i] ?? ''])))

  return { columns, rows }
}
