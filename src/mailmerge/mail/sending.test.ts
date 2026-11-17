/**
 * What Review shows is what is sent, in the same order: each message is decoded with an
 * independent parser (postal-mime) and compared with that row's email in Review.
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AuthError, SendLimitError, UnconfirmedSendError } from '../google/index.ts'
import type { RenderedEmail } from '../merge/render.ts'
import {
  reviewList,
  setDataset,
  setExcluded,
  trackLoad,
  updateShared,
  updateSources,
  updateTemplate,
  useStore,
  type SendMode,
} from '../store.ts'
import {
  describeReceived,
  expectedMessage,
  loadScenario,
  parseMessage,
  rowOf,
  type RowAttachment,
  type RowSpec,
} from '../test/fixtures.ts'
import { sendAll, stopSending } from './sending.ts'

/**
 * What happens with each send attempt. "stop": it goes out fine, but the user presses Stop while
 * sending.
 */
type Outcome = 'ok' | 'fail' | 'unconfirmed' | 'auth' | 'limit' | 'stop'

/** Outcomes that stop the sending after that email. */
const STOPPING: Outcome[] = ['unconfirmed', 'auth', 'limit', 'stop']

interface Call {
  raw: Uint8Array
  outcome: Outcome
}

/**
 * Fake Gmail: stores each message and responds according to `outcomes` (afterwards, "ok"). On each
 * send it also tries to edit everything that changes the emails, and records whether anything changed.
 */
function fakeGmail(outcomes: Outcome[] = []) {
  const calls: Call[] = []
  const lockViolations: string[] = []

  function tryToEdit() {
    const before = useStore.getState()
    updateTemplate({ subject: 'edited while sending' })
    setExcluded(new Set([0]))
    updateShared(() => [])
    updateSources(() => [])
    setDataset(null)
    const after = useStore.getState()
    for (const key of ['allEmails', 'emails', 'excluded', 'template', 'dataset', 'shared', 'sources'] as const) {
      if (after[key] !== before[key]) lockViolations.push(`${key} changed during send ${calls.length}`)
    }
  }

  async function send(raw: Uint8Array) {
    const outcome = outcomes[calls.length] ?? 'ok'
    calls.push({ raw, outcome })
    tryToEdit()
    switch (outcome) {
      case 'ok':
        return
      case 'stop':
        stopSending()
        return
      case 'fail':
        throw new Error('Rejected by Gmail')
      case 'unconfirmed':
        throw new UnconfirmedSendError('Connection lost')
      case 'auth':
        throw new AuthError('Session expired')
      case 'limit':
        throw new SendLimitError('Daily limit')
    }
  }

  return { send, calls, lockViolations }
}

type Gmail = ReturnType<typeof fakeGmail>

/** Rows the messages in `calls` went to, in order. */
async function rowsOf(calls: Call[]): Promise<number[]> {
  return (await Promise.all(calls.map(({ raw }) => parseMessage(raw)))).map(rowOf)
}

/** Each sent message is, once decoded, the Review email of its row. */
async function expectMatchesReview(calls: Call[], review: RenderedEmail[]) {
  const byRow = new Map(review.map((email) => [email.index, email]))
  for (const { raw } of calls) {
    const received = await parseMessage(raw)
    const email = byRow.get(rowOf(received))
    expect(email, 'message for a row that is not in Review').toBeDefined()
    expect(describeReceived(received)).toEqual(expectedMessage(email!))
  }
}

/** Rows that a send in that mode must send, in Review order. */
function toSend(mode: SendMode): number[] {
  const state = useStore.getState()
  return reviewList(state)
    .filter((email) => !state.excluded.has(email.index))
    .map((email) => email.index)
    .filter((index) => {
      const status = state.statuses.get(index)?.state
      return mode === 'pending' ? status !== 'sent' && status !== 'unconfirmed' : status === 'unconfirmed'
    })
}

/**
 * A complete send (Send, or Retry unconfirmed): it must send, in Review order, a prefix
 * of the rows it covers, and stop before the end only if the last attempt stopped it.
 */
async function sendAndCheck(gmail: Gmail, mode: SendMode) {
  const expected = toSend(mode)
  const from = gmail.calls.length
  await sendAll(gmail.send, mode, { minInterval: 0 })
  const calls = gmail.calls.slice(from)
  const rows = await rowsOf(calls)

  expect(rows).toEqual(expected.slice(0, rows.length))
  if (expected.length > 0) expect(rows.length).toBeGreaterThan(0)
  if (rows.length < expected.length) expect(STOPPING).toContain(calls.at(-1)?.outcome)
  expect(useStore.getState().progress).toBeNull()
}

// --- Generators -------------------------------------------------------------------------------

const WORDS = ['Ana', 'José', 'Zoë', 'Łukasz', 'María José', '李小龙', "O'Brien", 'Ünal', 'Émilie', 'Bjørn', 'Nguyễn']

/** Names with accents, other scripts and long ones (split into several "encoded words"). */
const nameArb = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 6 }).map((words) => words.join(' '))

/** Starts with a letter so it is not empty after normalization (which removes invisible characters). */
const textArb = (maxLength: number) =>
  fc
    .tuple(fc.constantFrom('A', 'Ñ', '€', 'ß', 'Ж'), fc.string({ unit: 'grapheme', maxLength }))
    .map(([first, rest]) => first + rest)

const rowArb: fc.Arbitrary<RowSpec> = fc.record({
  name: nameArb,
  subject: textArb(80),
  note: textArb(60),
  attachment: fc.constantFrom<RowAttachment>('own', 'folder', 'glob', 'missing'),
  attachmentName: fc.constantFrom('', 'Report', 'Invoice ñandú', 'résumé.txt', '数据 2026'),
  cc: fc.boolean(),
})

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  { arbitrary: fc.constant<Outcome>('ok'), weight: 8 },
  { arbitrary: fc.constantFrom<Outcome>('fail', 'unconfirmed', 'auth', 'limit', 'stop'), weight: 2 },
)

const scenarioArb = fc.array(rowArb, { minLength: 1, maxLength: 12 }).chain((rows) =>
  fc.record({
    rows: fc.constant(rows),
    excluded: fc.subarray(rows.map((_, i) => i)),
    outcomes: fc.array(outcomeArb, { maxLength: 25 }),
  }),
)

// --- Tests ------------------------------------------------------------------------------------

const row = (overrides: Partial<RowSpec> = {}): RowSpec => ({
  name: 'Ana',
  subject: 'Hello',
  note: 'Note',
  attachment: 'own',
  attachmentName: '',
  cc: false,
  ...overrides,
})

describe('sending matches Review', () => {
  it('sends the included rows in Review order, each exactly as Review shows it', async () => {
    loadScenario([row(), row({ attachment: 'folder' }), row({ attachment: 'glob' }), row(), row()], [1, 3])
    const review = reviewList(useStore.getState())
    const gmail = fakeGmail()

    await sendAll(gmail.send, 'pending', { minInterval: 0 })

    expect(await rowsOf(gmail.calls)).toEqual([0, 2, 4])
    await expectMatchesReview(gmail.calls, review)
    expect(gmail.lockViolations).toEqual([])
  })

  it('does not mix up ZIPs of folders that differ in one file', async () => {
    loadScenario([row({ attachment: 'folder' }), row({ attachment: 'glob' }), row({ attachment: 'folder' })])
    const review = reviewList(useStore.getState())
    const gmail = fakeGmail()

    await sendAll(gmail.send, 'pending', { minInterval: 0 })

    expect(await rowsOf(gmail.calls)).toEqual([0, 1, 2])
    await expectMatchesReview(gmail.calls, review)
  })

  it('after Stop, sending again continues with the next row', async () => {
    loadScenario([row(), row(), row(), row()])
    const gmail = fakeGmail(['ok', 'stop'])

    await sendAndCheck(gmail, 'pending')
    expect(await rowsOf(gmail.calls)).toEqual([0, 1])

    await sendAndCheck(gmail, 'pending')
    expect(await rowsOf(gmail.calls)).toEqual([0, 1, 2, 3])
  })

  it('a lost connection stops; Send remaining skips that row and Retry sends only it', async () => {
    loadScenario([row(), row(), row(), row()])
    const gmail = fakeGmail(['ok', 'unconfirmed'])

    await sendAndCheck(gmail, 'pending')
    expect(useStore.getState().statuses.get(1)?.state).toBe('unconfirmed')

    await sendAndCheck(gmail, 'pending')
    await sendAndCheck(gmail, 'unconfirmed')
    expect(await rowsOf(gmail.calls)).toEqual([0, 1, 2, 3, 1])
  })

  it('locks editing while sending and unlocks it afterwards', async () => {
    loadScenario([row(), row(), row()])
    const review = reviewList(useStore.getState())
    const gmail = fakeGmail()

    await sendAll(gmail.send, 'pending', { minInterval: 0 })
    expect(gmail.lockViolations).toEqual([])
    expect(reviewList(useStore.getState())).toBe(review)

    updateTemplate({ subject: 'after sending' })
    setExcluded(new Set([1]))
    expect(useStore.getState().template.subject).toBe('after sending')
    expect(useStore.getState().excluded).toEqual(new Set([1]))
  })

  it('does not start while files are still loading', async () => {
    loadScenario([row(), row()])
    const gmail = fakeGmail()
    let finishLoad = () => {}
    const load = trackLoad(() => new Promise<void>((resolve) => (finishLoad = resolve)))

    await sendAll(gmail.send, 'pending', { minInterval: 0 })
    expect(gmail.calls).toEqual([])

    finishLoad()
    await load
    await sendAll(gmail.send, 'pending', { minInterval: 0 })
    expect(await rowsOf(gmail.calls)).toEqual([0, 1])
  })

  it('for any rows, exclusions and Gmail responses: order, content and the lock hold', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ rows, excluded, outcomes }) => {
        loadScenario(rows, excluded)
        const state = useStore.getState()
        // With problems it cannot be sent (the UI does not allow it): those cases do not apply.
        fc.pre(state.problemCount === 0)
        const review = reviewList(state)
        const included = review.filter((email) => !state.excluded.has(email.index)).map((email) => email.index)
        const gmail = fakeGmail(outcomes)

        // Send / Send remaining while something is pending; then Retry unconfirmed.
        for (let attempt = 0; attempt < 100; attempt++) {
          const mode: SendMode | null =
            toSend('pending').length > 0 ? 'pending' : toSend('unconfirmed').length > 0 ? 'unconfirmed' : null
          if (!mode) break
          await sendAndCheck(gmail, mode)
        }

        await expectMatchesReview(gmail.calls, review)
        expect(gmail.lockViolations).toEqual([])
        // In the end each included row went out once, and no excluded one did.
        const delivered = (await rowsOf(gmail.calls.filter(({ outcome }) => outcome === 'ok' || outcome === 'stop')))
        expect([...delivered].sort((a, b) => a - b)).toEqual(included)
        expect(reviewList(useStore.getState())).toBe(review)
      }),
      { numRuns: 100 },
    )
  })
})
