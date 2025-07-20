import React, { useState } from 'react';
import axios from 'axios';

export default function ChatWindow({ contextFiles }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    const res = await axios.post('/chat', {
      message: input,
      context_files: contextFiles,
    });
    setMessages([...messages, { role: 'user', text: input }, { role: 'assistant', text: res.data.reply }]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className="bg-gray-100 rounded p-2 inline-block max-w-full">
              <pre className="whitespace-pre-wrap text-xs">{msg.text}</pre>
              <button
                className="text-xs text-blue-600 underline mt-1 block"
                onClick={() => navigator.clipboard.writeText(msg.text)}
              >Copy</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex">
        <textarea
          className="flex-1 border rounded p-2 text-sm"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="ml-2 px-4 py-2 bg-green-600 text-white rounded"
          onClick={sendMessage}
        >Send</button>
      </div>
    </div>
  );
}
