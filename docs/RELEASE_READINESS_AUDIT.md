# ThirdWatch release-readiness audit

Audit date: 2 September 2026  
Scope: repository contents supplied in the workspace before remediation  
Method: filesystem inventory, configuration and source review, branding and secret-pattern searches, runtime/version inspection, and existing test/build review

The Git working tree contained only untracked files at audit time, so no committed baseline or repository history was available. Existing workspace files were treated as the implementation baseline. External repository settings, branch protection, GitHub secret configuration, cloud controls, legal ownership, and production infrastructure are **UNVERIFIED**.

## Phase 1 classification

| Element | Initial status | Evidence before remediation | Post-remediation disposition |
|---|---|---|---|
| Repository structure | COMPLETE | Clear generator, matching, AI, audit, reporting, server, client, and test boundaries | Preserved |
| Application configuration | INCOMPLETE | `.env.example` existed but omitted `NODE_ENV` and `HOST` | Completed |
| README/documentation | INCOMPLETE | Strong product/algorithm docs; deployment, release, security, retention, backup, license, and contribution sections absent | Completed, subject to unresolved license |
| `package.json` | INCOMPLETE | Working scripts/dependencies; no exact package manager, engine, typecheck, cleanup, or release validation metadata | Completed |
| Package manager | INCOMPLETE | `pnpm-lock.yaml` authoritative but scripts and README invoked npm | Standardized on pnpm 11.19.0 |
| Node.js version | MISSING | No `.nvmrc` or `.node-version` | Pinned to tested 24.19.0 |
| Lockfiles | COMPLETE | One authoritative `pnpm-lock.yaml`; no competing npm lockfile | Preserved |
| `.gitignore` | INCOMPLETE | Ignored `.env`, dependencies, build, coverage; omitted client build, release, logs, and temporary data files | Completed |
| `.env`/secret handling | COMPLETE | `.env` ignored; example key empty; Anthropic key server-side only; no real credential found | Preserved and documented |
| Docker/containerization | MISSING | No `Dockerfile` or `.dockerignore` | Added; local Docker execution remains UNVERIFIED because Docker is unavailable on the audit host |
| Health checks | INCOMPLETE | `GET /api/health` existed; no root health endpoint or container check | Added `/health`; compatibility endpoint preserved |
| Service/process management | MISSING | No service definition or target platform | Container is the selected deployment method; OS-specific duplicate definitions intentionally not added |
| GitHub Actions | MISSING | No `.github/workflows` | CI added; remote execution UNVERIFIED |
| Authentication/access control | INCOMPLETE | No authentication or authorization; mitigated only by loopback binding | Explicitly documented as a blocker for untrusted-network exposure |
| Secrets | COMPLETE | No committed production secret detected; test keys were obvious fixtures | Preserved |
| TLS/HTTPS | INCOMPLETE | No TLS termination; localhost-only native service | Reverse-proxy requirement documented; external TLS implementation remains environment-specific |
| Data handling | INCOMPLETE | Atomic fixed-name file writes and synthetic fixtures were safe; no retention/deletion control | Bounded dry-run cleanup and handling policy added |
| Backups/retention | MISSING | No schedule, restore process, or policy | Operator responsibilities and non-legal example documented; automation remains environment-specific |
| Logging | MISSING | Only startup/demo console output | Aggregate structured operational events added |
| Metrics/observability | MISSING | Reconciliation summaries existed, but no operational counter endpoint | Process-local aggregate metrics added |
| Tests | COMPLETE | Broad Jest/Vitest/integration coverage existed | Preserved and extended for health/metrics |
| Dependency security | INCOMPLETE | Lockfile existed; no automated audit or update guidance | CI production audit and documentation added; live registry result may require network access |
| `LICENSE` | MISSING | No license file | Still unresolved; `LICENSE_STATUS.md` added without inventing rights |
| Release artifacts | MISSING | No release packaging or validator | Cross-platform release creator and validator added |
| SHA-256 checksum | MISSING | No archive/checksum | Release creator generates and validator verifies SHA-256 |
| GPG signatures | MISSING | No GPG configuration, signature, public key, or fingerprint | Still unsigned; secure signing procedure documented |
| Cross-platform instructions | INCOMPLETE | README focused on Unix-style local commands | Windows/macOS/Linux verification and release guidance added where behavior differs |

## Initial gap records

### Runtime and package reproducibility

Element: Node.js and package-manager pinning  
Status: INCOMPLETE / MISSING  
Evidence: lockfile format 9 existed; no `packageManager`, `engines`, `.nvmrc`, or `.node-version`; local verified runtime was Node 24.19.0 with pnpm 11.19.0.  
Risk: developer and CI dependency resolution may diverge.  
Required Remedy: pin exact verified versions and use pnpm consistently.  
Files to Create: `.nvmrc`, `.node-version`.  
Files to Modify: `package.json`, `README.md`.  
Validation: version comparison, frozen install, tests, build, release validator.

### Container and deployment boundary

Element: reproducible non-root deployment  
Status: MISSING  
Evidence: no `Dockerfile`, `.dockerignore`, service definition, or deployment guide.  
Risk: ad hoc privileged deployments could leak secrets or expose an unauthenticated finance service.  
Required Remedy: add one applicable deployment path using a multi-stage non-root image, health check, empty runtime data directory, and explicit reverse-proxy boundary.  
Files to Create: `Dockerfile`, `.dockerignore`, `deploy/README.md`.  
Files to Modify: `README.md`, `server/app.ts`.  
Validation: Docker build and `/health`; Docker execution is UNVERIFIED on this host because the executable is absent.

### Authentication and TLS

Element: access control and encrypted external transport  
Status: INCOMPLETE  
Evidence: no authentication, authorization, or TLS; native listener was loopback-only.  
Risk: direct external exposure would allow unauthorized access to finance operations and reports.  
Required Remedy: retain safe loopback default and require an authenticated hardened HTTPS reverse proxy for any external deployment. Environment-specific identity/TLS implementation cannot be selected without a target platform.  
Files to Create: `SECURITY.md`, `deploy/README.md`.  
Files to Modify: `.env.example`, `README.md`, `server/app.ts`.  
Validation: default host test/source review; external controls remain UNVERIFIED until a production platform is selected.

### Operational telemetry

Element: logging and metrics  
Status: MISSING  
Evidence: reconciliation report metrics existed, but no operational event schema or metrics endpoint.  
Risk: operators cannot distinguish healthy, failed, or completed jobs without inspecting files.  
Required Remedy: log aggregate lifecycle events and expose non-sensitive process-local counters.  
Files to Create: `server/observability.ts`.  
Files to Modify: `server/app.ts`, `server/routes.ts`, `server/reconciliationService.ts`, tests and architecture documentation.  
Validation: API tests and secret/financial-field review.

### Data retention and backups

Element: retention, bounded deletion, and backup expectations  
Status: INCOMPLETE / MISSING  
Evidence: runtime artifacts were fixed-name files in `data/`; no cleanup, retention, or backup process existed.  
Risk: financial artifacts may be retained indefinitely or deleted unsafely.  
Required Remedy: add dry-run-first cleanup restricted to an allowlist in the intended directory; document that retention is operator/legal policy and backups require protected storage and restore tests.  
Files to Create: `scripts/cleanup-data.js`.  
Files to Modify: `README.md`, `.gitignore`.  
Validation: dry-run, argument rejection, source review, and release validator.

### CI and dependency security

Element: GitHub validation pipeline  
Status: MISSING  
Evidence: no workflow existed.  
Risk: changes could bypass lockfile, tests, build, security audit, and container validation.  
Required Remedy: add least-privilege CI using exact Node/pnpm versions and existing test/build systems.  
Files to Create: `.github/workflows/ci.yml`.  
Files to Modify: `package.json`, `README.md`.  
Validation: YAML/source review and local CI-equivalent commands; GitHub execution remains UNVERIFIED.

### Release integrity and licensing

Element: archive, checksum, signature, and license  
Status: MISSING  
Evidence: no release archive, checksum, signature, license, or validation script.  
Risk: recipients cannot detect archive corruption; distribution rights and signer authenticity are unknown.  
Required Remedy: add deterministic release procedure, generate SHA-256, document GPG fingerprint verification, and explicitly preserve unresolved license status. Do not fabricate ownership, a license, or a signature.  
Files to Create: `scripts/create-release.js`, `scripts/validate-release.js`, `LICENSE_STATUS.md`.  
Files to Modify: `README.md`, `package.json`, `.gitignore`.  
Validation: create archive, compare checksum, run validator with `--require-artifacts`; GPG remains UNVERIFIED/unsigned.

### Branding and repository policy

Element: ThirdWatch user-facing identity and contributor/security guidance  
Status: INCOMPLETE  
Evidence: README, UI, HTML title, demo, server text, and health response used the former identity; no contribution/security policy existed.  
Risk: inconsistent product identity and unsafe disclosure/contribution practices.  
Required Remedy: use “ThirdWatch — AI Finance Controller” for user-facing branding while preserving package/import identifiers, and add accurate policy documents.  
Files to Create: `CONTRIBUTING.md`, `SECURITY.md`.  
Files to Modify: README, architecture, UI, demo, server, tests.  
Validation: repository branding search, tests, production build.

## Intentionally unresolved or environment-specific

- A software license must be selected by the repository owner; readiness for public distribution is blocked until then.
- GPG signing requires an owner-controlled protected key and separately distributed verified fingerprint; no signature is claimed.
- Authentication, authorization, TLS, encryption at rest, backups, and durable storage depend on the chosen production platform. Direct public exposure is prohibited by documentation.
- GitHub repository settings, protected branches, code owners, secret configuration, and workflow execution are UNVERIFIED because no remote-repository administration context was supplied.
- Docker execution is UNVERIFIED on the audit host because Docker is not installed.
