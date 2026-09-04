import { MerchantOrder, SettlementRecord } from "./types";

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serialize<T extends object>(rows: T[], columns: readonly (keyof T)[]): string {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column] as string | number)).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

export function serializeMerchantLedger(rows: MerchantOrder[]): string {
  return serialize(rows, ["order_id", "amount", "order_date", "customer_name", "payment_mode"]);
}

export function serializeSettlementReport(rows: SettlementRecord[]): string {
  return serialize(rows, [
    "payment_id",
    "utr",
    "settled_amount",
    "settlement_date",
    "fee_deducted",
    "gst_on_fee",
    "linked_order_id"
  ]);
}

function parseCsvMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length > 0) throw new Error(`Malformed CSV near character ${index}.`);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field.");
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function parseObjects(input: string, requiredColumns: readonly string[]): Record<string, string>[] {
  const matrix = parseCsvMatrix(input);
  if (matrix.length === 0) throw new Error("CSV dataset is empty.");
  const header = matrix[0];
  for (const column of requiredColumns) {
    if (!header.includes(column)) throw new Error(`CSV is missing required column: ${column}.`);
  }
  return matrix.slice(1).map((values, rowIndex) => {
    if (values.length !== header.length) {
      throw new Error(`Malformed CSV row ${rowIndex + 2}: expected ${header.length} fields, received ${values.length}.`);
    }
    return Object.fromEntries(header.map((column, index) => [column, values[index]]));
  });
}

function parseMoney(value: string, field: string, row: number, allowZero = false): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`Invalid ${field} on CSV row ${row}: expected ${allowZero ? "a non-negative" : "a positive"} number.`);
  }
  return parsed;
}

function assertIsoDate(value: string, field: string, row: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new Error(`Invalid ${field} on CSV row ${row}.`);
  }
}

export function parseMerchantLedger(input: string): MerchantOrder[] {
  const columns = ["order_id", "amount", "order_date", "customer_name", "payment_mode"] as const;
  const parsed = parseObjects(input, columns).map((row, index) => {
    const rowNumber = index + 2;
    if (!row.order_id || !row.customer_name) throw new Error(`Missing merchant field on CSV row ${rowNumber}.`);
    assertIsoDate(row.order_date, "order_date", rowNumber);
    if (!(["UPI", "CARD", "NETBANKING"] as string[]).includes(row.payment_mode)) {
      throw new Error(`Invalid payment_mode on CSV row ${rowNumber}.`);
    }
    return {
      order_id: row.order_id,
      amount: parseMoney(row.amount, "amount", rowNumber),
      order_date: row.order_date,
      customer_name: row.customer_name,
      payment_mode: row.payment_mode as MerchantOrder["payment_mode"]
    };
  });
  const ids = new Set<string>();
  for (const order of parsed) {
    if (ids.has(order.order_id)) throw new Error(`Duplicate order_id: ${order.order_id}.`);
    ids.add(order.order_id);
  }
  return parsed;
}

export function parseSettlementReport(input: string): SettlementRecord[] {
  const columns = [
    "payment_id",
    "utr",
    "settled_amount",
    "settlement_date",
    "fee_deducted",
    "gst_on_fee",
    "linked_order_id"
  ] as const;
  const parsed = parseObjects(input, columns).map((row, index) => {
    const rowNumber = index + 2;
    if (!row.payment_id || !row.utr) throw new Error(`Missing settlement field on CSV row ${rowNumber}.`);
    assertIsoDate(row.settlement_date, "settlement_date", rowNumber);
    return {
      payment_id: row.payment_id,
      utr: row.utr,
      settled_amount: parseMoney(row.settled_amount, "settled_amount", rowNumber, true),
      settlement_date: row.settlement_date,
      fee_deducted: parseMoney(row.fee_deducted, "fee_deducted", rowNumber, true),
      gst_on_fee: parseMoney(row.gst_on_fee, "gst_on_fee", rowNumber, true),
      linked_order_id: row.linked_order_id
    };
  });
  const ids = new Set<string>();
  for (const settlement of parsed) {
    if (ids.has(settlement.payment_id)) throw new Error(`Duplicate payment_id: ${settlement.payment_id}.`);
    ids.add(settlement.payment_id);
  }
  return parsed;
}
