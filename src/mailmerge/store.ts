import { create } from 'zustand'
import type { PathSource, SharedAttachment } from './attachments/model.ts'
import type { Dataset } from './merge/dataset.ts'
import { normalizeDataset, type Normalization, type NormalizedDataset } from './merge/normalize.ts'
import { compileTemplate, renderEmail, type CompiledTemplate, type RenderedEmail } from './merge/render.ts'
import { DEFAULT_SHEET_SETTINGS, type SheetSettings } from './merge/sheetSettings.ts'
import { EMPTY_TEMPLATE, type EmailTemplate } from './merge/template.ts'

/**
 * Estado compartido de la app. Cada componente lee con un selector solo lo que usa, así
 * escribir en Subject no re-dibuja la tabla, los adjuntos ni el encabezado.
 *
 * Reglas para los selectores (Zustand 5): devolver valores ya guardados en el estado o
 * primitivos. Un selector que arma un objeto o arreglo nuevo en cada llamada re-dibuja sin fin.
 */

export type SendStatus =
  | { state: 'sending' }
  | { state: 'sent'; at: number }
  | { state: 'failed'; error: string }
  /** Sin respuesta de Gmail: pudo haberse enviado. "Send remaining" no lo reintenta. */
  | { state: 'unconfirmed'; error: string }

/** Qué envía el diálogo de confirmación: los pendientes, o reintentar los no confirmados. */
export type SendMode = 'pending' | 'unconfirmed'

export interface SendProgress {
  done: number
  total: number
}

interface State {
  /** Guardado en localStorage. */
  template: EmailTemplate
  /** Encabezado y normalización por hoja (ver sheetKey); guardado en localStorage. */
  sheetSettings: Record<string, SheetSettings>
  dataset: Dataset | null
  /** Cambia con cada planilla cargada; reinicia el estado local de Review. */
  datasetVersion: number
  /** Filas que no se envían, por índice. */
  excluded: Set<number>
  /** Adjuntos que van en todos los correos; no se guardan entre sesiones (ni sus nombres). */
  shared: SharedAttachment[]
  /** Carpetas o archivos comprimidos con sus rutas; no se guardan entre sesiones (ni sus rutas). */
  sources: PathSource[]

  // Derivados: se recalculan en las acciones, nunca en los componentes.
  normalized: NormalizedDataset | null
  compiled: CompiledTemplate
  /** Todas las filas (Review también muestra las excluidas). */
  allEmails: RenderedEmail[]
  /** Solo las incluidas: las que se envían. */
  emails: RenderedEmail[]
  /** Correos incluidos con algo que corregir. */
  problemCount: number

  /** Cargas en curso (planilla o adjuntos): no se puede empezar a enviar hasta que terminen. */
  loads: number

  // Envío.
  statuses: Map<number, SendStatus>
  progress: SendProgress | null
  /** Motivo por el que se detuvo un envío antes de terminar (sesión, límite diario o Stop). */
  stopReason: string | null
  /** null = aún no editada: se usa el correo de la cuenta conectada. */
  testAddress: string | null
  testing: boolean
  /** Diálogo de confirmación abierto, y para qué envío. */
  confirming: SendMode | false
}

// --- localStorage: mismas claves y formato que antes, así no se pierde lo guardado ------------

const TEMPLATE_KEY = 'mail-merge:template'
const SHEET_SETTINGS_KEY = 'mail-merge:sheet-settings'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin espacio o bloqueado: la app sigue funcionando, solo no se recuerda.
  }
}

// --- Derivados ----------------------------------------------------------------------------------

export function settingsFor(state: Pick<State, 'sheetSettings'>, key: string | undefined): SheetSettings {
  return key ? { ...DEFAULT_SHEET_SETTINGS, ...state.sheetSettings[key] } : DEFAULT_SHEET_SETTINGS
}

/** Normalización de la hoja actual; misma referencia mientras no cambie (apta para selectores). */
export function currentNormalization(state: Pick<State, 'sheetSettings' | 'dataset'>): Normalization {
  const key = state.dataset?.sheetKey
  return (key && state.sheetSettings[key]?.normalization) || DEFAULT_SHEET_SETTINGS.normalization
}

function withIncluded(state: Pick<State, 'allEmails' | 'excluded'>) {
  const emails = state.allEmails.filter((email) => !state.excluded.has(email.index))
  return { emails, problemCount: emails.filter((email) => email.problems.length > 0).length }
}

function withEmails(state: Pick<State, 'template' | 'normalized' | 'shared' | 'sources' | 'excluded'>) {
  const compiled = compileTemplate(state.template, state)
  const allEmails =
    compiled.errors.length > 0 ? [] : (state.normalized?.rows ?? []).map((row, i) => renderEmail(compiled, row, i))
  return { compiled, allEmails, ...withIncluded({ allEmails, excluded: state.excluded }) }
}

function withNormalized(state: Pick<State, 'dataset' | 'sheetSettings'>) {
  return { normalized: state.dataset ? normalizeDataset(state.dataset, currentNormalization(state)) : null }
}

// --- Store --------------------------------------------------------------------------------------

/** Lo guardado antes puede traer rutas de adjuntos: ahora viven con su fuente y no se guardan. */
function loadTemplate(): EmailTemplate {
  const { attachments: _, ...saved } = load<Partial<EmailTemplate> & { attachments?: unknown }>(TEMPLATE_KEY, {})
  return { ...EMPTY_TEMPLATE, ...saved }
}

const initialTemplate = loadTemplate()

export const useStore = create<State>()(() => ({
  template: initialTemplate,
  sheetSettings: load<Record<string, SheetSettings>>(SHEET_SETTINGS_KEY, {}),
  dataset: null,
  datasetVersion: 0,
  excluded: new Set(),
  shared: [],
  sources: [],
  normalized: null,
  ...withEmails({ template: initialTemplate, normalized: null, shared: [], sources: [], excluded: new Set() }),
  loads: 0,
  statuses: new Map(),
  progress: null,
  stopReason: null,
  testAddress: null,
  testing: false,
  confirming: false,
}))

const get = useStore.getState
const set = useStore.setState

/**
 * Mientras se envía, todo lo que cambia los correos o cuáles se envían queda bloqueado: así lo
 * que muestra Review es exactamente lo que sale, en el mismo orden. La interfaz también se
 * bloquea; esta guarda es la garantía aunque algo se escape (un atajo, una carga que termina).
 */
export const isSending = (state: Pick<State, 'progress'> = get()) => state.progress !== null

/** Para la interfaz: true mientras se envía (la edición queda bloqueada). */
export const useSending = () => useStore(isSending)

/** Orden de Review: todas las filas en el orden de la planilla, o solo las incluidas con problemas. */
export function reviewList(
  state: Pick<State, 'allEmails' | 'excluded'>,
  filter: 'all' | 'problems' = 'all',
): RenderedEmail[] {
  if (filter === 'all') return state.allEmails
  return state.allEmails.filter((email) => !state.excluded.has(email.index) && email.problems.length > 0)
}

/** Cuenta una carga en curso mientras dura `task`. */
export async function trackLoad<T>(task: () => Promise<T>): Promise<T> {
  set((state) => ({ loads: state.loads + 1 }))
  try {
    return await task()
  } finally {
    set((state) => ({ loads: state.loads - 1 }))
  }
}

/** Los correos se regeneran al dejar de escribir, no en cada tecla. */
const EMAILS_DELAY = 150
let emailsTimer: ReturnType<typeof setTimeout> | undefined

function recomputeEmailsNow() {
  clearTimeout(emailsTimer)
  emailsTimer = undefined
  set(withEmails(get()))
}

/** Regenera los correos si quedó una regeneración pendiente (antes de enviar). */
export function flushEmails() {
  if (emailsTimer !== undefined) recomputeEmailsNow()
}

function recomputeEmailsSoon() {
  clearTimeout(emailsTimer)
  emailsTimer = setTimeout(recomputeEmailsNow, EMAILS_DELAY)
}

export function updateTemplate(patch: Partial<EmailTemplate>) {
  if (isSending()) return
  set((state) => ({ template: { ...state.template, ...patch } }))
  save(TEMPLATE_KEY, get().template)
  recomputeEmailsSoon()
}

/** Planilla nueva: las filas excluidas y el estado de envío dejan de corresponder a las mismas filas. */
export function setDataset(dataset: Dataset | null) {
  if (isSending()) return
  set((state) => {
    const next = { ...state, dataset, excluded: new Set<number>() }
    const normalized = withNormalized(next)
    return {
      dataset,
      datasetVersion: state.datasetVersion + 1,
      excluded: next.excluded,
      statuses: new Map(),
      stopReason: null,
      ...normalized,
      ...withEmails({ ...next, ...normalized }),
    }
  })
}

export function updateSheetSettings(key: string, patch: Partial<SheetSettings>) {
  if (isSending()) return
  set((state) => {
    const sheetSettings = { ...state.sheetSettings, [key]: { ...settingsFor(state, key), ...patch } }
    // Solo la hoja cargada afecta los datos normalizados y los correos.
    if (key !== state.dataset?.sheetKey || !patch.normalization) return { sheetSettings }
    const normalized = withNormalized({ ...state, sheetSettings })
    return { sheetSettings, ...normalized, ...withEmails({ ...state, ...normalized }) }
  })
  save(SHEET_SETTINGS_KEY, get().sheetSettings)
}

export function setNormalization(normalization: Normalization) {
  const key = get().dataset?.sheetKey
  if (key) updateSheetSettings(key, { normalization })
}

export function setExcluded(excluded: Set<number>) {
  if (isSending()) return
  set((state) => ({ excluded, ...withIncluded({ allEmails: state.allEmails, excluded }) }))
}

/**
 * Cambia los adjuntos. Al escribir (nombres, rutas) los correos se regeneran al dejar de
 * escribir; al agregar, quitar o reordenar, de inmediato.
 */
function setAttachments(patch: Partial<Pick<State, 'shared' | 'sources'>>, typing: boolean) {
  if (isSending()) return
  if (typing) {
    set(patch)
    recomputeEmailsSoon()
  } else {
    clearTimeout(emailsTimer)
    emailsTimer = undefined
    set((state) => ({ ...patch, ...withEmails({ ...state, ...patch }) }))
  }
}

/** Con una función, porque una carga puede terminar después de otros cambios. */
export function updateShared(update: (shared: SharedAttachment[]) => SharedAttachment[], { typing = false } = {}) {
  setAttachments({ shared: update(get().shared) }, typing)
}

export function updateSources(update: (sources: PathSource[]) => PathSource[], { typing = false } = {}) {
  setAttachments({ sources: update(get().sources) }, typing)
}

// Envío: el estado vive aquí; la lógica de envío está en mail/sending.ts.
export const setSendState = (
  patch: Partial<Pick<State, 'progress' | 'stopReason' | 'testing' | 'confirming' | 'testAddress'>>,
) => set(patch)

export function setStatus(index: number, status: SendStatus) {
  set((state) => ({ statuses: new Map(state.statuses).set(index, status) }))
}
