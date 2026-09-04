# ThirdWatch deployment boundary

The supported deployment artifact is the repository `Dockerfile`. It runs as the unprivileged `node` user and exposes an internal health check at `/health`.

The container listens on `0.0.0.0:3001` so an orchestrator or reverse proxy can reach it. Do not publish that port directly to an untrusted network. Put ThirdWatch behind an authenticated HTTPS reverse proxy, restrict ingress to that proxy, inject secrets through the platform secret store, and mount `/app/data` on access-controlled persistent storage when reports must survive replacement.

Example local-only validation:

```bash
docker build -t thirdwatch:local .
docker run --rm --name thirdwatch -p 127.0.0.1:3001:3001 thirdwatch:local
curl --fail http://127.0.0.1:3001/health
```

No Kubernetes, systemd, launchd, Windows service, cloud, or reverse-proxy configuration is included because no target platform was specified. Add only the deployment definition required by the selected production environment and subject it to environment-specific review.
