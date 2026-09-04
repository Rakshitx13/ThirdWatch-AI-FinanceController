import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app";

describe("Express API", () => {
  let dataDirectory: string;
  let emptyDirectory: string;
  let app: ReturnType<typeof createApp>;
  let emptyApp: ReturnType<typeof createApp>;
  let generateResponse: request.Response;
  let reconcileResponse: request.Response;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(path.join(os.tmpdir(), "finance-api-"));
    emptyDirectory = await mkdtemp(path.join(os.tmpdir(), "finance-api-empty-"));
    app = createApp({ dataDirectory, explanationClient: null });
    emptyApp = createApp({ dataDirectory: emptyDirectory, explanationClient: null });
    generateResponse = await request(app).post("/api/generate").send({ records: 50, seed: 42 });
    reconcileResponse = await request(app).post("/api/reconcile").send();
  });

  afterAll(async () => {
    await Promise.all([
      rm(dataDirectory, { recursive: true, force: true }),
      rm(emptyDirectory, { recursive: true, force: true })
    ]);
  });

  test("GET /api/health reports service status", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "ThirdWatch" });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  test("GET /health provides a container-safe health check without financial data", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "ThirdWatch" });
    expect(response.body).not.toHaveProperty("records");
  });

  test("GET /api/metrics exposes aggregate operational counters only", async () => {
    const response = await request(app).get("/api/metrics");
    expect(response.status).toBe(200);
    expect(response.body.records_processed_total).toBeGreaterThanOrEqual(50);
    expect(response.body.records_matched_total).toBeGreaterThanOrEqual(43);
    expect(response.body).not.toHaveProperty("order_id");
  });

  test("POST /api/generate creates a validated deterministic dataset", () => {
    expect(generateResponse.status).toBe(200);
    expect(generateResponse.body).toEqual({ success: true, records: 50, seed: 42 });
  });

  test("POST /api/reconcile executes the complete pipeline", () => {
    expect(reconcileResponse.status).toBe(200);
    expect(reconcileResponse.body.success).toBe(true);
    expect(reconcileResponse.body.run_id).toEqual(expect.stringMatching(/^RUN-/));
    expect(reconcileResponse.body.summary).toMatchObject({
      total_records: 50,
      total_reconciled: 43,
      unresolved_exceptions: 7,
      overall_match_rate: 86,
      false_matches: 0
    });
  });

  test("GET /api/report returns persisted measured metrics", async () => {
    const response = await request(app).get("/api/report");
    expect(response.status).toBe(200);
    expect(response.body.total_records).toBe(50);
    expect(response.body.records_per_second).toBeGreaterThan(0);
  });

  test("GET /api/exceptions supports type and search filters", async () => {
    const all = await request(app).get("/api/exceptions");
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(15);

    const refunds = await request(app).get("/api/exceptions").query({ type: "POSSIBLE_REFUND" });
    expect(refunds.status).toBe(200);
    expect(refunds.body.count).toBe(3);
    expect(refunds.body.exceptions.every((item: { status: string }) => item.status === "POSSIBLE_REFUND")).toBe(true);

    const orderId = refunds.body.exceptions[0].orderId;
    const searched = await request(app).get("/api/exceptions").query({ search: orderId });
    expect(searched.body.count).toBe(1);
    expect(searched.body.exceptions[0].orderId).toBe(orderId);
  });

  test("GET /api/audit returns exactly one entry per order", async () => {
    const response = await request(app).get("/api/audit");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(50);
    expect(new Set(response.body.audit.map((entry: { order_id: string }) => entry.order_id)).size).toBe(50);
  });

  test("returns useful errors for invalid requests and unavailable state", async () => {
    const invalidBatch = await request(app).post("/api/generate").send({ records: 49, seed: 42 });
    expect(invalidBatch.status).toBe(400);
    expect(invalidBatch.body.error.code).toBe("VALIDATION_ERROR");

    const invalidType = await request(app).get("/api/exceptions").query({ type: "MADE_UP" });
    expect(invalidType.status).toBe(400);

    const missingDataset = await request(emptyApp).post("/api/reconcile").send();
    expect(missingDataset.status).toBe(400);
    expect(missingDataset.body.error.code).toBe("DATASET_NOT_FOUND");

    const missingReport = await request(emptyApp).get("/api/report");
    expect(missingReport.status).toBe(404);
    expect(missingReport.body.error.code).toBe("REPORT_NOT_FOUND");

    const missingRoute = await request(app).get("/api/unknown");
    expect(missingRoute.status).toBe(404);
    expect(missingRoute.body.error.code).toBe("NOT_FOUND");
  });

  test("rejects malformed JSON bodies", async () => {
    const response = await request(app)
      .post("/api/generate")
      .set("Content-Type", "application/json")
      .send('{"records":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
