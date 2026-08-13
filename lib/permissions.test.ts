import { afterEach, describe, expect, it } from "vitest";
import { canActOnStep, displayName, roleOf } from "./permissions";
import { STEPS } from "./types";

const ENV_KEYS = ["FRONT_EMAILS", "STRINGER_EMAILS", "PAYEE_EMAILS"] as const;

describe("permissions", () => {
  const original: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) original[k] = process.env[k];
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  function clearEnv() {
    for (const k of ENV_KEYS) delete process.env[k];
  }

  it("defaults to the real team when no role env vars are set", () => {
    clearEnv();
    expect(roleOf("ollie.bondan@gmail.com")).toBe("front");
    expect(roleOf("esti.bondan@gmail.com")).toBe("front");
    expect(roleOf("aisha.bondan@gmail.com")).toBe("front");
    expect(roleOf("titon@yonex.ch")).toBe("stringer");
    expect(roleOf("alyssatasya@gmail.com")).toBe("payee");
  });

  it("is unassigned (null) for an unknown email", () => {
    clearEnv();
    expect(roleOf("stranger@example.com")).toBeNull();
  });

  it("is case-insensitive", () => {
    clearEnv();
    expect(roleOf("Alyssatasya@Gmail.com")).toBe("payee");
  });

  it("honors a custom role env var override, comma-separated", () => {
    clearEnv();
    process.env.PAYEE_EMAILS = "a@b.c, d@e.f ,g@h.i";
    expect(roleOf("d@e.f")).toBe("payee");
    // the default Payee is no longer assigned once the env var is set
    expect(roleOf("alyssatasya@gmail.com")).toBeNull();
  });

  describe("canActOnStep", () => {
    const step1 = STEPS[0]; // received - front
    const step3 = STEPS[2]; // fromTiton - stringer
    const step6 = STEPS[5]; // forwarded - payee
    const step7 = STEPS[6]; // tasyaReceived - payee

    it("Front can act on front-role steps, not stringer or payee steps", () => {
      clearEnv();
      expect(canActOnStep("ollie.bondan@gmail.com", step1)).toBe(true);
      expect(canActOnStep("ollie.bondan@gmail.com", step3)).toBe(false);
      expect(canActOnStep("ollie.bondan@gmail.com", step7)).toBe(false);
    });

    it("Payee can act on payee-role steps, not front steps", () => {
      clearEnv();
      expect(canActOnStep("alyssatasya@gmail.com", step6)).toBe(true);
      expect(canActOnStep("alyssatasya@gmail.com", step7)).toBe(true);
      expect(canActOnStep("alyssatasya@gmail.com", step1)).toBe(false);
    });

    it("Stringer (Titon) owns step 3 and nothing else", () => {
      clearEnv();
      for (const step of STEPS) {
        expect(canActOnStep("titon@yonex.ch", step)).toBe(step === step3);
      }
    });
  });

  describe("displayName", () => {
    it("maps known emails to first names", () => {
      expect(displayName("ollie.bondan@gmail.com")).toBe("Agung");
      expect(displayName("esti.bondan@gmail.com")).toBe("Esti");
      expect(displayName("aisha.bondan@gmail.com")).toBe("Aisha");
      expect(displayName("titon@yonex.ch")).toBe("Titon");
      expect(displayName("alyssatasya@gmail.com")).toBe("Tasya");
    });

    it("falls back to the email's local part for unknown emails", () => {
      expect(displayName("someone.new@example.com")).toBe("someone.new");
    });

    it("is case-insensitive", () => {
      expect(displayName("OLLIE.bondan@GMAIL.com")).toBe("Agung");
    });
  });
});
