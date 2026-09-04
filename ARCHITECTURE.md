# ThirdWatch — AI Finance Controller Architecture

## System overview

```text
┌───────────────────────┐
│ Seeded data generator │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐    ┌───────────────────────┐
│ Merchant ledger CSV   │    │ Settlement report CSV │
└───────────┬───────────┘    └───────────┬───────────┘
            └──────────────┬──────────────┘
                           ▼
                ┌─────────────────────┐
                │ Candidate discovery │
                │ scoring + ranking   │
                └──────────┬──────────┘
                           ▼
              ┌──────────────────────────┐
              │ Deterministic classifier │
              │ duplicate → exact → fee  │
              │ → delayed → refund → no  │
              └───────────┬──────────────┘
                          │
            ┌─────────────┴──────────────┐
            ▼                            ▼
    Confident outcome             Ambiguous exception
                                         │
                                         ▼
                              ┌────────────────────┐
                              │ Claude explanation │
                              │ status is immutable│
                              └─────────┬──────────┘
                                        │
            ┌───────────────────────────┴──────────────────────┐
            ▼                         ▼                        ▼
      Audit trail              Reporting/accuracy        Exception report
            └───────────────────────────┬──────────────────────┘
                                        ▼
                              Express API → React UI

Ground truth JSON ───────────────► validation only after classification
```

## Project components

| Component | Responsibility |
|---|---|
| `data-generator/` | Seeded source data, fee/GST rules, working-day dates, CSV serialization and validation |
| `matching-engine/` | Candidate scoring, duplicate detection, deterministic rules, one-to-one assignment |
| `ai/` | Official Anthropic SDK wrapper, immutable evidence prompt, graceful fallback |
| `audit/` | One decision record per order and atomic JSON persistence |
| `reporting/` | Summary, exceptions, accuracy, precision/recall, throughput, complete pipeline |
| `server/` | Express API, Zod validation, serialized writes, localhost production serving |
| `client/` | React/Vite/Tailwind operations console, chart, filters, investigation drawer |
| `demo.ts` | Seed-42 generation, samples, reconciliation, metrics, production dashboard startup |

## Generator and business rules

All thresholds live in `data-generator/businessRules.ts`.

| Rule | Value |
|---|---|
| UPI fee | 0.25%–1% |
| Card fee | 1%–2% |
| Netbanking fee | 0.5%–1.5% |
| GST on fee | 18% |
| Card GST exception | Card amount ≤ ₹2,000 → GST on fee = 0 |
| Settlement formula | Amount − fee − GST |
| Exact tolerance | ≤ ₹1 |
| Wider tolerance | > ₹1 and ≤ ₹5 |
| Normal date | 1–2 working days |
| Delayed date | 3–5 working days |

The generator uses a largest-remainder allocation around 70% exact, 12% fee-adjusted, 6% possible refund, and 4% each missing, duplicate, and delayed. Missing orders have no Source B row; refunds contain an unexplained shortfall; duplicate cases share UTRs. Hidden labels exist only in `ground_truth.json`.

## Candidate discovery

The engine evaluates every order/settlement relationship from independent signals:

| Signal | Score |
|---|---:|
| Exact linked order ID | +50 |
| Non-empty link to another order | −30 |
| Exact post-fee amount | +25 |
| Amount within ₹1 | +20 |
| Amount within ₹5 | +10 |
| Normal date window | +15 |
| Extended date window | +5 |
| Fee and GST profile valid for the order | +10 |

Blank linked IDs are neutral. Candidates below 20 are excluded. Stable sorting uses score, absolute difference, then payment ID. A linked ID is evidence, never a classification by itself.

## Deterministic classification

1. Detect duplicate UTR groups before assignment.
2. Discover candidates for every merchant order.
3. Evaluate exact amount/date reconciliation.
4. Evaluate wider fee-adjusted reconciliation.
5. Preserve valid but late settlements as `DELAYED_SETTLEMENT`.
6. Detect negative differences above ₹5 as possible refunds when reference or financial-profile evidence is credible.
7. Assign `NO_SETTLEMENT_FOUND` when no unused edge satisfies a rule.

Candidate edges with direct order links are assigned first, followed by score and smallest absolute difference. Assigned order and payment IDs are tracked separately, preventing one settlement from resolving multiple orders. Duplicate groups never enter normal assignment.

## Claude trust boundary

Claude receives only structured evidence for possible refunds, duplicate references, or missing settlements with multiple candidates. The system prompt states that the deterministic result is immutable and prohibits invented facts or replacement classifications.

The explanation function returns a separate object. It has no write path into `status`, `reconciled`, `confidence`, or financial values. SDK retries are disabled; the request timeout is eight seconds with an independent application deadline. Missing configuration, timeout, rate limiting, API failure, or empty output returns `UNAVAILABLE` without failing the batch.

## Audit trail

Every Source A order produces exactly one audit entry containing:

- Timestamp and order ID.
- Candidate payment IDs and selected UTR/payment ID.
- Expected and actual settlement values.
- Difference, unexplained shortfall, and working-day lag.
- Ordered rules evaluated and rule fired.
- Final classification, confidence, reconciliation flag, and reason.
- Claude consultation, status, error code, explanation, and latency.

JSON artifacts are written to temporary files and atomically renamed into place.

## Reporting and validation

The reporting layer creates:

| Artifact | Purpose |
|---|---|
| `reconciliation_result.json` | Enriched per-order results for API/UI |
| `audit_trail.json` | Reconstructable financial decision record |
| `summary.json` | Counts, rates, false matches, timing, throughput |
| `accuracy_report.json` | Overall and per-category accuracy/precision/recall |
| `exception_report.json` | Every non-exact warning or unresolved exception |

Ground truth is loaded only after `reconcileBatch` has completed. A false match is a predicted reconciled order whose hidden label is unresolved. A false exception is the reverse.

Deterministic time encloses the reconciliation engine only. Claude wall time is tracked separately. Total processing is deterministic plus Claude time, and records/second uses deterministic time.

## API and concurrency

Express provides:

```text
POST /api/generate
POST /api/reconcile
GET  /api/report
GET  /api/exceptions
GET  /api/audit
GET  /api/health
GET  /health
GET  /api/metrics
```

Zod validates generate bodies and exception queries. A service-level promise queue serializes generation and reconciliation, avoiding overlapping artifact writes. Regeneration removes stale derived reports. Unexpected server details are not exposed to clients.

The production/demo listener binds to `HOST`, which defaults to `127.0.0.1`. Allowed values are limited to loopback and explicit wildcard addresses. In production-build mode Express serves `client/dist` and the API from the same origin. Development mode uses Vite on port 5173 with an `/api` proxy to port 3001.

## Operational controls

The server emits structured operational events for startup, shutdown, health, generation, reconciliation, and failures. Logged reconciliation outcomes contain aggregate counts and duration only. The process-local metrics endpoint exposes aggregate job and record counters and no order, customer, settlement, credential, or ground-truth values.

The release container uses a multi-stage build, exact runtime versions, an unprivileged user, and `/health` for its health check. The image starts with empty writable data storage; persistence, encryption, backup, ingress, authentication, and TLS remain deployment responsibilities.

## Dashboard

The first viewport exposes batch controls and measured outcomes. Six cards report records, reconciled count, match rate, unresolved exceptions, deterministic time, and throughput. Recharts visualizes category composition. The exception table supports status filters and free-text search. Selecting a row opens an accessible drawer with order information, settlement evidence, calculations, rules, audit context, and AI availability.

The interface uses Tailwind-powered design tokens, semantic tables, Lucide icons, responsive breakpoints, keyboard row activation, Escape-to-close behavior, and lazy chart loading.

## Reproducibility and isolation

The same numeric seed and batch size produce identical source files, row ordering, hidden labels, and classification outcomes. Timing and audit timestamps naturally vary by run and machine. Source CSVs never contain ground-truth labels. Tests pass ground truth only to reporting assertions after the classifier returns.

## Error and security boundaries

- CSV parser validates quoting, field counts, required columns, dates, amounts, payment modes, and unique order/payment IDs.
- `.env` and secrets are ignored by Git.
- Claude runs server-side only; keys never enter the browser bundle.
- JSON body size is limited to 100 KB.
- Batch size is limited to 50–10,000 through the API.
- API and dashboard listeners are localhost-only by default; wildcard binding requires explicit `HOST` configuration.
- File names are fixed by the service; request input cannot choose filesystem paths.

## Final delivery state

All eight phases are complete. The seed-42 demo processes 100 orders, reconciles 86, escalates 14, records zero false matches against synthetic truth, emits one audit record per order, and exposes every outcome through the dashboard.
