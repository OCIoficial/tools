import { create } from 'zustand'
import type { PathSource, SharedAttachment } from './attachments/model.ts'
import type { Dataset } from './merge/dataset.ts'
import { normalizeDataset, type Normalization, type NormalizedDataset } from './merge/normalize.ts'
import { compileTemplate, renderEmail, type CompiledTemplate, type RenderedEmail } from './merge/render.ts'
import { DEFAULT_SHEET_SETTINGS, type SheetSettings } from './merge/sheetSettings.ts'
import { EMPTY_TEMPLATE, type EmailTemplate } from './merge/template.ts'

/**
 * Shared app state. Each component reads only what it uses with a selector, so typing in
 * Subject does not re-render the table, the attachments or the header.
 *
 * Rules for selectors (Zustand 5): return values already stored in the state, or primitives.
 * A selector that builds a new object or array on every call re-renders forever.
 */

export type SendStatus =
  | { state: 'sending' }
  | { state: 'sent'; at: number }
  | { state: 'failed'; error: string }
  /** No response from Gmail: it may have been sent. "Send remaining" does not retry it. */
  | { state: 'unconfirmed'; error: string }

/** What the confirmation dialog sends: the pending emails, or a retry of the unconfirmed ones. */
export type SendMode = 'pending' | 'unconfirmed'

export interface SendProgress {
  done: number
  total: number
}

interface State {
  /** Saved in localStorage. */
  template: EmailTemplate
  /** Header and normalization per sheet (see sheetKey); saved in localStorage. */
  sheetSettings: Record<string, SheetSettings>
  dataset: Dataset | null
  /** Changes with each loaded spreadsheet; resets Review's local state. */
  datasetVersion: number
  /** Rows that are not sent, by index. */
  excluded: Set<number>
  /** Attachments that go in every email; not saved between sessions (nor their names). */
  shared: SharedAttachment[]
  /** Folders or archives with their paths; not saved between sessions (nor their paths). */
  sources: PathSource[]

  // Derived: recomputed in the actions, never in the components.
  normalized: NormalizedDataset | null
  compiled: CompiledTemplate
  /** Every row (Review also shows the excluded ones). */
  allEmails: RenderedEmail[]
  /** Only the included ones: the ones that are sent. */
  emails: RenderedEmail[]
  /** Included emails with something to fix. */
  problemCount: number

  /** Loads in progress (spreadsheet or attachments): sending cannot start until they finish. */
  loads: number

  // Sending.
  statuses: Map<number, SendStatus>
  progress: SendProgress | null
  /** Why a send stopped before finishing (session, daily limit or Stop). */
  stopReason: string | null
  /** null = not edited yet: the signed-in account's email is used. */
  testAddress: string | null
  testing: boolean
  /** Confirmation dialog open, and for which send. */
  confirming: SendMode | false
}

// --- localStorage: same keys and format as before, so nothing saved is lost -------------------

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
    // Out of space or blocked: the app keeps working, it just does not remember.
  }
}

// --- Derived ------------------------------------------------------------------------------------

export function settingsFor(state: Pick<State, 'sheetSettings'>, key: string | undefined): SheetSettings {
  return key ? { ...DEFAULT_SHEET_SETTINGS, ...state.sheetSettings[key] } : DEFAULT_SHEET_SETTINGS
}

/** Normalization of the current sheet; same reference while it does not change (fit for selectors). */
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

/** Older saved data may include attachment paths: they now live with their source and are not saved. */
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
 * While sending, everything that changes the emails or which ones are sent is locked: so what
 * Review shows is exactly what goes out, in the same order. The UI is locked too; this guard
 * is the guarantee even if something slips through (a shortcut, a load that finishes).
 */
export const isSending = (state: Pick<State, 'progress'> = get()) => state.progress !== null

/** For the UI: true while sending (editing is locked). */
export const useSending = () => useStore(isSending)

/** Review order: every row in spreadsheet order, or only the included ones with problems. */
export function reviewList(
  state: Pick<State, 'allEmails' | 'excluded'>,
  filter: 'all' | 'problems' = 'all',
): RenderedEmail[] {
  if (filter === 'all') return state.allEmails
  return state.allEmails.filter((email) => !state.excluded.has(email.index) && email.problems.length > 0)
}

/** Counts a load in progress while `task` runs. */
export async function trackLoad<T>(task: () => Promise<T>): Promise<T> {
  set((state) => ({ loads: state.loads + 1 }))
  try {
    return await task()
  } finally {
    set((state) => ({ loads: state.loads - 1 }))
  }
}

/** Emails are regenerated when the user stops typing, not on every keystroke. */
const EMAILS_DELAY = 150
let emailsTimer: ReturnType<typeof setTimeout> | undefined

function recomputeEmailsNow() {
  clearTimeout(emailsTimer)
  emailsTimer = undefined
  set(withEmails(get()))
}

/** Regenerates the emails if a regeneration is pending (before sending). */
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

/** New spreadsheet: the excluded rows and the sending state no longer refer to the same rows. */
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
    // Only the loaded sheet affects the normalized data and the emails.
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
 * Changes the attachments. When typing (names, paths) the emails are regenerated once the user
 * stops typing; when adding, removing or reordering, right away.
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

/** With a function, because a load may finish after other changes. */
export function updateShared(update: (shared: SharedAttachment[]) => SharedAttachment[], { typing = false } = {}) {
  setAttachments({ shared: update(get().shared) }, typing)
}

export function updateSources(update: (sources: PathSource[]) => PathSource[], { typing = false } = {}) {
  setAttachments({ sources: update(get().sources) }, typing)
}

// Sending: the state lives here; the sending logic is in mail/sending.ts.
export const setSendState = (
  patch: Partial<Pick<State, 'progress' | 'stopReason' | 'testing' | 'confirming' | 'testAddress'>>,
) => set(patch)

export function setStatus(index: number, status: SendStatus) {
  set((state) => ({ statuses: new Map(state.statuses).set(index, status) }))
}
