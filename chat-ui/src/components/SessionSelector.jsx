import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function SessionSelector({ currentSession, setCurrentSession }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    axios.get('/sessions').then((res) => setSessions(res.data));
  }, []);

  const createSession = async () => {
    const title = prompt('Enter session title:');
    if (!title) return;
    const res = await axios.post('/session', { title });
    setSessions([...sessions, res.data]);
    setCurrentSession(res.data);
  };

  return (
    <div className="mb-2">
      <label className="block text-sm font-bold mb-1">💬 Session</label>
      <select
        className="w-full border rounded p-1"
        value={currentSession?.id || ''}
        onChange={(e) => {
          const selected = sessions.find((s) => s.id === e.target.value);
          setCurrentSession(selected);
        }}
      >
        <option value="">Select session</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>{s.title || 'Untitled'}</option>
        ))}
      </select>
      <button className="mt-1 text-blue-600 text-xs underline" onClick={createSession}>
        + New Session
      </button>
    </div>
  );
}
