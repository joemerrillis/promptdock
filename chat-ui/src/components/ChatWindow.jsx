import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function ChatWindow({ contextFiles, currentSession }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!currentSession?.id) return;
    axios.get(`/messages/${currentSession.id}`).then((res) => setMessages(res.data));
  }, [currentSession]);

  const sendMessage = async () => {
    if (!input || !currentSession?.id) return;

    const chatRes = await axios.post('/chat', {
      message: input,
      context_files: contextFiles,
    });

    const aiReply = chatRes.data.reply;
    setMessages(prev => [
      ...prev,
      { role: 'user', text: input },
      { role: 'assistant', text: aiReply },
    ]);

    await axios.post('/chat-message', {
      session_id: currentSession.id,
      role: 'user',
      message: input,
      response: null,
      context: { context_files: contextFiles }
    });
    await axios.post('/chat-message', {
      session_id: currentSession.id,
      role: 'assistant',
      message: input,
      response: aiReply,
      context: { context_files: contextFiles }
    });

    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className="bg-gray-100 rounded p-2 inline-block max-w-full">
              <pre className="whitespace-pre-wrap text-xs">{msg.text || msg.message || msg.response}</pre>
              <button
                className="text-xs text-blue-600 underline mt-1 block"
                onClick={() => navigator.clipboard.writeText(msg.text || msg.message || msg.response)}
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
