import { Router } from "express";
import { z } from "zod";
import { FinanceControllerService } from "./reconciliationService";
import { getOperationalMetrics, logOperationalEvent } from "./observability";

const generateSchema = z.object({
  records: z.number().int().min(50).max(10_000).default(100),
  seed: z.number().int().safe().default(42)
});

const exceptionQuerySchema = z.object({
  type: z
    .enum([
      "EXACT_MATCH",
      "FEE_ADJUSTED_MATCH",
      "POSSIBLE_REFUND",
      "NO_SETTLEMENT_FOUND",
      "DUPLICATE_REFERENCE",
      "DELAYED_SETTLEMENT"
    ])
    .optional(),
  search: z.string().trim().max(100).optional()
});

export function createApiRouter(service: FinanceControllerService): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    logOperationalEvent("info", "health_check", { status: "ok" });
    response.json(createHealthResponse());
  });

  router.get("/metrics", (_request, response) => {
    response.json(getOperationalMetrics());
  });

  router.post("/generate", async (request, response) => {
    const input = generateSchema.parse(request.body ?? {});
    const generated = await service.generate(input.records, input.seed);
    response.json({ success: true, ...generated });
  });

  router.post("/reconcile", async (_request, response) => {
    const output = await service.reconcile();
    response.json({ success: true, run_id: output.summary.run_id, summary: output.summary });
  });

  router.get("/report", async (_request, response) => {
    response.json(await service.getReport());
  });

  router.get("/exceptions", async (request, response) => {
    const query = exceptionQuerySchema.parse(request.query);
    const exceptions = await service.getExceptions(query);
    response.json({ count: exceptions.length, exceptions });
  });

  router.get("/audit", async (_request, response) => {
    const audit = await service.getAuditTrail();
    response.json({ count: audit.length, audit });
  });

  return router;
}

export function createHealthResponse() {
  return {
    status: "ok" as const,
    service: "ThirdWatch",
    timestamp: new Date().toISOString()
  };
}
