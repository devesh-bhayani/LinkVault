import { describe, it, expect, beforeAll } from 'vitest'
import JSZip from 'jszip'
import { parseInstagramExport, autoDetectCurrentUser } from './instagram-parser'

/**
 * Inverse of decodeInstagramText: take normal text and re-encode it the way
 * Instagram's export mangles it — UTF-8 bytes written out as Latin-1 code
 * points. Lets us author readable strings and assert they decode back.
 */
function toInstagramMojibake(text: string): string {
  const utf8 = new TextEncoder().encode(text)
  return Array.from(utf8, byte => String.fromCharCode(byte)).join('')
}

// Mirrors the mock structure documented in CLAUDE.md §12.
const MOCK_CONVERSATION = {
  participants: [{ name: 'Test User' }, { name: 'creator_account' }],
  messages: [
    {
      sender_name: 'creator_account',
      timestamp_ms: 1710000000000,
      // "Here’s" with a curly apostrophe, stored as Instagram mojibake.
      content: toInstagramMojibake(
        'Thanks for commenting! Here’s your free resource: https://example.com/free-guide.pdf',
      ),
      type: 'Generic',
    },
    {
      sender_name: 'creator_account',
      timestamp_ms: 1709999000000,
      share: {
        link: 'https://notion.so/some-template-12345',
        share_text: 'Free Notion template',
      },
      type: 'Share',
    },
    {
      sender_name: 'Test User',
      timestamp_ms: 1709998000000,
      content: 'Thank you! Also check https://my-own-link.com',
      type: 'Generic',
    },
  ],
  title: 'creator_account',
  is_still_participant: true,
  thread_path: 'inbox/creator_account_20240310',
}

/** Build an in-memory Instagram-style export zip. JSZip.loadAsync accepts a
 *  Uint8Array, which the parser feeds straight through. */
async function buildExportZip(conversation: unknown): Promise<File> {
  const zip = new JSZip()
  zip.file(
    'your_instagram_activity/messages/inbox/creator_account_20240310/message_1.json',
    JSON.stringify(conversation),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return bytes as unknown as File
}

/** Build an export zip spanning multiple conversation folders. */
async function buildMultiExportZip(convs: { folder: string; conv: unknown }[]): Promise<File> {
  const zip = new JSZip()
  for (const { folder, conv } of convs) {
    zip.file(
      `your_instagram_activity/messages/inbox/${folder}/message_1.json`,
      JSON.stringify(conv),
    )
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return bytes as unknown as File
}

describe('parseInstagramExport', () => {
  let links: Awaited<ReturnType<typeof parseInstagramExport>>

  beforeAll(async () => {
    const file = await buildExportZip(MOCK_CONVERSATION)
    links = await parseInstagramExport(file, 'Test User')
  })

  it('extracts exactly the two links received from the creator', () => {
    expect(links).toHaveLength(2)
  })

  it('captures the URL embedded in message content', () => {
    expect(links.map(l => l.url)).toContain('https://example.com/free-guide.pdf')
  })

  it('captures the URL from the share.link field', () => {
    expect(links.map(l => l.url)).toContain('https://notion.so/some-template-12345')
  })

  it("ignores links in the current user's own messages", () => {
    expect(links.map(l => l.url)).not.toContain('https://my-own-link.com')
  })

  it('derives the sender username from the thread path', () => {
    expect(links.every(l => l.senderUsername === 'creator_account')).toBe(true)
  })

  it('decodes Instagram mojibake in the message context', () => {
    const withContext = links.find(l => l.messageContext.includes('Here'))
    expect(withContext?.messageContext).toContain('Here’s') // curly apostrophe restored
    expect(withContext?.messageContext).not.toContain('â') // mojibake byte gone
  })

  it('tags every extracted link as instagram_export', () => {
    expect(links.every(l => l.source === 'instagram_export')).toBe(true)
  })

  it('de-duplicates a URL that appears more than once', async () => {
    const dupeConversation = {
      ...MOCK_CONVERSATION,
      messages: [
        {
          sender_name: 'creator_account',
          timestamp_ms: 1710000000000,
          content: 'first https://example.com/dupe',
          type: 'Generic',
        },
        {
          sender_name: 'creator_account',
          timestamp_ms: 1710000001000,
          content: 'again https://example.com/dupe',
          type: 'Generic',
        },
      ],
    }
    const file = await buildExportZip(dupeConversation)
    const result = await parseInstagramExport(file, 'Test User')
    expect(result).toHaveLength(1)
  })
})

describe('autoDetectCurrentUser', () => {
  it('returns null on a single-conversation export (both participants tie)', async () => {
    // Ambiguous evidence — guessing here risks inverting the import (GAPS #7).
    const file = await buildExportZip(MOCK_CONVERSATION)
    expect(await autoDetectCurrentUser(file)).toBeNull()
  })

  it('detects the participant common to multiple conversations', async () => {
    const mkConv = (creator: string) => ({
      participants: [{ name: 'Test User' }, { name: creator }],
      messages: [],
      title: creator,
      thread_path: `inbox/${creator}`,
    })
    const file = await buildMultiExportZip([
      { folder: 'creator_a_1', conv: mkConv('creator_a') },
      { folder: 'creator_b_2', conv: mkConv('creator_b') },
    ])
    expect(await autoDetectCurrentUser(file)).toBe('Test User')
  })
})
