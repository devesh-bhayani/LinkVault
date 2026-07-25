import type { Link } from './types'

const CSV_COLUMNS: (keyof Link)[] = [
  'id',
  'url',
  'title',
  'description',
  'category',
  'source',
  'sender_username',
  'sender_message_context',
  'original_timestamp',
  'is_read',
  'created_at',
  'updated_at',
]

// Excel/Sheets execute a cell whose text starts with one of these. Link
// titles and Instagram message context are third-party text, so neutralize
// them with a leading apostrophe (GAPS #10). No exported column is numeric,
// so prefixing '-' costs nothing here.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (FORMULA_TRIGGER.test(str)) str = `'${str}`
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function linksToCsv(links: Link[]): string {
  const header = CSV_COLUMNS.join(',')
  const rows = links.map(link =>
    CSV_COLUMNS.map(col => escapeCsv(link[col])).join(',')
  )
  return [header, ...rows].join('\n')
}

export function linksToJson(links: Link[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      count: links.length,
      links,
    },
    null,
    2,
  )
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportLinksAsCsv(links: Link[]): void {
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(linksToCsv(links), `linkvault-${date}.csv`, 'text/csv;charset=utf-8')
}

export function exportLinksAsJson(links: Link[]): void {
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(linksToJson(links), `linkvault-${date}.json`, 'application/json')
}
