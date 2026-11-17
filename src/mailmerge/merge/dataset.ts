export interface Column {
  /** Encabezado tal como aparece en la planilla, o la letra de la columna si no hay encabezado. */
  header: string
  /** Nombre de la variable en el template. */
  key: string
}

export type Row = Record<string, string>

export interface Dataset {
  columns: Column[]
  rows: Row[]
  /** Hoja de origen (ver sheetKey), para su configuración guardada. */
  sheetKey?: string
}

/** "Correo Electrónico" → "correo_electronico" */
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

/** 0 → "A", 25 → "Z", 26 → "AA", como en la planilla. */
export function columnLetter(index: number): string {
  let letter = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  }
  return letter
}

/**
 * Convierte los valores de una hoja en columnas y filas. Si `hasHeader`, la primera fila
 * da los nombres; si no, las columnas se llaman como en la planilla (A, B, C...).
 */
export function toDataset(values: string[][], hasHeader: boolean): Dataset {
  const headerRow = hasHeader ? (values[0] ?? []) : []
  const dataRows = hasHeader ? values.slice(1) : values
  // La API omite las celdas vacías al final de cada fila, así que las filas tienen largos distintos.
  const width = Math.max(0, ...values.map((cells) => cells.length))

  const used = new Set<string>()
  const columns: Column[] = []
  for (let index = 0; index < width; index++) {
    const name = headerRow[index]?.trim()
    // Sin encabezado, la columna se llama por su letra: {{ A }}, {{ B }}...
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
