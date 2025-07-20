import axios from 'axios';

export default async function githubRoutes(fastify) {
  fastify.get('/repo/tree', async (req, reply) => {
    const { owner, repo, path = '' } = req.query;

    const token = process.env.GITHUB_TOKEN;
    if (!token) return reply.status(500).send({ error: 'Missing GitHub token' });

    try {
      const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const files = res.data.map(entry => ({
        name: entry.name,
        path: entry.path,
        type: entry.type, // 'file' or 'dir'
      }));

      reply.send({ files });
    } catch (err) {
      reply.status(500).send({ error: 'GitHub API error', details: err.message });
    }
  });
}
