import {
  parseMerchantLedger,
  parseSettlementReport,
  serializeMerchantLedger,
  serializeSettlementReport
} from "../data-generator/csv";
import { generateDataset } from "../data-generator/generator";

describe("CSV parsing", () => {
  test("round-trips generated source files", () => {
    const dataset = generateDataset(50, 42);
    expect(parseMerchantLedger(serializeMerchantLedger(dataset.merchantLedger))).toEqual(dataset.merchantLedger);
    expect(parseSettlementReport(serializeSettlementReport(dataset.settlementReport))).toEqual(dataset.settlementReport);
  });

  test("supports quoted commas and rejects malformed input", () => {
    const parsed = parseMerchantLedger(
      'order_id,amount,order_date,customer_name,payment_mode\nORD1,499,2026-08-01,"Sharma, Aarav",UPI\n'
    );
    expect(parsed[0].customer_name).toBe("Sharma, Aarav");
    expect(() => parseMerchantLedger('order_id,amount\n"unterminated,499')).toThrow("unterminated");
    expect(() => parseMerchantLedger("order_id,amount\nORD1,-1\n")).toThrow();
  });
});
