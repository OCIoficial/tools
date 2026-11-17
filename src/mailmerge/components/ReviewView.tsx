import {
  ActionIcon,
  Anchor,
  Button,
  Checkbox,
  Grid,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconArrowLeft, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useRef, useState } from 'react'
import type { ResolvedAttachment } from '../attachments/resolve.ts'
import { formatSize } from '../attachments/tree.ts'
import { reviewList, setExcluded, useSending, useStore, type SendStatus } from '../store.ts'
import { SendPanel } from './SendPanel.tsx'
import { rangeBetween, setIncluded } from '../merge/exclusion.ts'
import { PROBLEM_LABELS, type RenderedEmail } from '../merge/render.ts'
import { FIELD_LABELS } from '../merge/template.ts'
import { Notice, WarningIcon } from './Notice.tsx'
import classes from './ReviewView.module.css'
import { useIsMobile } from '../media.ts'

type Filter = 'all' | 'problems'
type Device = 'desktop' | 'mobile'

const ADDRESS_FIELDS = ['to', 'cc', 'bcc', 'replyTo'] as const

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function PaperclipIcon() {
  return (
    <svg {...iconProps} width={13} height={13} viewBox="0 0 24 24">
      <path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </svg>
  )
}

function FileIcon({ zip }: { zip: boolean }) {
  return (
    <svg {...iconProps} width={14} height={14} viewBox="0 0 24 24" strokeWidth={1.75} style={{ flex: 'none' }}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      {zip && <path d="M10 9v1M10 12v1M10 15v1" />}
    </svg>
  )
}

/** The HTML is isolated in an iframe without scripts (see docs/google-access.md, section 4). */
function EmailBody({ html, device }: { html: string; device: Device }) {
  const [height, setHeight] = useState(120)
  return (
    <div className={classes.paper} data-mobile={device === 'mobile' || undefined}>
      <iframe
        title="Email body"
        sandbox="allow-same-origin"
        srcDoc={`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.5;margin:16px;color:#222;background:#fff;overflow-wrap:anywhere}</style>${html}`}
        style={{ height }}
        onLoad={(event) => {
          const document = event.currentTarget.contentDocument
          if (document) setHeight(document.documentElement.scrollHeight)
        }}
      />
    </div>
  )
}

function AttachmentChips({ attachments }: { attachments: ResolvedAttachment[] }) {
  return (
    <div className={classes.chips}>
      {attachments.map((attachment, i) => {
        const title = (
          <span className={classes.chipTitle}>
            <FileIcon zip={attachment.kind === 'zip'} />
            <span className={classes.chipName}>{attachment.filename}</span>
            <span className={classes.chipSize}>{formatSize(attachment.size)}</span>
          </span>
        )
        return attachment.kind === 'zip' ? (
          // A ZIP is expanded to show which files it includes.
          <details key={i} className={classes.chip}>
            <summary title={`${attachment.entries.length} files, click to list them`}>{title}</summary>
            <ul className={classes.zipFiles}>
              {attachment.entries.map(({ path }) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          </details>
        ) : (
          <span key={i} className={classes.chip}>
            {title}
          </span>
        )
      })}
    </div>
  )
}

function EmailRow({ email, status }: { email: RenderedEmail; status?: SendStatus }) {
  return (
    <div className={classes.row}>
      <span className={classes.number}>#{email.index + 1}</span>
      <div className={classes.lines}>
        <div className={email.to ? classes.recipient : `${classes.recipient} ${classes.missing}`}>
          {email.to || 'No recipient'}
        </div>
        <div className={email.subject ? classes.subjectLine : `${classes.subjectLine} ${classes.missing}`}>
          {email.subject || 'No subject'}
        </div>
      </div>
      <div className={classes.trailing}>
        {status?.state === 'sending' && <Loader size={12} aria-label="Sending" />}
        {status?.state === 'sent' && (
          <span className={classes.sent} title="Sent">
            ✓
          </span>
        )}
        {status?.state === 'failed' && (
          <span className={classes.failed} title={`Not sent: ${status.error}`}>
            ✕
          </span>
        )}
        {status?.state === 'unconfirmed' && (
          <span className={classes.unconfirmed} title="Not confirmed: may have been sent">
            ?
          </span>
        )}
        {email.attachments.length > 0 && (
          <span className={classes.clip} title={`${email.attachments.length} attachments`}>
            <PaperclipIcon />
            {email.attachments.length}
          </span>
        )}
        {email.problems.length > 0 && (
          <span className={classes.warning} title={`${email.problems.length} to fix`}>
            <WarningIcon size={13} />
            {email.problems.length}
          </span>
        )}
      </div>
    </div>
  )
}

function EmailDetail({
  email,
  device,
  status,
  excluded,
}: {
  email: RenderedEmail
  device: Device
  status?: SendStatus
  excluded: boolean
}) {
  const problemsByField = new Map<string, string[]>()
  for (const problem of email.problems) {
    problemsByField.set(problem.field, [...(problemsByField.get(problem.field) ?? []), problem.message])
  }
  const count = email.problems.length
  return (
    <Stack gap="sm">
      {excluded && (
        <Text size="sm" c="dimmed">
          This row is excluded and won't be sent. Check it in the list to include it.
        </Text>
      )}
      {status?.state === 'failed' && (
        <Notice tone="error" title="Not sent">
          {status.error}
        </Notice>
      )}
      {status?.state === 'unconfirmed' && (
        <Notice tone="warning" title="Not confirmed">
          {status.error} "Send remaining" skips it; retry it from the Send panel if it wasn't sent.
        </Notice>
      )}
      {status?.state === 'sent' && (
        <Text size="sm" className={classes.sent}>
          ✓ Sent at {new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
      {count > 0 && (
        <Notice
          tone="warning"
          title={count === 1 ? '1 thing to fix before sending' : `${count} things to fix before sending`}
        >
          <dl className={classes.problems}>
            {email.problems.map((problem, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt>{PROBLEM_LABELS[problem.field]}</dt>
                <dd>{problem.message}</dd>
              </div>
            ))}
          </dl>
        </Notice>
      )}

      <h3 className={classes.subject}>{email.subject || <span className={classes.missing}>No subject</span>}</h3>

      <dl className={classes.headers}>
        {ADDRESS_FIELDS.filter((field) => email[field] || field === 'to').map((field) => (
          <div key={field} style={{ display: 'contents' }}>
            <dt>{FIELD_LABELS[field]}</dt>
            <dd>
              {email[field] || <span className={classes.missing}>None</span>}
              {problemsByField.has(field) && (
                <span className={classes.warning} title={problemsByField.get(field)?.join('\n')}>
                  <WarningIcon size={13} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {email.attachments.length > 0 && <AttachmentChips attachments={email.attachments} />}
      {email.skippedAttachments.length > 0 && (
        <Text size="xs" c="dimmed">
          Sent without optional {email.skippedAttachments.length === 1 ? 'attachment' : 'attachments'} (nothing
          matched): {email.skippedAttachments.join(', ')}
        </Text>
      )}

      <EmailBody html={email.body} device={device} />
    </Stack>
  )
}

/** Review of the generated emails; reads the emails, the excluded rows and the sending from the store. */
export function ReviewView() {
  // Every row, including the excluded ones (shown dimmed).
  const emails = useStore((state) => state.allEmails)
  const excluded = useStore((state) => state.excluded)
  const templateErrors = useStore((state) => state.compiled.errors)
  const problemCount = useStore((state) => state.problemCount)
  const statuses = useStore((state) => state.statuses)
  // While sending, which rows are included does not change: the list is the one being sent.
  const sending = useSending()
  const onExcludedChange = setExcluded
  // By default the first email is shown as an example.
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [device, setDevice] = useState<Device>('desktop')
  const reducedMotion = useReducedMotion()
  const mobile = useIsMobile()
  // On a phone the list and the preview do not fit together: tapping an email opens its preview.
  const [detailOpen, setDetailOpen] = useState(false)

  // Problems in excluded rows do not count: they are not sent.
  const included = emails.filter((email) => !excluded.has(email.index))
  const withProblems = included.filter((email) => email.problems.length > 0)
  const lastClicked = useRef<number | null>(null)
  // If no problems are left, the filter goes back to "All" by itself.
  const activeFilter: Filter = withProblems.length === 0 ? 'all' : filter
  // The same order the sending uses (see reviewList and sendAll).
  const visible = reviewList({ allEmails: emails, excluded }, activeFilter)
  const current = emails.find((email) => email.index === selected) ?? visible[0]

  function toggleRow(index: number, include: boolean, range: boolean) {
    const order = visible.map((email) => email.index)
    onExcludedChange(setIncluded(excluded, range ? rangeBetween(order, lastClicked.current, index) : [index], include))
    lastClicked.current = index
  }

  // In the indeterminate state, a click includes them all, as in the Edit table.
  const allIncluded = included.length === emails.length
  const toggleAll = () => onExcludedChange(allIncluded ? new Set(emails.map((email) => email.index)) : new Set())

  const scrollToRow = (index: number) =>
    requestAnimationFrame(() =>
      document
        .getElementById(`email-${index}`)
        ?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }),
    )

  function open(index: number) {
    setSelected(index)
    if (mobile) {
      setDetailOpen(true)
      window.scrollTo({ top: 0 })
    }
  }

  function select(index: number) {
    open(index)
    if (!mobile) scrollToRow(index)
  }

  function closeDetail() {
    setDetailOpen(false)
    if (current) scrollToRow(current.index)
  }

  if (mobile && detailOpen && current) {
    const position = visible.findIndex((email) => email.index === current.index)
    const previous = visible[position - 1]
    const next = visible[position + 1]
    return (
      <Stack gap="sm">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Button variant="subtle" leftSection={<IconArrowLeft size={18} />} px="xs" onClick={closeDetail}>
            All emails
          </Button>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Previous email"
              disabled={!previous}
              onClick={() => previous && open(previous.index)}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text size="sm" c="dimmed" miw={56} ta="center" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {position + 1} of {visible.length}
            </Text>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Next email"
              disabled={!next}
              onClick={() => next && open(next.index)}
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        </Group>
        <Checkbox
          label="Include this row"
          disabled={sending}
          checked={!excluded.has(current.index)}
          onChange={(event) => toggleRow(current.index, event.currentTarget.checked, false)}
        />
        <div className={classes.detail}>
          <EmailDetail
            key={current.index}
            email={current}
            device="mobile"
            status={statuses.get(current.index)}
            excluded={excluded.has(current.index)}
          />
        </div>
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" gap="xs">
        <SegmentedControl
          size="xs"
          aria-label="Show emails"
          value={activeFilter}
          onChange={(value) => setFilter(value as Filter)}
          data={[
            { value: 'all', label: `All ${emails.length}` },
            { value: 'problems', label: `Needs fixing ${problemCount}`, disabled: problemCount === 0 },
          ]}
        />
        <SegmentedControl
          visibleFrom="sm"
          size="xs"
          aria-label="Body width"
          value={device}
          onChange={(value) => setDevice(value as Device)}
          data={[
            { value: 'desktop', label: 'Desktop' },
            { value: 'mobile', label: 'Mobile' },
          ]}
        />
      </Group>

      {templateErrors.length > 0 && (
        <Notice tone="error" title="The template has errors, so no emails can be generated">
          {templateErrors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </Notice>
      )}

      {withProblems.length > 0 && (
        <Notice tone="warning">
          {withProblems.length === 1 ? '1 email needs' : `${withProblems.length} emails need`} fixing before sending:{' '}
          {withProblems.map((email, i) => (
            <span key={email.index}>
              {i > 0 && ', '}
              <Anchor component="button" type="button" fz="inherit" onClick={() => select(email.index)}>
                #{email.index + 1}
              </Anchor>
            </span>
          ))}
        </Notice>
      )}

      {emails.length === 0 && templateErrors.length === 0 ? (
        <Text c="dimmed" size="sm">
          No emails yet. In Edit, choose a spreadsheet and include at least one row.
        </Text>
      ) : (
        <Grid gap="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              <ScrollArea.Autosize
                mah={mobile ? '60dvh' : 'calc(100vh - 260px)'}
                type="auto"
                offsetScrollbars="present"
              >
                <div className={classes.list}>
                  <div className={classes.listHeader}>
                    <Checkbox
                      size="xs"
                      aria-label="Include all rows"
                      disabled={sending}
                      checked={emails.length > 0 && allIncluded}
                      indeterminate={included.length > 0 && !allIncluded}
                      onChange={toggleAll}
                    />
                    <Text size="xs" c="dimmed">
                      {allIncluded ? `${emails.length} rows` : `${included.length} of ${emails.length} rows included`}
                    </Text>
                  </div>
                  {visible.map((email) => {
                    const isExcluded = excluded.has(email.index)
                    return (
                      <div
                        key={email.index}
                        id={`email-${email.index}`}
                        className={classes.item}
                        data-selected={email.index === current?.index || undefined}
                        data-excluded={isExcluded || undefined}
                      >
                        <Checkbox
                          size="xs"
                          aria-label={`Include row ${email.index + 1}`}
                          disabled={sending}
                          checked={!isExcluded}
                          onChange={(event) =>
                            toggleRow(
                              email.index,
                              event.currentTarget.checked,
                              (event.nativeEvent as MouseEvent).shiftKey,
                            )
                          }
                        />
                        <UnstyledButton
                          className={classes.itemButton}
                          aria-current={email.index === current?.index || undefined}
                          onClick={() => open(email.index)}
                        >
                          <EmailRow email={email} status={statuses.get(email.index)} />
                        </UnstyledButton>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea.Autosize>
              <SendPanel />
            </Stack>
          </Grid.Col>
          {!mobile && (
            <Grid.Col span={{ base: 12, md: 8 }}>
              {current && (
                <div className={classes.detail}>
                  <EmailDetail
                    key={current.index}
                    email={current}
                    device={device}
                    status={statuses.get(current.index)}
                    excluded={excluded.has(current.index)}
                  />
                </div>
              )}
            </Grid.Col>
          )}
        </Grid>
      )}
    </Stack>
  )
}
