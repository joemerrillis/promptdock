// chat-api/src/routes/githubRoutes.js
import axios from 'axios';

export default async function githubRoutes(fastify) {
  fastify.get('/repos', async (req, reply) => {
    try {
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      const graphqlQuery = {
        query: `
          {
            viewer {
              repositories(first: 100, isFork: false, orderBy: {field: UPDATED_AT, direction: DESC}) {
                nodes {
                  name
                  nameWithOwner
                  isPrivate
                  isFork
                  isArchived
                }
              }
            }
          }
        `,
      };

      const res = await axios.post(
        'https://api.github.com/graphql',
        graphqlQuery,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const repos = res.data?.data?.viewer?.repositories?.nodes || [];
      reply.send({ repos });
    } catch (err) {
      req.log.error(err);
      reply.status(500).send({ error: 'Failed to fetch GitHub repos' });
    }
  });
}
