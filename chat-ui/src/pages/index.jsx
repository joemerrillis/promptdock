import React, { useState } from 'react';
import FileTreeSelector from '../components/FileTreeSelector';
import ChatWindow from '../components/ChatWindow';
import LogViewer from '../components/LogViewer';
import SessionSelector from '../components/SessionSelector';

export default function MainLayout() {
  const [primedFiles, setPrimedFiles] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);

  return (
    <div className="grid grid-cols-12 h-screen bg-white text-gray-900">
      
      {/* Sidebar - Left */}
      <div className="col-span-3 p-4 border-r overflow-y-auto">
        <SessionSelector
          currentSession={currentSession}
          setCurrentSession={setCurrentSession}
        />
        <FileTreeSelector onPrime={setPrimedFiles} />
      </div>

      {/* Main Chat - Center */}
      <div className="col-span-6 p-4 flex flex-col">
        <h2 className="text-xl font-semibold mb-2">🧠 AI Chat</h2>
        <ChatWindow
          contextFiles={primedFiles}
          currentSession={currentSession}
        />
      </div>

      {/* Logs - Right */}
      <div className="col-span-3 p-4 border-l overflow-y-auto">
        <LogViewer />
      </div>
    </div>
  );
}
