import { describe, expect, it } from "vitest";
import { escapeHtml, renderFlowlyticsEmail } from "./emailLayout";

describe("emailLayout", () => {
  it("escapes HTML in titles", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).not.toContain("<script>");
  });

  it("renders branded Flowlytics shell with CTA", () => {
    const html = renderFlowlyticsEmail({
      title: "Welcome",
      bodyHtml: "<p>Hello</p>",
      cta: { label: "Open Billing", href: "https://example.com/billing" },
    });
    expect(html).toContain("Flowlytics");
    expect(html).toContain("#0D9488");
    expect(html).toContain("Open Billing");
    expect(html).toContain("https://example.com/billing");
  });
});
