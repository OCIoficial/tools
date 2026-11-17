export type BodyFormat = 'markdown' | 'richtext'

export interface EmailTemplate {
  to: string
  cc: string
  bcc: string
  replyTo: string
  subject: string
  /** Cuál de los dos cuerpos se usa. Se guardan ambos para no perder nada al cambiar. */
  format: BodyFormat
  /** Cuerpo en Markdown. */
  markdown: string
  /** HTML generado por el editor de texto enriquecido. */
  body: string
}

/** Campos que se renderizan en cada correo. */
export type TemplateField = 'to' | 'cc' | 'bcc' | 'replyTo' | 'subject' | 'body'

export const FIELD_LABELS: Record<TemplateField, string> = {
  to: 'To',
  cc: 'Cc',
  bcc: 'Bcc',
  replyTo: 'Reply-To',
  subject: 'Subject',
  body: 'Body',
}

export const EMPTY_TEMPLATE: EmailTemplate = {
  to: '',
  cc: '',
  bcc: '',
  replyTo: '',
  subject: '',
  format: 'markdown',
  markdown: '',
  body: '<p></p>',
}
