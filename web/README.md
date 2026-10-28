# web/ — the multi-branch web version

Server (`server/`), browser entry points (`client/`), tests (`test/`) and deployment files
(`Dockerfile`, `docker-compose.yml`, `.env.example`) of the web version. The screens and the
business logic are the desktop's own, in `../src`.

Setup, operation and architecture: [docs/web/README.md](../docs/web/README.md).

```bash
npm ci && npm run build:client && npm start      # after `npm ci --ignore-scripts` at the root
```
