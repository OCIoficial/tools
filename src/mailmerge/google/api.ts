import { AuthError } from '../../shared/google/index.ts'
import type { Spreadsheet } from '../sources.ts'

export { AuthError }

async function googleFetch<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) {
    throw new AuthError('Your Google session expired. Sign in again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Google API error ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function getSpreadsheet(token: string, id: string): Promise<Spreadsheet> {
  const data = await googleFetch<{
    properties: { title: string }
    sheets: { properties: { title: string } }[]
  }>(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}` +
      '?fields=properties.title,sheets.properties.title',
  )
  return {
    id,
    title: data.properties.title,
    sheets: data.sheets.map((sheet) => sheet.properties.title),
  }
}

export async function getSheetValues(token: string, id: string, sheet: string): Promise<string[][]> {
  const range = `'${sheet.replaceAll("'", "''")}'`
  const data = await googleFetch<{ values?: string[][] }>(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}` +
      `/values/${encodeURIComponent(range)}`,
  )
  return data.values ?? []
}
