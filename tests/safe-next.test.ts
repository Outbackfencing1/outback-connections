import { describe, expect, it } from "vitest";
import { safeNextPath, signInHref } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/claim/abc?x=1")).toBe("/claim/abc?x=1");
    expect(safeNextPath("/services/fencing-contractor")).toBe("/services/fencing-contractor");
  });

  it("refuses anything that could leave the site", () => {
    for (const v of [
      null,
      "",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\u0000/evil.com",
      "/\u007f/evil.com",
    ]) {
      expect(safeNextPath(v), JSON.stringify(v)).toBe("/dashboard");
    }
  });

  it("refuses the tab trick because browsers resolve it off-site", () => {
    expect(new URL("/\t/evil.com", "https://www.outbackconnections.com.au").host).toBe("evil.com");
    expect(safeNextPath("/\t/evil.com")).toBe("/dashboard");
  });
});

describe("signInHref", () => {
  it("keeps the query (e.g. the fencing category) through sign-in", () => {
    const href = signInHref("/post/service/request?category=fencing-contractor");
    expect(href).toBe("/signin?next=%2Fpost%2Fservice%2Frequest%3Fcategory%3Dfencing-contractor");
    // What the sign-in page reads back, then hands to safeNextPath.
    const next = new URL(href, "https://x.test").searchParams.get("next");
    expect(safeNextPath(next)).toBe("/post/service/request?category=fencing-contractor");
  });

  it("never builds an off-site return path", () => {
    for (const v of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com"]) {
      const next = new URL(signInHref(v), "https://x.test").searchParams.get("next");
      expect(next).toBe("/dashboard");
    }
  });
});
