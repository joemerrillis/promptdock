import { supabase } from './supabase.js';

export async function upsertChunk({ content, embedding, metadata }) {
  return supabase.from('plugin_chunks').upsert({
    content,
    embedding,
    metadata,
  });
}
