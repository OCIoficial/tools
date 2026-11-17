import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorSelection, Prec, type Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import CodeMirror from '@uiw/react-codemirror'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

/*
 * Colores y bordes desde las variables de Mantine: el editor sigue el tema claro u oscuro
 * sin cambiar de extensión, y se ve como los demás campos del template.
 */
const theme = EditorView.theme({
  '&': {
    border: '1px solid var(--mantine-color-default-border)',
    borderRadius: 'var(--mantine-radius-sm)',
    backgroundColor: 'var(--mantine-color-default)',
    color: 'var(--mantine-color-text)',
    fontSize: '13px',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--mantine-primary-color-filled)',
  },
  '.cm-scroller': { fontFamily: 'var(--mantine-font-family-monospace)', lineHeight: '1.6' },
  '.cm-content': { padding: '8px 0', minHeight: '220px', caretColor: 'var(--mantine-color-text)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-cursor': { borderLeftColor: 'var(--mantine-color-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--mantine-primary-color-light) !important',
  },
  '.cm-placeholder': { color: 'var(--mantine-color-placeholder)' },
  // Barra de estado de Vim (modo y línea de comandos ":").
  '.cm-vim-panel': {
    padding: '2px 12px',
    borderTop: '1px solid var(--mantine-color-default-border)',
    backgroundColor: 'var(--mantine-color-default-hover)',
    color: 'var(--mantine-color-dimmed)',
    fontFamily: 'var(--mantine-font-family-monospace)',
    fontSize: '12px',
  },
  '.cm-vim-panel input': { color: 'var(--mantine-color-text)', fontFamily: 'inherit' },
  '.cm-panels': { backgroundColor: 'transparent', color: 'inherit' },
  '.cm-panels-bottom': { borderTop: 'none' },
  '.cm-fat-cursor': { backgroundColor: 'var(--mantine-primary-color-filled) !important', color: 'var(--mantine-color-white) !important' },
  // Etiquetas Liquid: {{ variable }} y {% if %}.
  '.cm-liquid': {
    borderRadius: '3px',
    backgroundColor: 'var(--mantine-primary-color-light)',
    color: 'var(--mantine-primary-color-light-color)',
  },
})

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--mantine-color-text)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--mantine-color-anchor)' },
  { tag: tags.monospace, color: 'var(--mantine-color-dimmed)' },
  { tag: tags.quote, color: 'var(--mantine-color-dimmed)', fontStyle: 'italic' },
  // Los símbolos de Markdown (**, #, -, [ ]) atenuados, para que el texto se lea primero.
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.list], color: 'var(--mantine-color-dimmed)' },
])

const liquidMatcher = new MatchDecorator({
  regexp: /\{\{[^}]*\}\}|\{%[^%]*%\}/g,
  decoration: Decoration.mark({ class: 'cm-liquid' }),
})

const liquidTags = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = liquidMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = liquidMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/** Envuelve la selección con un marcador (Ctrl+B → **texto**), o lo quita si ya lo tiene. */
function toggleMark(mark: string) {
  const n = mark.length
  return (view: EditorView) => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to)
        if (text.length >= 2 * n && text.startsWith(mark) && text.endsWith(mark)) {
          return {
            changes: { from: range.from, to: range.to, insert: text.slice(n, -n) },
            range: EditorSelection.range(range.from, range.to - 2 * n),
          }
        }
        return {
          changes: [
            { from: range.from, insert: mark },
            { from: range.to, insert: mark },
          ],
          range: EditorSelection.range(range.from + n, range.to + n),
        }
      }),
    )
    return true
  }
}

const baseExtensions: Extension[] = [markdown(), syntaxHighlighting(highlight), liquidTags, theme, EditorView.lineWrapping]

/** Ctrl+B / Ctrl+I; sin Vim, porque en Vim esas teclas mueven el cursor. */
const markKeymap = keymap.of([
  { key: 'Mod-b', run: toggleMark('**') },
  { key: 'Mod-i', run: toggleMark('*') },
])

/** La extensión de Vim se descarga solo la primera vez que se activa. */
let vimExtension: Promise<Extension> | null = null
function loadVim() {
  vimExtension ??= import('@replit/codemirror-vim').then(({ vim }) => Prec.highest(vim({ status: true })))
  return vimExtension
}

export interface MarkdownEditorHandle {
  /** Inserta texto donde está el cursor (o reemplaza la selección) y devuelve el foco al editor. */
  insert: (text: string) => void
}

interface Props {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  /** Atajos de Vim, con barra de estado. */
  vim?: boolean
  /** Sin cambios posibles (mientras se envía). */
  readOnly?: boolean
  placeholder?: string
  'aria-label'?: string
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, onFocus, vim = false, readOnly = false, placeholder, 'aria-label': ariaLabel },
  ref,
) {
  const view = useRef<EditorView | null>(null)
  const [vimLoaded, setVimLoaded] = useState<Extension | null>(null)

  useEffect(() => {
    if (vim && !vimLoaded) void loadVim().then(setVimLoaded)
  }, [vim, vimLoaded])

  const extensions = useMemo(
    () => (vim && vimLoaded ? [vimLoaded, ...baseExtensions] : [...baseExtensions, markKeymap]),
    [vim, vimLoaded],
  )

  useImperativeHandle(ref, () => ({
    insert: (text) => {
      const current = view.current
      if (!current) return
      if (readOnly) return
      current.dispatch(current.state.replaceSelection(text))
      current.focus()
    },
  }))

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onCreateEditor={(created) => {
        view.current = created
      }}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      // Tema propio (arriba); sin números de línea ni plegado: es un correo, no código.
      theme="none"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        searchKeymap: true,
      }}
    />
  )
})
