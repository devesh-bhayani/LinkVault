export interface Link {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  category: string | null;
  source: 'manual' | 'instagram_export';
  sender_username: string | null;
  sender_message_context: string | null;
  original_timestamp: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface ExtractedLink {
  url: string;
  senderUsername: string;
  messageContext: string;
  originalTimestamp: Date;
  source: 'instagram_export';
}

export type LinkInsert = Omit<Link, 'id' | 'created_at' | 'updated_at'>;

export interface MetadataResult {
  title: string | null;
  description: string | null;
  favicon: string | null;
}
