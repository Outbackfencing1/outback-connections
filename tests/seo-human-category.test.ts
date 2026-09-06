import { describe, expect, it } from "vitest";
import { humanCategory } from "@/lib/seo";

describe("humanCategory", () => {
  it("drops the bracketed qualifier and pluralises", () => {
    expect(humanCategory("Fencing contractor (construction)")).toBe("Fencing contractors");
    expect(humanCategory("Rural supplies store")).toBe("Rural supplies stores");
  });

  it("leaves labels that already end in s alone", () => {
    expect(humanCategory("Rural supplies")).toBe("Rural supplies");
    expect(humanCategory("Drone services (agricultural)")).toBe("Drone services");
  });
});
