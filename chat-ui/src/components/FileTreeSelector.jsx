import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function FileTreeSelector({ onPrime }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    fetch('/filelist.json') // this can be a static mock or GitHub API later
      .then((res) => res.json())
      .then(setFiles);
  }, []);

  const toggleFile = (filePath) => {
    setSelected((prev) =>
      prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath]
    );
  };

  const handlePrime = async () => {
    const response = await axios.post('/prime', { files: selected });
    onPrime(selected);
  };

  return (
    <div>
      <h2 className="font-bold mb-2">📁 Plugin Files</h2>
      <ul className="text-sm">
        {files.map(file => (
          <li key={file}>
            <label>
              <input type="checkbox" checked={selected.includes(file)} onChange={() => toggleFile(file)} />
              <span className="ml-1">{file}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        onClick={handlePrime}
        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded"
      >Prime Context</button>
    </div>
  );
}
