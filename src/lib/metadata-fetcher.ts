import type { MetadataResult } from './types';

export async function fetchMetadata(url: string): Promise<MetadataResult> {
  try {
    const response = await fetch('/api/fetch-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      return { title: null, description: null, favicon: null };
    }

    return await response.json();
  } catch {
    return { title: null, description: null, favicon: null };
  }
}
