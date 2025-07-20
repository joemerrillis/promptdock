create table if not exists plugin_chunks (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  content text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now()
);
