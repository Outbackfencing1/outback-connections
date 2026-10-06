// The dry-run CLI's exit contract: 2 unreadable input, 3 adapter gap, 1 invalid rows, 0 reviewed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "research-cli-"));
const file = (name: string, body: string) => {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
};
const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/review-research.mjs", ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout };
};

describe("review-research CLI exit codes", { timeout: 30_000 }, () => {
  it("a missing or malformed research file is unreadable input (2), not invalid rows (1)", () => {
    expect(run(join(dir, "missing.json"), "--lane", "cleaning").code).toBe(2);
    const bad = run(file("bad.json", "{ not json"), "--lane", "cleaning");
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.out)).toMatchObject({ imported: 0, error: expect.stringContaining("research file unreadable") });
  });
  it("an unreadable known/exclusions file is 2; an unrecognised one is an adapter gap (3)", () => {
    const ok = file("ok.json", "[]");
    expect(run(ok, "--lane", "cleaning", "--exclusions", file("ex-bad.json", "nope")).code).toBe(2);
    expect(run(ok, "--lane", "cleaning", "--exclusions", file("ex-obj.json", JSON.stringify({ generated_at: "x" }))).code).toBe(3);
  });
  it("a different contract is an adapter gap (3); a readable empty batch is reviewed (0)", () => {
    expect(run(file("other.json", JSON.stringify([{ company: "X", status: "proposed" }])), "--lane", "cleaning").code).toBe(3);
    expect(run(file("empty.json", "[]"), "--lane", "cleaning").code).toBe(0);
  });
});
