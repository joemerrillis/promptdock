import { supabase } from '../db/supabase.js';

export async function parseLogAndRetrieveFiles(logs) {
  const lines = logs.split('\n');
  const matches = lines.flatMap(line => {
    const match = line.match(/\/(src\/[^\s:'"()]+)/);
    return match ? [match[1]] : [];
  });

  const uniqueFiles = [...new Set(matches)];
  const { data, error } = await supabase
    .from('plugin_chunks')
    .select('*')
    .in('file', uniqueFiles);

  if (error) throw new Error(error.message);

  return data.map(d => `// File: ${d.file}\n${d.content}`).join('\n\n');
}
