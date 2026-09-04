import { describe, it, expect } from "vitest";
import { computeSubtotalCents, computeTotalCents, formatUsd, formatDop } from "@/lib/pricing";

describe("computeSubtotalCents", () => {
  it("sums unit price times quantity across lines", () => {
    const total = computeSubtotalCents([
      { unitPriceCents: 2500, quantity: 2 },
      { unitPriceCents: 1000, quantity: 1 },
    ]);
    expect(total).toBe(6000);
  });

  it("returns 0 for an empty cart", () => {
    expect(computeSubtotalCents([])).toBe(0);
  });
});

describe("computeTotalCents", () => {
  it("adds shipping to subtotal", () => {
    expect(computeTotalCents(6000, 1200)).toBe(7200);
  });
});

describe("formatUsd", () => {
  it("formats cents as a two-decimal dollar string", () => {
    expect(formatUsd(7200)).toBe("72.00");
    expect(formatUsd(50)).toBe("0.50");
  });
});

describe("formatDop", () => {
  it("converts USD cents to a rounded, thousands-separated peso amount", () => {
    expect(formatDop(1200)).toBe("720");
    expect(formatDop(50000)).toBe("30,000");
  });
});
