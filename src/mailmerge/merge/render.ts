import { Liquid, type Template } from 'liquidjs'
import MarkdownIt from 'markdown-it'
import type { PathSource, SharedAttachment } from '../attachments/model.ts'
import { attachmentFrom, MAX_ATTACHMENTS_SIZE, withName, type ResolvedAttachment } from '../attachments/resolve.ts'
import { findPath, formatSize, hasGlob, splitPath, type AttachmentTree } from '../attachments/tree.ts'
import type { Row } from './dataset.ts'
import { titlecase } from './normalize.ts'
import { FIELD_LABELS, type EmailTemplate, type TemplateField } from './template.ts'

function createEngine(escapeHtml: boolean) {
  const engine = new Liquid({
    strictVariables: true,
    strictFilters: true,
    outputEscape: escapeHtml ? 'escape' : undefined,
  })
  engine.registerFilter('titlecase', titlecase)
  return engine
}

// Los campos de texto plano no se escapan; en el cuerpo HTML los valores sí.
const textEngine = createEngine(false)
const htmlEngine = createEngine(true)

// Sin HTML crudo; sin typographer, que cambiaría las comillas de las etiquetas Liquid.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false })

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/**
 * El cuerpo llega como HTML, así que `{% if a > 1 %}` llega como `{% if a &gt; 1 %}`.
 * Se decodifican las entidades solo dentro de las etiquetas Liquid.
 */
function decodeLiquidTags(html: string): string {
  return html.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (tag) =>
    tag.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]).replaceAll(' ', ' '),
  )
}

/**
 * HTML del cuerpo antes de aplicar Liquid. El Markdown se convierte primero, una sola vez,
 * para que los valores de la planilla nunca se interpreten como Markdown.
 */
function bodyHtml(template: EmailTemplate): string {
  return template.format === 'markdown' ? markdown.render(template.markdown) : template.body
}

const FIELDS = Object.keys(FIELD_LABELS) as TemplateField[]
export const ADDRESS_FIELDS: TemplateField[] = ['to', 'cc', 'bcc', 'replyTo']

interface CompiledPath {
  /** null si la ruta tiene un error de sintaxis. */
  templates: Template[] | null
  name: Template[] | null
  required: boolean
}

export interface CompiledTemplate {
  fields: Partial<Record<TemplateField, Template[]>>
  /** Adjuntos comunes, en orden; name null si el nombre tiene un error de sintaxis. */
  shared: { attachment: SharedAttachment; name: Template[] | null }[]
  /** Fuentes de rutas, en orden, cada una con sus rutas. */
  sources: { tree: AttachmentTree; label: string; paths: CompiledPath[] }[]
  /** Errores de sintaxis; si hay alguno, ningún correo se puede renderizar. */
  errors: string[]
}

export interface Attachments {
  shared: SharedAttachment[]
  sources: PathSource[]
}

/** Nombre con que se muestra un adjunto común en los mensajes. */
export const sharedLabel = ({ file, name }: SharedAttachment) => name.trim() || file.filename

export function compileTemplate(template: EmailTemplate, attachments: Attachments): CompiledTemplate {
  const compiled: CompiledTemplate = { fields: {}, shared: [], sources: [], errors: [] }
  for (const field of FIELDS) {
    try {
      compiled.fields[field] =
        field === 'body' ? htmlEngine.parse(decodeLiquidTags(bodyHtml(template))) : textEngine.parse(template[field])
    } catch (e) {
      compiled.errors.push(`${FIELD_LABELS[field]}: ${(e as Error).message}`)
    }
  }
  for (const attachment of attachments.shared) {
    try {
      compiled.shared.push({ attachment, name: textEngine.parse(attachment.name) })
    } catch (e) {
      compiled.shared.push({ attachment, name: null })
      compiled.errors.push(`Attachment "${sharedLabel(attachment)}": ${(e as Error).message}`)
    }
  }
  // Con una sola fuente, los mensajes no necesitan nombrarla.
  const named = attachments.sources.length > 1
  for (const source of attachments.sources) {
    const label = named ? `${source.tree.name}, path` : 'Path'
    const paths = source.paths.map(({ path, name, required }, i): CompiledPath => {
      try {
        return { templates: textEngine.parse(path), name: textEngine.parse(name), required }
      } catch (e) {
        compiled.errors.push(`${label} ${i + 1}: ${(e as Error).message}`)
        return { templates: null, name: null, required }
      }
    })
    compiled.sources.push({ tree: source.tree, label, paths })
  }
  return compiled
}

export type ProblemField = TemplateField | 'attachments'

export const PROBLEM_LABELS: Record<ProblemField, string> = { ...FIELD_LABELS, attachments: 'Attachments' }

export interface Problem {
  field: ProblemField
  message: string
}

export type RenderedEmail = Record<TemplateField, string> & {
  index: number
  attachments: ResolvedAttachment[]
  /** Rutas opcionales que no se encontraron: el correo sale sin esos adjuntos. */
  skippedAttachments: string[]
  problems: Problem[]
}

const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

/** Separa "a@x.com, Nombre <b@y.com>" en direcciones; acepta coma o punto y coma. */
export function splitAddresses(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function addressOf(entry: string): string {
  return entry.match(/<([^>]*)>\s*$/)?.[1].trim() ?? entry
}

function resolveAttachments(compiled: CompiledTemplate, row: Row, email: RenderedEmail) {
  const problem = (message: string) => email.problems.push({ field: 'attachments', message })

  // Primero los comunes, en orden.
  for (const { attachment, name: nameTemplates } of compiled.shared) {
    let name = ''
    try {
      name = nameTemplates ? (textEngine.renderSync(nameTemplates, row) as string) : ''
    } catch (e) {
      problem(`"${sharedLabel(attachment)}": ${(e as Error).message}`)
      continue
    }
    const { file } = attachment
    email.attachments.push(withName({ kind: 'file', filename: file.filename, size: file.size, file }, name))
  }

  // Luego las rutas de cada fuente, en orden.
  for (const { tree, label, paths } of compiled.sources) {
    paths.forEach(({ templates, name: nameTemplates, required }, i) => {
      if (!templates) return
      const where = `${label} ${i + 1}`
      // Opcional y sin archivo: no es un problema, el correo sale sin ese adjunto.
      const missing = (path: string, message: string) =>
        required ? problem(message) : email.skippedAttachments.push(path || where)
      let path: string
      let name: string
      try {
        path = (textEngine.renderSync(templates, row) as string).trim()
        name = nameTemplates ? (textEngine.renderSync(nameTemplates, row) as string) : ''
      } catch (e) {
        problem(`${where}: ${(e as Error).message}`)
        return
      }
      const inTree = compiled.sources.length > 1 ? ` in "${tree.name}"` : ''
      // Antes "/" adjuntaba todo lo cargado; ahora eso es un adjunto común.
      if (path === '/') {
        return problem(
          `${where}: "/" is no longer supported. Add the file under "Attached to every email", or use "*" for everything${inTree}.`,
        )
      }
      if (splitPath(path).length === 0) return missing(path, `${where} is empty.`)

      const matches = findPath(tree, path)
      if (matches.length === 0) return missing(path, `"${path}" not found${inTree}.`)
      // Sin comodines debe haber un solo resultado; Drive permite nombres repetidos.
      if (!hasGlob(path) && matches.length > 1)
        return problem(`"${path}" matches ${matches.length} items with the same name${inTree}.`)
      // Una ruta es un solo adjunto, aunque calce con varias cosas.
      const attachment = attachmentFrom(tree, matches)
      if (attachment.kind === 'zip' && attachment.entries.length === 0) return missing(path, `"${path}" has no files.`)
      email.attachments.push(withName(attachment, name))
    })
  }

  // Dos adjuntos con el mismo nombre: los clientes de correo los muestran de forma inconsistente.
  const byName = new Map<string, number>()
  for (const { filename } of email.attachments) {
    const key = filename.toLowerCase()
    byName.set(key, (byName.get(key) ?? 0) + 1)
  }
  const reported = new Set<string>()
  for (const { filename } of email.attachments) {
    const key = filename.toLowerCase()
    const count = byName.get(key) ?? 0
    if (count < 2 || reported.has(key)) continue
    reported.add(key)
    problem(`${count === 2 ? 'Two' : count} attachments are named "${filename}". Give one of them another name.`)
  }

  const total = email.attachments.reduce((sum, attachment) => sum + attachment.size, 0)
  if (total > MAX_ATTACHMENTS_SIZE) {
    problem(`${formatSize(total)} in total; Gmail allows up to 25 MB.`)
  }
}

export function renderEmail(
  compiled: CompiledTemplate,
  row: Row,
  index: number,
): RenderedEmail {
  const email: RenderedEmail = {
    index,
    attachments: [],
    skippedAttachments: [],
    problems: [],
    to: '',
    cc: '',
    bcc: '',
    replyTo: '',
    subject: '',
    body: '',
  }

  for (const field of FIELDS) {
    const templates = compiled.fields[field]
    if (!templates) continue
    try {
      const output = (field === 'body' ? htmlEngine : textEngine).renderSync(templates, row) as string
      email[field] = field === 'body' ? output : output.trim()
    } catch (e) {
      email.problems.push({ field, message: (e as Error).message })
    }
  }

  const failed = new Set(email.problems.map((problem) => problem.field))
  if (!email.to && !failed.has('to')) email.problems.push({ field: 'to', message: 'no recipient.' })
  if (!email.subject && !failed.has('subject')) email.problems.push({ field: 'subject', message: 'is empty.' })
  for (const field of ADDRESS_FIELDS) {
    for (const entry of splitAddresses(email[field])) {
      if (!EMAIL_PATTERN.test(addressOf(entry))) {
        email.problems.push({ field, message: `"${entry}" is not a valid email address.` })
      }
    }
  }
  resolveAttachments(compiled, row, email)
  return email
}
