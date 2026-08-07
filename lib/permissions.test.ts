import { afterEach, describe, expect, it } from "vitest";
import { isTasya, tasyaEmails } from "./permissions";

describe("permissions", () => {
  const original = process.env.TASYA_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.TASYA_EMAILS;
    else process.env.TASYA_EMAILS = original;
  });

  it("defaults to alyssatasya@gmail.com when TASYA_EMAILS is unset", () => {
    delete process.env.TASYA_EMAILS;
    expect(tasyaEmails()).toEqual(["alyssatasya@gmail.com"]);
    expect(isTasya("alyssatasya@gmail.com")).toBe(true);
    expect(isTasya("ollie.bondan@gmail.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    delete process.env.TASYA_EMAILS;
    expect(isTasya("AlyssaTasya@Gmail.com")).toBe(true);
  });

  it("honors a custom TASYA_EMAILS override, comma-separated", () => {
    process.env.TASYA_EMAILS = "a@b.c, d@e.f ,g@h.i";
    expect(tasyaEmails()).toEqual(["a@b.c", "d@e.f", "g@h.i"]);
    expect(isTasya("d@e.f")).toBe(true);
    expect(isTasya("alyssatasya@gmail.com")).toBe(false);
  });
});
