import axios from 'axios';

export default async function githubRoutes(fastify) {
  fastify.get('/github/repos', async (req, reply) => {
    const username = 'YOUR_GITHUB_USERNAME'; // 🔁 optionally dynamic
    const token = process.env.GITHUB_TOKEN;

    try {
      const res = await axios.get(`https://api.github.com/users/${username}/repos`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });

      const repos = res.data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
      }));

      return reply.send({ repos });
    } catch (error) {
      req.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch GitHub repos' });
    }
  });
}
