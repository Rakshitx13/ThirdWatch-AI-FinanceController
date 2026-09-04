import express, { ErrorRequestHandler } from "express";
import path from "node:path";
import { Server } from "node:http";
import { z } from "zod";
import { createApiRouter, createHealthResponse } from "./routes";
import { logOperationalEvent } from "./observability";
import {
  FinanceControllerService,
  FinanceControllerServiceOptions,
  ServiceError
} from "./reconciliationService";

export interface AppOptions extends FinanceControllerServiceOptions {
  serveClient?: boolean;
  clientDirectory?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const service = new FinanceControllerService(options);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_request, response) => {
    logOperationalEvent("info", "health_check", { status: "ok" });
    response.json(createHealthResponse());
  });
  app.use("/api", createApiRouter(service));

  if (options.serveClient) {
    const clientDirectory = path.resolve(options.clientDirectory ?? path.join(process.cwd(), "client", "dist"));
    app.use(express.static(clientDirectory));
    app.use((request, response, next) => {
      if (request.method === "GET" && !request.path.startsWith("/api/") && request.accepts("html")) {
        response.sendFile(path.join(clientDirectory, "index.html"));
        return;
      }
      next();
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    logOperationalEvent("error", "http_request_failed", {
      error_type: error instanceof Error ? error.name : "UnknownError"
    });
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed.",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
        }
      });
      return;
    }
    if (error instanceof ServiceError) {
      response.status(error.statusCode).json({
        error: { code: error.code, message: error.message }
      });
      return;
    }
    if (error instanceof SyntaxError && "status" in error && error.status === 400) {
      response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is invalid JSON." } });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const isInputFailure = /CSV|dataset|order_id|payment_id|amount|date|ground truth/i.test(message);
    response.status(isInputFailure ? 400 : 500).json({
      error: {
        code: isInputFailure ? "INVALID_DATASET" : "INTERNAL_ERROR",
        message: isInputFailure ? message : "Unexpected server error."
      }
    });
  };
  app.use(errorHandler);
  return app;
}

export function startServer(options: AppOptions = {}): Server {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = process.env.HOST?.trim() || "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0", "::1", "::"].includes(host)) {
    throw new Error("HOST must be one of 127.0.0.1, 0.0.0.0, ::1, or ::.");
  }
  return createApp({ ...options, serveClient: true }).listen(port, host, () => {
    logOperationalEvent("info", "server_started", { host, port });
    console.log(`ThirdWatch — AI Finance Controller listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  const server = startServer();
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logOperationalEvent("info", "server_shutdown_started", { signal });
    server.close((error) => {
      if (error) {
        logOperationalEvent("error", "server_shutdown_failed", { error_type: error.name });
        process.exitCode = 1;
      } else {
        logOperationalEvent("info", "server_stopped");
      }
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
