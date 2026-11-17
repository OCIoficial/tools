import {
  Anchor,
  Button,
  Card,
  CloseButton,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  Title,
} from '@mantine/core'
import { Link, RichTextEditor } from '@mantine/tiptap'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useLocalStorage } from '@mantine/hooks'
import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { HelpPopover, HelpRows, HelpSection } from './HelpPopover.tsx'
import { usePrimaryTouch } from '../media.ts'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor.tsx'
import { FIELD_LABELS, type BodyFormat, type TemplateField } from '../merge/template.ts'
import { updateTemplate, useSending, useStore } from '../store.ts'

type TextField = Exclude<TemplateField, 'body'>

/** Rarely used fields: hidden until requested with their link next to To, as in Gmail. */
const OPTIONAL_FIELDS = ['cc', 'bcc', 'replyTo'] as const satisfies TextField[]
type OptionalField = (typeof OPTIONAL_FIELDS)[number]

const FORMATS: { value: BodyFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'richtext', label: 'Rich text' },
]

/**
 * A text field of the template. It reads only its own value from the store: typing in Subject
 * re-renders this field and nothing else.
 */
function TemplateTextInput({
  field,
  inputRef,
  onFocus,
  onClose,
  ...props
}: {
  field: TextField
  inputRef: Ref<HTMLInputElement>
  onFocus: () => void
  /** Optional field: when empty, shows a ✕ to hide it (closing must not delete anything). */
  onClose?: () => void
} & Omit<Partial<TextInputProps>, 'onFocus'>) {
  const value = useStore((state) => state.template[field])
  return (
    <TextInput
      label={FIELD_LABELS[field]}
      value={value}
      ref={inputRef}
      onFocus={onFocus}
      onChange={(event) => updateTemplate({ [field]: event.currentTarget.value })}
      rightSection={
        onClose && value === '' ? (
          <CloseButton size="sm" aria-label={`Remove ${FIELD_LABELS[field]}`} onClick={onClose} />
        ) : undefined
      }
      {...props}
    />
  )
}

/** The Markdown body; reads only the body text. */
function MarkdownBody({
  editorRef,
  vim,
  onFocus,
}: {
  editorRef: Ref<MarkdownEditorHandle>
  vim: boolean
  onFocus: () => void
}) {
  const markdown = useStore((state) => state.template.markdown)
  const sending = useSending()
  return (
    <MarkdownEditor
      ref={editorRef}
      readOnly={sending}
      aria-label={FIELD_LABELS.body}
      placeholder={'Hi {{ name }},\n\nYour **balance** is {{ amount }}.'}
      value={markdown}
      vim={vim}
      onFocus={onFocus}
      onChange={(markdown) => updateTemplate({ markdown })}
    />
  )
}

/**
 * The template card. It does not read the texts (each field reads its own), only the format, the
 * columns for the variable buttons and whether the optional fields have something.
 */
export function TemplateEditor() {
  const format = useStore((state) => state.template.format)
  const columns = useStore((state) => state.dataset?.columns)
  const filled = {
    cc: useStore((state) => state.template.cc !== ''),
    bcc: useStore((state) => state.template.bcc !== ''),
    replyTo: useStore((state) => state.template.replyTo !== ''),
  }
  const inputs = useRef<Partial<Record<TextField, HTMLInputElement | null>>>({})
  const markdownEditor = useRef<MarkdownEditorHandle>(null)
  // Personal preference, not part of the template: saved separately.
  const [vim, setVim] = useLocalStorage({ key: 'mail-merge:vim', defaultValue: false, getInitialValueInEffect: false })
  // Vim needs a physical keyboard: on touch it is not offered and stays off, although the preference
  // is kept (for example, when using a tablet with and without a keyboard).
  const keyboard = !usePrimaryTouch()
  const [target, setTarget] = useState<TemplateField>('body')
  const toId = useId()
  // Opened in this session. A field with a value is always shown, even if it is not here:
  // the template is saved in the browser, and a hidden Bcc that still gets sent would be worse.
  const [opened, setOpened] = useState<ReadonlySet<OptionalField>>(() => new Set())
  const isVisible = (field: OptionalField) => opened.has(field) || filled[field]
  const visibleOptional = OPTIONAL_FIELDS.filter(isVisible)
  const hiddenOptional = OPTIONAL_FIELDS.filter((field) => !isVisible(field))

  function openField(field: OptionalField) {
    setOpened((current) => new Set(current).add(field))
    // The cursor goes to the new field, so it also receives the variables that are inserted.
    requestAnimationFrame(() => inputs.current[field]?.focus())
  }

  function closeField(field: OptionalField) {
    setOpened((current) => {
      const next = new Set(current)
      next.delete(field)
      return next
    })
    if (target === field) setTarget('body')
  }

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), Link.configure({ openOnClick: false })],
    // Not controlled from React: the initial content is read once and then the editor is in charge.
    content: useStore.getState().template.body,
    onUpdate: ({ editor }) => updateTemplate({ body: editor.getHTML() }),
    onFocus: () => setTarget('body'),
  })

  // While sending, the editor is read-only (the other fields are locked by App's fieldset).
  const sending = useSending()
  useEffect(() => {
    editor?.setEditable(!sending, false)
  }, [editor, sending])

  function insertVariable(key: string) {
    const snippet = `{{ ${key} }}`
    if (target === 'body') {
      if (format === 'richtext') editor?.chain().focus().insertContent(snippet).run()
      else markdownEditor.current?.insert(snippet)
      return
    }
    const field = target
    const input = inputs.current[field]
    // Read on insert, without subscribing: the card does not re-render while typing.
    const value = useStore.getState().template[field]
    const start = input?.selectionStart ?? value.length
    const end = input?.selectionEnd ?? value.length
    updateTemplate({ [field]: value.slice(0, start) + snippet + value.slice(end) })
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + snippet.length, start + snippet.length)
    })
  }

  const textInput = (
    field: TextField,
    props: Omit<Partial<TextInputProps>, 'onFocus'> & { onClose?: () => void } = {},
  ) => (
    <TemplateTextInput
      key={field}
      field={field}
      inputRef={(element) => {
        inputs.current[field] = element
      }}
      onFocus={() => setTarget(field)}
      {...props}
    />
  )

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={4}>2. Template</Title>

        {columns && columns.length > 0 && (
          <Stack gap={4}>
            <Text size="sm">
              Variables (inserted into <b>{FIELD_LABELS[target]}</b>):
            </Text>
            <Group gap={6}>
              {columns.map((column) => (
                <Button
                  key={column.key}
                  size="compact-xs"
                  variant="light"
                  // Keeps the button from stealing focus and losing the cursor position.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertVariable(column.key)}
                >
                  {column.key}
                </Button>
              ))}
            </Group>
          </Stack>
        )}

        <Stack gap={4}>
          {/* Own label: the links cannot go inside To's <label>. */}
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text component="label" htmlFor={toId} size="sm" fw={500}>
              {FIELD_LABELS.to}
            </Text>
            {hiddenOptional.length > 0 && (
              <Group gap={2} wrap="nowrap">
                {hiddenOptional.map((field) => (
                  <Button
                    key={field}
                    size="compact-sm"
                    variant="subtle"
                    fw={500}
                    aria-label={`Add ${FIELD_LABELS[field]}`}
                    onClick={() => openField(field)}
                  >
                    {FIELD_LABELS[field]}
                  </Button>
                ))}
              </Group>
            )}
          </Group>
          {textInput('to', { id: toId, label: undefined, placeholder: '{{ email }}' })}
        </Stack>
        {visibleOptional.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="xs">
            {visibleOptional.map((field) => textInput(field, { onClose: () => closeField(field) }))}
          </SimpleGrid>
        )}
        {textInput('subject')}

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            {FIELD_LABELS.body}
          </Text>

          {format === 'markdown' ? (
            <MarkdownBody editorRef={markdownEditor} vim={vim && keyboard} onFocus={() => setTarget('body')} />
          ) : (
            <RichTextEditor editor={editor}>
              <RichTextEditor.Toolbar>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Bold />
                  <RichTextEditor.Italic />
                  <RichTextEditor.Underline />
                  <RichTextEditor.Strikethrough />
                  <RichTextEditor.ClearFormatting />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.H2 />
                  <RichTextEditor.H3 />
                  <RichTextEditor.BulletList />
                  <RichTextEditor.OrderedList />
                  <RichTextEditor.Blockquote />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Link />
                  <RichTextEditor.Unlink />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Undo />
                  <RichTextEditor.Redo />
                </RichTextEditor.ControlsGroup>
              </RichTextEditor.Toolbar>
              <RichTextEditor.Content mih={240} />
            </RichTextEditor>
          )}
          {/* Bottom bar of the editor, as in GitLab: formatting on the left, Vim on the right. */}
          <Group justify="space-between" gap="xs">
            <Group gap="xs">
              <SegmentedControl
                size="xs"
                aria-label="Body format"
                data={FORMATS}
                value={format}
                onChange={(value) => updateTemplate({ format: value as BodyFormat })}
                title="Each format keeps its own text; switching doesn't convert it."
              />
              <HelpPopover label="Syntax help">
                <HelpSection title="Variables (Liquid)">
                  <HelpRows
                    rows={[
                      ['{{ name }}', 'The value of column name in each row'],
                      ['{{ name | titlecase }}', 'Capitalizes each word'],
                      ['{{ amount | default: "0" }}', '"0" when the cell is empty'],
                      ['{% if group == "A" %}…{% endif %}', 'Only for some rows'],
                    ]}
                  />
                  <Anchor href="https://liquidjs.com/filters/overview.html" target="_blank" size="xs">
                    All Liquid filters ↗
                  </Anchor>
                </HelpSection>
                {format === 'markdown' && (
                  <HelpSection title="Markdown">
                    <HelpRows
                      rows={[
                        ['**bold**', 'Bold'],
                        ['*italic*', 'Italic'],
                        ['[text](https://…)', 'Link'],
                        ['- item', 'List'],
                      ]}
                    />
                    <Anchor href="https://commonmark.org/help/" target="_blank" size="xs">
                      Markdown guide ↗
                    </Anchor>
                  </HelpSection>
                )}
              </HelpPopover>
            </Group>
            {format === 'markdown' && keyboard && (
              <Switch size="xs" label="Vim" checked={vim} onChange={(event) => setVim(event.currentTarget.checked)} />
            )}
          </Group>
        </Stack>
      </Stack>
    </Card>
  )
}
