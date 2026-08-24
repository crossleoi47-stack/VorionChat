import { DEFAULT_DLP, DlpConfig, describeHits, scanText } from "./dlp";

const config: DlpConfig = { ...DEFAULT_DLP, mode: "block" };

describe("DLP — catches contact details leaking to clients", () => {
  it.each([
    ["+971 50 987 6543", "international with spaces"],
    ["0509876543", "local run of digits"],
    ["+971-50-123-4567", "hyphen separated"],
    ["(050) 987 6543", "parenthesised area code"],
  ])("flags %s (%s)", (text) => {
    const hits = scanText(`you can reach me on ${text}`, config);
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("flags email addresses", () => {
    const hits = scanText("mail me at ahmed.personal@gmail.com", config);
    expect(hits.some((h) => h.kind === "email")).toBe(true);
  });

  it("flags restricted phrases regardless of case", () => {
    const hits = scanText("Just MESSAGE ME ON my other line", config);
    expect(hits.some((h) => h.kind === "phrase")).toBe(true);
  });

  it("catches a phone number and a phrase in the same message", () => {
    const hits = scanText("call me directly on 0509876543", config);
    expect(new Set(hits.map((h) => h.kind))).toEqual(new Set(["phone", "phrase"]));
  });
});

/**
 * False positives are the reason people switch DLP off, which makes them a
 * security problem too. Ordinary business messages must pass cleanly.
 */
describe("DLP — does not fire on ordinary business messages", () => {
  it.each([
    "Your order 4471 shipped, arriving Tuesday",
    "The total is 250 AED including delivery",
    "Invoice 99213 is attached",
    "We open at 9 and close at 6",
    "Quantity 120 units, ref 5567",
  ])("passes: %s", (text) => {
    expect(scanText(text, config)).toEqual([]);
  });

  it("ignores digit runs too long to be a phone number", () => {
    // 20 digits — a tracking or reference number, not a phone.
    expect(scanText("tracking 12345678901234567890", config)).toEqual([]);
  });
});

describe("DLP — configuration is respected", () => {
  it("scans nothing when mode is off", () => {
    expect(scanText("call me on 0509876543", { ...config, mode: "off" })).toEqual([]);
  });

  it("skips phone detection when disabled", () => {
    const hits = scanText("0509876543", { ...config, detectPhones: false });
    expect(hits.some((h) => h.kind === "phone")).toBe(false);
  });

  it("only flags links when explicitly enabled", () => {
    expect(scanText("see https://example.com", config).some((h) => h.kind === "url")).toBe(false);
    expect(
      scanText("see https://example.com", { ...config, detectUrls: true }).some(
        (h) => h.kind === "url",
      ),
    ).toBe(true);
  });

  it("handles empty and whitespace input without throwing", () => {
    expect(scanText("", config)).toEqual([]);
    expect(scanText("   ", config)).toEqual([]);
  });
});

describe("describeHits — the message shown to the employee", () => {
  it("names each distinct kind once", () => {
    const text = describeHits([
      { kind: "phone", match: "1" },
      { kind: "phone", match: "2" },
      { kind: "email", match: "a@b.co" },
    ]);
    expect(text).toBe("a phone number and an email address");
  });
});
