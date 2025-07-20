import React, { useState } from 'react';
import FileTreeSelector from '../components/FileTreeSelector';
import ChatWindow from '../components/ChatWindow';
import LogViewer from '../components/LogViewer';

export default function MainLayout() {
  const [primedFiles, setPrimedFiles] = useState([]);

  return (
    <div className="grid grid-cols-3 h-screen">
      <div className="border-r p-2 overflow-auto">
        <FileTreeSelector onPrime={setPrimedFiles} />
      </div>
      <div className="col-span-1.5 p-4">
        <ChatWindow contextFiles={primedFiles} />
      </div>
      <div className="border-l p-2 overflow-auto">
        <LogViewer />
      </div>
    </div>
  );
}
