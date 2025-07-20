import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function FileTreeExplorer({ selectedRepo, selectedFiles, setSelectedFiles }) {
  const [tree, setTree] = useState([]);

  const fetchTree = async (path = '') => {
    const [owner, repo] = selectedRepo.split('/');
    const res = await axios.get('/github/repo/tree', {
      params: { owner, repo, path },
    });
    return res.data.files;
  };

  const loadRoot = async () => {
    const root = await fetchTree();
    setTree(root);
  };

  const toggleSelect = (path) => {
    setSelectedFiles(prev => (
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    ));
  };

  useEffect(() => {
    if (selectedRepo) loadRoot();
  }, [selectedRepo]);

  return (
    <div>
      <h3 className="font-bold mb-2">Repo: {selectedRepo}</h3>
      <ul className="border p-2 rounded max-h-64 overflow-auto">
        {tree.map(entry => (
          <li key={entry.path}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedFiles.includes(entry.path)}
                onChange={() => toggleSelect(entry.path)}
              />
              {entry.type === 'dir' ? `📁 ${entry.name}` : `📄 ${entry.name}`}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
