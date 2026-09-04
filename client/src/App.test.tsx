import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { AuditEntry, ReconciliationResult, Summary } from "./types";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  Tooltip: () => null
}));

const summary: Summary = {
  run_id: "RUN-TEST",
  generated_at: "2026-08-31T10:00:00.000Z",
  total_records: 100,
  exact_matches: 70,
  fee_adjusted_matches: 12,
  possible_refunds: 6,
  missing_settlements: 4,
  duplicate_references: 4,
  delayed_settlements: 4,
  total_reconciled: 86,
  unresolved_exceptions: 14,
  overall_match_rate: 86,
  exception_rate: 14,
  false_matches: 0,
  false_exceptions: 0,
  classification_accuracy: 100,
  deterministic_processing_time_ms: 24.74,
  llm_time_ms: 0,
  total_processing_time_ms: 24.74,
  processing_time_ms: 24.74,
  records_per_second: 4042.04
};

const exception: ReconciliationResult = {
  orderId: "ORD1011",
  status: "POSSIBLE_REFUND",
  reconciled: false,
  confidence: "MEDIUM",
  reason: "Possible refund / unexplained settlement shortfall of ₹300.00.",
  candidateIds: ["pay_1011"],
  selectedPaymentId: "pay_1011",
  selectedUtr: "UTR1011",
  expectedSettlement: 7392.07,
  actualSettlement: 7092.07,
  amountDifference: -300,
  unexplainedShortfall: 300,
  settlementLagWorkingDays: 1,
  rulesEvaluated: ["DUPLICATE_CHECK", "CANDIDATE_DISCOVERY", "POSSIBLE_REFUND"],
  llm_explanation: null,
  llm_status: "UNAVAILABLE",
  llm_error_code: "MISSING_CONFIGURATION",
  llm_time_ms: 0,
  order: {
    order_id: "ORD1011",
    amount: 7499,
    order_date: "2026-08-10",
    customer_name: "Diya Mehta",
    payment_mode: "UPI"
  },
  selectedSettlement: {
    payment_id: "pay_1011",
    utr: "UTR1011",
    settled_amount: 7092.07,
    settlement_date: "2026-08-11",
    fee_deducted: 90.62,
    gst_on_fee: 16.31,
    linked_order_id: "ORD1011"
  },
  candidateSettlements: []
};

const audit: AuditEntry = {
  order_id: "ORD1011",
  timestamp: "2026-08-31T10:00:00.000Z",
  candidate_ids: ["pay_1011"],
  rules_evaluated: exception.rulesEvaluated,
  rule_fired: "POSSIBLE_REFUND",
  classification: "POSSIBLE_REFUND",
  reconciled: false,
  confidence: "MEDIUM",
  reason: exception.reason,
  llm_consulted: false,
  llm_status: "UNAVAILABLE",
  llm_explanation: null
};

function jsonResponse(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url === "/api/report") return jsonResponse(summary);
    if (url === "/api/exceptions") return jsonResponse({ count: 1, exceptions: [exception] });
    if (url === "/api/audit") return jsonResponse({ count: 1, audit: [audit] });
    if (url === "/api/generate") return jsonResponse({ success: true, records: 100, seed: 42 });
    if (url === "/api/reconcile") return jsonResponse({ success: true, run_id: "RUN-TEST", summary });
    return jsonResponse({ error: { message: "Not found" } }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("finance operations dashboard", () => {
  test("renders measured outcomes and the exception queue", async () => {
    render(<App />);
    expect(await screen.findByText("RUN-TEST")).toBeInTheDocument();
    expect(screen.getByText("100", { selector: ".metric-card strong" })).toBeInTheDocument();
    expect(screen.getByText("86%", { selector: ".metric-card strong" })).toBeInTheDocument();
    expect(screen.getByText("ORD1011")).toBeInTheDocument();
    expect(screen.getByText("0 false matches")).toBeInTheDocument();
    expect(await screen.findByTestId("chart")).toBeInTheDocument();
  });

  test("filters, searches, and opens a reconstructable detail drawer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("ORD1011");
    await user.click(screen.getByRole("button", { name: "Refund" }));
    expect(screen.getByText("ORD1011")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search order, UTR, reason"), "no-such-order");
    expect(screen.getByText("No records match the current filter.")).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText("Search order, UTR, reason"));
    await user.click(screen.getByText("ORD1011"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Expected vs actual")).toBeInTheDocument();
    expect(within(dialog).getByText("Unexplained shortfall")).toBeInTheDocument();
    expect(within(dialog).getByText(/deterministic result remains complete/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close detail" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("generates a new seed-42 batch and moves to the intentional empty state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("RUN-TEST");
    await user.click(screen.getByRole("button", { name: "Generate Dataset" }));
    await waitFor(() => expect(screen.getByText(/Generated 100 synthetic orders with seed 42/)).toBeInTheDocument());
    expect(screen.getByText("No closed batch yet")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ records: 100, seed: 42 }) })
    );
  });
});
