import { describe, expect, it } from "vitest";
import { portsFor } from "./ports";

describe("portsFor", () => {
  it("gives ingest output only", () => {
    expect(portsFor("ingest.csv_excel")).toEqual({
      hasInput: false,
      hasOutput: true,
    });
  });

  it("gives transform both ports", () => {
    expect(portsFor("transform.clean_map")).toEqual({
      hasInput: true,
      hasOutput: true,
    });
  });
});
