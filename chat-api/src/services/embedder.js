import { createEmbedding } from './openaiService.js';
import { upsertChunk } from '../db/queries.js';

export async function embedChunksForFiles(filePath, content) {
  const chunks = splitByFunctionOrBlock(content);

  const embedded = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await createEmbedding(chunk);

    const meta = {
      file: filePath,
      chunk_index: i,
    };

    await upsertChunk({ content: chunk, embedding, metadata: meta });
    embedded.push({ chunk, meta });
  }

  return embedded;
}

function splitByFunctionOrBlock(code) {
  return code
    .split(/\n(?=\s*(export\s)?(function|const|async|class)\s)/)
    .filter(Boolean);
}
