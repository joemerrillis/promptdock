import { supabase } from '../db/supabase.js';

export async function composePromptFromContext(filePaths) {
  const fileSet = filePaths.map((f) => `'${f}'`).join(',');

  const { data, error } = await supabase.rpc('get_chunks_by_files', {
    filepaths: filePaths
  });

  if (error) throw new Error(error.message);

  return data.map(chunk => `// File: ${chunk.file}\n${chunk.content}`).join('\n\n');
}
