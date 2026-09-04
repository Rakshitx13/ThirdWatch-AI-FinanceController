# ThirdWatch — AI Finance Controller

Run the books and the cash position.

A deterministic + AI-assisted reconciliation agent for merchant ledger vs payment settlement data.

![Image1](https://github.com/Rakshitx13/ThirdWatch-AI-FinanceController/blob/6de34da0d195ff3db95afed3583df86a5f2aa67f/Image1.jpeg)
*Figure 1: ThirdWatch dashboard and overall finance-controller interface.*

## Latest measured run

This is the actual output of `SEED=42`, `BATCH_SIZE=100`, and `pnpm run demo` on 31 August 2026. The values come from [`data/summary.json`](data/summary.json); they are not presentation fixtures.

```text
Records processed:              100
Exact matches:                   70
Fee-adjusted matches:            12
Delayed settlements:              4
Possible refunds:                 6
Missing settlements:              4
Duplicate references:             4
Reconciled:                       86
Unresolved exceptions:            14
Match rate:                       86%
Classification accuracy:        100%
False matches:                     0
False exceptions:                  0
Deterministic processing:      15.17 ms
Throughput:                  6,591.96 records/sec
```

The 100% figure is classification accuracy against synthetic hidden labels—not a forced 100% match rate. The system reconciled 86% and honestly left 14% unresolved.

## 1. Problem

Finance teams must explain what happened to every order’s money. Internal ledgers and gateway settlement reports rarely align perfectly: fees drift, references repeat, settlements arrive late, refunds look like unexplained shortfalls, and some rows are absent.

The hackathon requirement is to close this loop across a 50+ record batch while reporting throughput, measured accuracy, and every unresolved exception.

## 2. Why reconciliation matters

A false match can conceal missing cash or attach one settlement to the wrong order. ThirdWatch therefore optimizes for defensible decisions rather than maximum match rate: confident cases are automated; uncertain cases remain visible, measured, and auditable.

## 3. Solution

The application processes every merchant order through candidate discovery and deterministic rules. It produces exactly one status per order, prevents settlement reuse, optionally asks Claude for a short explanation of ambiguous exceptions, validates results against hidden synthetic ground truth, and exposes the batch through an Express API and React operations console.

Run the complete demonstration with:

```bash
pnpm run demo
```

The command builds the application, regenerates 100 seed-42 records, prints source and ground-truth samples, reconciles the complete batch, reports exception/accuracy/performance metrics, and serves the dashboard at `http://127.0.0.1:3001`.

## 4. Architecture

```text
Seeded generator
      ↓
Merchant ledger CSV + settlement report CSV
      ↓
Candidate discovery and scoring
      ↓
Deterministic classifier
      ├── Exact / fee-adjusted / delayed → reconciled
      └── Refund / missing / duplicate  → unresolved
                         ↓ ambiguous evidence only
                    Claude explanation
                         ↓
Audit trail + accuracy + performance reports
                         ↓
Express API → React finance-operations dashboard
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for scoring, precedence, trust boundaries, and component details.

## 5. Data sources

Source A, [`data/merchant_ledger.csv`](data/merchant_ledger.csv), contains:

```text
order_id, amount, order_date, customer_name, payment_mode
```

Source B, [`data/settlement_report.csv`](data/settlement_report.csv), contains:

```text
payment_id, utr, settled_amount, settlement_date,
fee_deducted, gst_on_fee, linked_order_id
```

[`data/ground_truth.json`](data/ground_truth.json) stores hidden labels for post-classification validation only. The matching engine never imports or reads it.

## 6. Business rules

- UPI fee: 0.25%–1%.
- Card fee: 1%–2%.
- Netbanking fee: 0.5%–1.5%.
- GST is 18% of the rounded gateway fee.
- Card payments of ₹2,000 or less have zero GST on the fee under the demo rule.
- Expected settlement is `order amount - fee - GST`, rounded to two decimals.
- Normal settlement is one or two working days after the order.
- Saturdays and Sundays are skipped.
- Three through five working days is delayed but still reconcilable.
- Exact amount tolerance is ₹1; wider fee-adjusted tolerance is ₹5.

All thresholds are named and documented in [`data-generator/businessRules.ts`](data-generator/businessRules.ts).

## 7. Matching algorithm

Candidate scoring combines independent evidence rather than trusting `linked_order_id` alone:

| Evidence | Score |
|---|---:|
| Exact linked order ID | +50 |
| Link to another order | −30 |
| Exact settlement amount | +25 |
| Amount within ₹1 | +20 |
| Amount within ₹5 | +10 |
| Normal settlement date | +15 |
| Extended settlement date | +5 |
| Valid fee and GST profile | +10 |

Candidates below 20 points are excluded. Duplicate UTR detection runs first. Remaining edges are evaluated as exact, fee-adjusted, delayed, and possible refund. Direct links, higher scores, and smaller numerical differences determine assignment order. Each order and settlement can be assigned at most once.

## 8. AI / Claude role

Claude is an optional explanation layer—not a matcher. It may explain possible refunds, duplicate references, or missing settlements with multiple candidates. It cannot change status, confidence, financial values, or reconciliation state.

The prompt treats evidence as untrusted data and prohibits invented causes. Missing configuration, timeout, rate limit, API error, or empty output produces:

```json
{
  "llm_explanation": null,
  "llm_status": "UNAVAILABLE"
}
```

Deterministic reconciliation continues unchanged.

## 9. Exception handling

Every order receives one of:

- `EXACT_MATCH` — reconciled, high confidence.
- `FEE_ADJUSTED_MATCH` — reconciled within ₹5, medium confidence.
- `DELAYED_SETTLEMENT` — financially reconciled but operationally late.
- `POSSIBLE_REFUND` — unresolved shortfall larger than tolerance.
- `NO_SETTLEMENT_FOUND` — no unused candidate satisfies a rule.
- `DUPLICATE_REFERENCE` — repeated UTR; no settlement is silently selected.

Malformed CSV, missing columns, duplicate order/payment IDs, invalid dates, negative values, incomplete configuration, missing reports, malformed JSON, and invalid API filters return explicit errors.

## 10. Auditability

[`data/audit_trail.json`](data/audit_trail.json) contains exactly one entry per merchant order. Each entry records candidates, selected evidence, expected/actual amounts, difference, working-day lag, rules evaluated, rule fired, classification, confidence, reason, and LLM status/timing.

Writes are atomic so consumers never observe partially written financial artifacts.

## 11. Accuracy methodology

Ground truth is loaded only after deterministic classification. [`data/accuracy_report.json`](data/accuracy_report.json) reports:

- Overall classification accuracy.
- Reconciled-match precision and recall.
- False-positive matches (“false matches”).
- False-negative matches (“false exceptions”).
- Per-category support, precision, recall, false positives, and false negatives.

A false match means the system reconciled an order that hidden truth marks unresolved. This metric is displayed prominently because it is the most financially dangerous failure.

## 12. Performance

High-resolution timers isolate the deterministic engine from optional Claude latency:

```text
deterministic_processing_time_ms
llm_time_ms
total_processing_time_ms
records_per_second
```

Frontend rendering, human interaction, file generation, and arbitrary waits are excluded. Throughput uses deterministic processing time only.

## 13. Installation

Requirements: Node.js 24.19.0 and pnpm 11.19.0. The exact versions are pinned in `.nvmrc`, `.node-version`, and `package.json`.

```bash
git clone <repository-url>
cd ai-finance-controller
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

No database is required. Runtime artifacts remain under `data/`.

## 14. Environment variables

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
SEED=42
BATCH_SIZE=100
```

`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are optional. `.env` is ignored by Git. `HOST` defaults to `127.0.0.1`; use `0.0.0.0` or `::` only inside an appropriately protected deployment boundary.

## 15. Running the generator

```bash
pnpm run generate
SEED=42 BATCH_SIZE=100 pnpm run generate
```

Batch size must be an integer of at least 50. The same seed and batch size reproduce the same source files and hidden labels.

## 16. Running reconciliation

```bash
pnpm run reconcile
```

This reads the source CSVs and writes:

```text
data/reconciliation_result.json
data/audit_trail.json
data/summary.json
data/accuracy_report.json
data/exception_report.json
```

## 17. Running the frontend

Development mode uses two terminals:

```bash
pnpm run server
pnpm run client:dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the localhost Express service. For a single production-style process, run `pnpm run build` followed by `pnpm run server`, then open `http://127.0.0.1:3001`.

## 18. Running tests

```bash
pnpm test
pnpm run client:test
pnpm run test:all
pnpm run typecheck
pnpm run build
pnpm run validate:release
```

The suite covers generator determinism, working days, fee/GST boundaries, exact and wider amount boundaries, refunds, missing settlements, duplicate UTRs, delayed dates, settlement non-reuse, Claude failures, audit completeness, accuracy math, CSV validation, API behavior, dashboard interactions, the demo workflow, and production static serving. Anthropic is always mocked in tests.

## 19. Example output

```text
Reconciliation
----------------------------------------
Exact matches:          70
Fee-adjusted:           12
Delayed settlements:     4
Possible refunds:        6
Missing settlements:     4
Duplicate references:    4
Reconciled:             86 (86%)
Unresolved exceptions:  14 (14%)

Accuracy
----------------------------------------
Classification accuracy: 100%
False matches:              0
False exceptions:           0
```

## 20. Limitations

- Synthetic data does not represent every gateway, bank, tax, holiday, partial-capture, chargeback, or multi-currency rule.
- Working days exclude weekends but not Indian public holidays.
- Ground-truth accuracy measures this seeded synthetic distribution, not production generalization.
- Storage is file-based and intended for a single-process MVP.
- Claude explanations are advisory and require operator verification.
- Authentication, role-based access, TLS termination, and encryption-at-rest are not included.
- Operational metrics are process-local and reset when the server restarts.

## 21. Future improvements

- Gateway-specific fee/tax rule packs and public-holiday calendars.
- Multi-currency and partial-payment allocation.
- Human investigation outcomes feeding evaluation—not automatic classification overrides.
- Authenticated multi-merchant workspaces and durable database storage.
- Exportable audit packages and signed run manifests.
- Historical trend monitoring, anomaly thresholds, and reconciliation SLAs.

## 22. Health checks and observability

`GET /health` and the compatibility endpoint `GET /api/health` return only service status and a timestamp. `GET /api/metrics` returns process-local aggregate counters:

```text
records_processed_total
records_matched_total
records_exception_total
jobs_completed_total
jobs_failed_total
job_duration_seconds
```

Startup, shutdown, generation, reconciliation, health, and error events are emitted as structured JSON without credentials or transaction-level financial data. Container health checks call `/health`.

## 23. Docker

Build and run locally:

```bash
docker build -t thirdwatch:local .
docker run --rm --name thirdwatch -p 127.0.0.1:3001:3001 thirdwatch:local
curl --fail http://127.0.0.1:3001/health
```

The multi-stage image pins Node 24.19.0 and pnpm 11.19.0, installs from the authoritative lockfile, runs as the unprivileged `node` user, contains no `.env` file, and starts with an empty `/app/data` directory. Mount `/app/data` on protected persistent storage if reports must survive container replacement.

## 24. Deployment and network security

Native execution is loopback-only by default. The container listens on all container interfaces so an orchestrator or reverse proxy can reach it. Do not publish it directly to an untrusted network: ThirdWatch has no built-in authentication, authorization, or TLS termination. External deployment requires an authenticated HTTPS reverse proxy, restricted ingress, least-privilege runtime identity, platform-managed secrets, and environment-specific review. See [`deploy/README.md`](deploy/README.md).

## 25. Financial data, retention, deletion, and backups

Runtime artifacts are stored in `data/`. The repository samples are deterministic synthetic fixtures; do not commit real merchant or settlement data. Release archives and Docker contexts exclude these artifacts. Protect production storage with access controls and encryption appropriate to the deployment environment.

No retention period is asserted as a legal requirement. The operator must select a period with legal, contractual, tax, privacy, and audit stakeholders. Preview cleanup of approved artifacts older than 90 days:

```bash
node scripts/cleanup-data.js --days 90 --dry-run
```

After reviewing the exact list, delete only those approved artifacts with:

```bash
node scripts/cleanup-data.js --days 90 --execute
```

The script is non-recursive, rejects unknown arguments, ignores symlinks and unknown files, and is restricted to the project `data/` directory. Backups are not automated. If backups are required, encrypt them, restrict access, test restoration, record retention, and ensure expired copies are deleted from both primary and backup storage.

## 26. CI and dependency security

`.github/workflows/ci.yml` installs the pinned Node and pnpm versions, uses `pnpm install --frozen-lockfile`, validates release prerequisites, type-checks, runs all tests, builds the application, audits high-severity production dependencies, and builds the container. It uses read-only repository permissions and contains no secrets.

For local review:

```bash
pnpm audit --prod --audit-level=high
pnpm outdated
```

Treat audit results as inputs to risk assessment. Test dependency updates before changing the lockfile.

## 27. Release process and checksum verification

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm run typecheck`, `pnpm run test:all`, `pnpm run build`, and `pnpm run validate:release`.
3. Run `node scripts/create-release.js`.
4. Run `node scripts/validate-release.js --require-artifacts`.
5. Review the generated archive contents under `release/` before publishing.

Verify the SHA-256 file on Linux:

```bash
cd release
sha256sum -c ThirdWatch-0.1.0.zip.sha256
```

On macOS:

```bash
cd release
shasum -a 256 -c ThirdWatch-0.1.0.zip.sha256
```

On Windows PowerShell, compare the output manually with the first field in the `.sha256` file:

```powershell
Get-FileHash .\release\ThirdWatch-0.1.0.zip -Algorithm SHA256
Get-Content .\release\ThirdWatch-0.1.0.zip.sha256
```

## 28. GPG verification

Release signing is not configured and this repository contains no signing key or public-key fingerprint. If the owner requires signed releases, sign outside the repository with a protected private key:

```bash
gpg --armor --detach-sign ThirdWatch-0.1.0.zip
gpg --verify ThirdWatch-0.1.0.zip.asc ThirdWatch-0.1.0.zip
```

Distribute the public key through a separate trusted channel and verify its full fingerprint. A `.asc` file alone does not establish authenticity. Never commit a private signing key.

## 29. License status

No software license has been selected. [`LICENSE_STATUS.md`](LICENSE_STATUS.md) records the unresolved status without inferring rights or ownership. The owner must select and add an appropriate `LICENSE` before public distribution.

## 30. Contributing and security reports

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for required checks and [`SECURITY.md`](SECURITY.md) for the current private-reporting limitation. Do not submit credentials, personal data, financial records, or exploit details in a public issue.

## 31. Financial-software disclaimer

ThirdWatch is demonstration software, not accounting, tax, legal, investment, banking, or regulatory advice. Synthetic-data accuracy does not establish suitability for production data. Operators remain responsible for validating matching rules, investigating exceptions, protecting records, obtaining approvals, and independently verifying financial outcomes before posting entries or moving funds.

## 32. Dependencies

### Tooling Requirements

- **Node.js** (`>=24.19.0 <25`) — JavaScript runtime required to build and run ThirdWatch.
- **pnpm** (`11.19.0`) — Package manager used for reproducible dependency installation and project scripts.
- **TypeScript** (`^5.9.0`) — Typed language and compiler used across the backend and frontend.
- **Vite** (`^8.2.2`) — Frontend development server and production build tool.

### Runtime Dependencies

- **`@anthropic-ai/sdk`** (`^0.122.0`) — Anthropic API and AI model integration for AI-assisted finance operations.
- **`dotenv`** (`^17.4.2`) — Loads environment variables and configuration from `.env`.
- **`express`** (`^5.2.1`) — Backend HTTP server and API framework.
- **`lucide-react`** (`^1.37.0`) — Icon library used by the React interface.
- **`react`** (`^19.2.8`) — Frontend UI framework.
- **`react-dom`** (`^19.2.8`) — React rendering for the web application.
- **`recharts`** (`^3.10.1`) — Charts and financial data visualizations.
- **`zod`** (`^4.5.4`) — Runtime schema validation for structured inputs and data.

### Development Dependencies

- **`@tailwindcss/vite`** (`^4.3.3`) — Integrates Tailwind CSS with the Vite build pipeline.
- **`@testing-library/jest-dom`** (`^7.0.1`) — Adds DOM-specific assertions for frontend tests.
- **`@testing-library/react`** (`^16.3.3`) — Provides utilities for testing React components through user-visible behavior.
- **`@testing-library/user-event`** (`^14.6.6`) — Simulates realistic user interactions in frontend tests.
- **`@types/express`** (`^5.0.6`) — TypeScript declarations for Express.
- **`@types/jest`** (`^29.5.14`) — TypeScript declarations for Jest.
- **`@types/node`** (`^24.0.0`) — TypeScript declarations for Node.js APIs.
- **`@types/react`** (`^19.2.18`) — TypeScript declarations for React.
- **`@types/react-dom`** (`^19.2.5`) — TypeScript declarations for React DOM.
- **`@types/supertest`** (`^7.2.1`) — TypeScript declarations for Supertest.
- **`@vitejs/plugin-react`** (`^6.1.1`) — Adds React and Fast Refresh support to Vite.
- **`jest`** (`^29.7.0`) — Test runner for backend and unit tests.
- **`jsdom`** (`^30.0.1`) — Browser-like DOM environment for JavaScript tests.
- **`supertest`** (`^7.2.2`) — Tests Express HTTP endpoints without a live external server.
- **`tailwindcss`** (`^4.3.3`) — Utility-first CSS framework used by the frontend.
- **`ts-jest`** (`^29.4.0`) — Compiles TypeScript test files for Jest.
- **`typescript`** (`^5.9.0`) — Provides static typing and TypeScript compilation.
- **`vite`** (`^8.2.2`) — Builds and serves the frontend application.
- **`vitest`** (`^4.1.11`) — Vite-native test runner for frontend tests.
  
**AUTOMATE THE OBVIOUS. MEASURE THE UNCERTAIN. ESCALATE THE EXCEPTIONS. AUDIT EVERYTHING.**
