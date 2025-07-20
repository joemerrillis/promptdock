// FILE: src/services/sessionService.js
export async function createSession(supabase, title, model = 'gpt-4') {
  return await supabase
    .from('chat_sessions')
    .insert([{ title, model }])
    .select()
    .single();
}

export async function getAllSessions(supabase) {
  return await supabase
    .from('chat_sessions')
    .select('*')
    .order('created_at', { ascending: false });
}
export async function getSessionById(supabase, id) {
  return await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', id)
    .single();
}
