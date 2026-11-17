import type { Dataset, Row } from './dataset.ts'

/** `id` identifies the step when reordering it. */
export type Step = { id: string } & (
  | { type: 'trim' }
  | { type: 'collapse' }
  | { type: 'lowercase' }
  | { type: 'uppercase' }
  | { type: 'titlecase' }
  | { type: 'removeAccents' }
  | { type: 'replace'; find: string; replace: string; regex: boolean }
  | { type: 'default'; value: string }
)

export type StepType = Step['type']

export const STEP_LABELS: Record<StepType, string> = {
  trim: 'Trim spaces',
  collapse: 'Collapse repeated spaces',
  lowercase: 'lowercase',
  uppercase: 'UPPERCASE',
  titlecase: 'Title case',
  removeAccents: 'Remove accents',
  replace: 'Replace…',
  default: 'Default if empty…',
}

export function newStep(type: StepType): Step {
  const id = crypto.randomUUID()
  if (type === 'replace') return { id, type, find: '', replace: '', regex: false }
  if (type === 'default') return { id, type, value: '' }
  return { id, type }
}

export interface GlobalNormalization {
  trim: boolean
  collapse: boolean
  invisible: boolean
}

export interface Normalization {
  global: GlobalNormalization
  /** Steps per column, by variable name. */
  columns: Record<string, Step[]>
}

export const DEFAULT_NORMALIZATION: Normalization = {
  global: { trim: true, collapse: true, invisible: true },
  columns: {},
}

/** "juan PÉREZ o'higgins" → "Juan Pérez O'Higgins" */
export function titlecase(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase())
}

/** "Núñez Pérez" → "Núñez Perez": removes accents and diaereses, but keeps the ñ. */
function removeAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/(?<![nN])[̀-ͯ]/g, '')
    .normalize('NFC')
}

/** Returns an error if the regular expression is not valid. */
export function replacePatternError(step: Extract<Step, { type: 'replace' }>): string | null {
  if (!step.regex) return null
  try {
    new RegExp(step.find, 'g')
    return null
  } catch (e) {
    return (e as Error).message
  }
}

/** Several spaces or tabs in a row → one. Line breaks are kept. */
function collapseSpaces(value: string): string {
  return value.replace(/[^\S\r\n]{2,}/g, ' ')
}

export function applyStep(value: string, step: Step): string {
  switch (step.type) {
    case 'trim':
      return value.trim()
    case 'collapse':
      return collapseSpaces(value)
    case 'lowercase':
      return value.toLocaleLowerCase()
    case 'uppercase':
      return value.toLocaleUpperCase()
    case 'titlecase':
      return titlecase(value)
    case 'removeAccents':
      return removeAccents(value)
    case 'replace':
      if (!step.find || replacePatternError(step)) return value
      return step.regex ? value.replace(new RegExp(step.find, 'g'), step.replace) : value.replaceAll(step.find, step.replace)
    case 'default':
      return value === '' ? step.value : value
  }
}

function applyGlobal(value: string, global: GlobalNormalization): string {
  let result = value
  if (global.invisible) {
    // Non-breaking spaces → normal space; zero-width characters and BOM → nothing.
    result = result.replace(/[   ]/g, ' ').replace(/[​-‍⁠﻿]/g, '')
  }
  if (global.collapse) result = collapseSpaces(result)
  if (global.trim) result = result.trim()
  return result
}

export function normalizeValue(value: string, global: GlobalNormalization, steps: Step[] = []): string {
  return steps.reduce(applyStep, applyGlobal(value, global))
}

export interface NormalizedDataset extends Dataset {
  /** Rows without transformations, in the same order. */
  original: Row[]
  changedCells: number
}

export function normalizeDataset(dataset: Dataset, normalization: Normalization): NormalizedDataset {
  let changedCells = 0
  const rows = dataset.rows.map((row) =>
    Object.fromEntries(
      dataset.columns.map(({ key }) => {
        const value = normalizeValue(row[key], normalization.global, normalization.columns[key])
        if (value !== row[key]) changedCells++
        return [key, value]
      }),
    ),
  )
  return { ...dataset, rows, original: dataset.rows, changedCells }
}
