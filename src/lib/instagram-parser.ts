import JSZip from 'jszip';
import { extractUrls } from './url-extractor';
import type { ExtractedLink } from './types';

// ── Encoding fix ───────────────────────────────────────────────────────────────
// Instagram exports use mojibake: bytes are written as Latin-1 code points inside
// a UTF-8 JSON file. Re-interpret them as raw bytes then decode as UTF-8.
function decodeInstagramText(text: string): string {
  try {
    const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return text;
  }
}

// ── Instagram data shapes ──────────────────────────────────────────────────────
interface InstagramMessage {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  share?: { link?: string; share_text?: string };
  type: string;
}

interface InstagramConversation {
  participants: { name: string }[];
  messages: InstagramMessage[];
  title: string;
  thread_path: string;
}

// ── Auto-detect the current user's display name ───────────────────────────────
// The logged-in user appears as a participant in every conversation.
// We sample up to SAMPLE_SIZE files and return the name with the most hits.
const SAMPLE_SIZE = 30;

export async function autoDetectCurrentUser(file: File): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(file);
    const messageFiles = Object.keys(zip.files)
      .filter(p => p.includes('messages/inbox/') && p.endsWith('.json'))
      .slice(0, SAMPLE_SIZE);

    if (messageFiles.length === 0) return null;

    const nameCounts = new Map<string, number>();

    for (const filePath of messageFiles) {
      try {
        const raw = await zip.files[filePath].async('string');
        const conv: InstagramConversation = JSON.parse(raw);
        if (!conv.participants) continue;
        for (const p of conv.participants) {
          const name = decodeInstagramText(p.name);
          nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
        }
      } catch {
        // skip malformed files
      }
    }

    if (nameCounts.size === 0) return null;

    // The current user appears in every sampled conversation
    let topName = '';
    let topCount = 0;
    nameCounts.forEach((count, name) => {
      if (count > topCount) { topCount = count; topName = name; }
    });

    return topName || null;
  } catch {
    return null;
  }
}

// ── Main parser ────────────────────────────────────────────────────────────────
export interface ParseProgress {
  processed: number;
  total: number;
  currentFile: string;
}

export async function parseInstagramExport(
  file: File,
  currentUserName: string,
  onProgress?: (progress: ParseProgress) => void,
): Promise<ExtractedLink[]> {
  const zip = await JSZip.loadAsync(file);
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  const messageFiles = Object.keys(zip.files).filter(
    p => p.includes('messages/inbox/') && p.endsWith('.json'),
  );

  const total = messageFiles.length;

  for (let i = 0; i < messageFiles.length; i++) {
    const filePath = messageFiles[i];

    onProgress?.({ processed: i, total, currentFile: filePath });

    let conversation: InstagramConversation;
    try {
      const raw = await zip.files[filePath].async('string');
      conversation = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!conversation.messages) continue;

    // Derive the sender username from thread_path (the folder name before the date suffix)
    const threadFolder = conversation.thread_path?.split('/').pop() ?? '';
    const senderHandle = threadFolder.replace(/_\d+$/, '');

    for (const message of conversation.messages) {
      const senderName = decodeInstagramText(message.sender_name);

      // Skip messages from the logged-in user
      if (senderName === currentUserName) continue;

      const timestamp = new Date(message.timestamp_ms);
      const sender = senderHandle || senderName;

      // 1. URLs embedded in message text
      if (message.content) {
        const decodedContent = decodeInstagramText(message.content);
        for (const url of extractUrls(decodedContent)) {
          const clean = url.replace(/\/+$/, '');
          if (!seenUrls.has(clean)) {
            seenUrls.add(clean);
            links.push({
              url: clean,
              senderUsername: sender,
              messageContext: decodedContent,
              originalTimestamp: timestamp,
              source: 'instagram_export',
            });
          }
        }
      }

      // 2. share.link field
      if (message.share?.link) {
        const clean = message.share.link.replace(/\/+$/, '');
        if (!seenUrls.has(clean)) {
          seenUrls.add(clean);
          links.push({
            url: clean,
            senderUsername: sender,
            messageContext: message.share.share_text
              ? decodeInstagramText(message.share.share_text)
              : '',
            originalTimestamp: timestamp,
            source: 'instagram_export',
          });
        }
      }
    }
  }

  onProgress?.({ processed: total, total, currentFile: '' });

  return links;
}
