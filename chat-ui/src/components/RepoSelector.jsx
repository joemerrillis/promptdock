import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function RepoSelector({ currentRepo, setCurrentRepo }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await axios.get('/github/repos');
        setRepos(res.data.repos);
      } catch (err) {
        console.error('Failed to fetch repos:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRepos();
  }, []);

  return (
    <div className="mb-4">
      <h2 className="font-bold mb-2">GitHub Repos</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <select
          className="border p-1 rounded w-full"
          value={currentRepo || ''}
          onChange={e => setCurrentRepo(e.target.value)}
        >
          <option value="">Select a repo...</option>
          {repos.map(repo => (
            <option key={repo.full_name} value={repo.full_name}>
              {repo.full_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
