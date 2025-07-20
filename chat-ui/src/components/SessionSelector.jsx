import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function SessionSelector({ currentSession, setCurrentSession }) {
  const [sessions, setSessions] = useState([]);
  const [title, setTitle] = useState('');
  const [model, setModel] = useState('gpt-4');

  useEffect(() => {
    axios.get('/session').then((res) => setSessions(res.data.chat_sessions));
  }, [currentSession]);

  const createSession = async () => {
    const res = await axios.post('/session', {
      title,
      model,
    });
    setCurrentSession(res.data.session);
    setTitle('');
    setModel('gpt-4');
  };

  return (
    <div>
      <h2 className="font-bold mb-2">Sessions</h2>
      <div className="flex gap-2 mb-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" className="border p-1 rounded" />
        <select value={model} onChange={e => setModel(e.target.value)} className="border p-1 rounded">
          <option value="gpt-4">gpt-4</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        </select>
        <button onClick={createSession} className="bg-blue-500 text-white px-2 rounded">New</button>
      </div>
      <ul>
        {sessions.map(s => (
          <li key={s.id}>
            <button
              onClick={() => setCurrentSession(s)}
              className={`block w-full text-left px-2 py-1 rounded ${currentSession?.id === s.id ? 'bg-blue-100' : ''}`}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
