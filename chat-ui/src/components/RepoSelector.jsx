// chat-ui/src/components/RepoSelector.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function RepoSelector({ selectedRepo, setSelectedRepo }) {
  const [repos, setRepos] = useState([]);

  useEffect(() => {
    axios.get('/github/repos').then((res) => setRepos(res.data.repos));
  }, []);

  return (
    <div className="mt-4">
      <h2 className="font-bold mb-1">Repository</h2>
      <select
        value={selectedRepo || ''}
        onChange={(e) => setSelectedRepo(e.target.value)}
        className="w-full border rounded p-1"
      >
        <option value="">Select a repository...</option>
        {repos.map((repo) => (
          <option key={repo.nameWithOwner} value={repo.nameWithOwner}>
            {repo.nameWithOwner} {repo.isPrivate ? '(Private)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
