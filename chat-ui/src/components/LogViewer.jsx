import React, { useState } from 'react';
import axios from 'axios';

export default function LogViewer() {
  const [logs, setLogs] = useState('');
  const [response, setResponse] = useState('');

  const sendLogs = async () => {
    const res = await axios.post('/debug', { logs });
    setResponse(res.data.reply);
  };

  return (
    <div>
      <h2 className="font-bold mb-2">🪵 Render Logs</h2>
      <textarea
        rows={10}
        className="w-full text-xs border p-1 mb-2"
        placeholder="Paste logs here..."
        value={logs}
        onChange={(e) => setLogs(e.target.value)}
      />
      <button className="bg-blue-500 text-white px-2 py-1 rounded" onClick={sendLogs}>
        Analyze Logs
      </button>
      {response && (
        <div className="mt-2 p-2 text-xs bg-gray-50 border rounded">
          <pre>{response}</pre>
          <button
            className="text-blue-600 underline text-xs mt-1"
            onClick={() => navigator.clipboard.writeText(response)}
          >Copy</button>
        </div>
      )}
    </div>
  );
}
