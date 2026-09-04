import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { runDemo } from "../demo";
import { createApp } from "../server/app";

describe("final integration acceptance", () => {
  test("demo generates, reconciles, measures, audits, and reports an entire batch", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "finance-demo-"));
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await runDemo({
        dataDirectory: directory,
        records: 50,
        seed: 42,
        startServerAfter: false,
        explanationClient: null
      });
      const [summary, results, audit, accuracy, exceptions] = await Promise.all([
        readFile(path.join(directory, "summary.json"), "utf8").then(JSON.parse),
        readFile(path.join(directory, "reconciliation_result.json"), "utf8").then(JSON.parse),
        readFile(path.join(directory, "audit_trail.json"), "utf8").then(JSON.parse),
        readFile(path.join(directory, "accuracy_report.json"), "utf8").then(JSON.parse),
        readFile(path.join(directory, "exception_report.json"), "utf8").then(JSON.parse)
      ]);
      expect(summary).toMatchObject({
        total_records: 50,
        total_reconciled: 43,
        unresolved_exceptions: 7,
        overall_match_rate: 86,
        false_matches: 0,
        classification_accuracy: 100
      });
      expect(results).toHaveLength(50);
      expect(audit).toHaveLength(50);
      expect(accuracy.correct_classifications).toBe(50);
      expect(exceptions).toHaveLength(15);
      expect(log.mock.calls.flat().join("\n")).toContain("THIRDWATCH — AI FINANCE CONTROLLER");
      expect(log.mock.calls.flat().join("\n")).toContain("False matches:");
      expect(log.mock.calls.flat().join("\n")).toContain("Throughput:");
    } finally {
      log.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("production server serves the built dashboard shell and API from one localhost app", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "finance-static-"));
    try {
      await writeFile(path.join(directory, "index.html"), "<!doctype html><title>ThirdWatch — AI Finance Controller</title>");
      const app = createApp({ serveClient: true, clientDirectory: directory, dataDirectory: directory });
      const dashboard = await request(app).get("/").set("Accept", "text/html");
      expect(dashboard.status).toBe(200);
      expect(dashboard.text).toContain("ThirdWatch — AI Finance Controller");
      const health = await request(app).get("/api/health");
      expect(health.status).toBe(200);
      expect(health.body.status).toBe("ok");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
