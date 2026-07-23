import { describe, expect, it } from "vitest";
import {
  checkEntitlement,
  entitlementFromEnv,
  mintLicense,
  REUNION_PRODUCT,
  verifyLicense,
} from "../src/index.js";

const SECRET = "a-secret-the-server-holds";

describe("reunion licences", () => {
  it("verifies the key it minted for an address", () => {
    const key = mintLicense(SECRET, "buyer@example.com");
    expect(verifyLicense(SECRET, "buyer@example.com", key)).toEqual({ ok: true });
  });

  it("is deterministic, so a lost key can be re-issued identically", () => {
    expect(mintLicense(SECRET, "buyer@example.com")).toBe(
      mintLicense(SECRET, "buyer@example.com"),
    );
  });

  it("binds the key to the address it was bought with", () => {
    const key = mintLicense(SECRET, "buyer@example.com");
    const verdict = verifyLicense(SECRET, "someone-else@example.com", key);
    expect(verdict.ok).toBe(false);
  });

  it("forgives how a key gets retyped off a receipt", () => {
    const key = mintLicense(SECRET, "Buyer@Example.com");
    const mangled = ` ${key.toLowerCase().replace(/-/g, " ")} `;
    expect(verifyLicense(SECRET, "buyer@example.com", mangled)).toEqual({ ok: true });
  });

  it("refuses a key minted under a different secret", () => {
    const key = mintLicense("some-other-secret", "buyer@example.com");
    expect(verifyLicense(SECRET, "buyer@example.com", key).ok).toBe(false);
  });

  it("reads aloud: no letters that get confused for digits", () => {
    const key = mintLicense(SECRET, "buyer@example.com");
    expect(key.startsWith("HF1-")).toBe(true);
    expect(key).not.toMatch(/[ILOU]/);
  });

  it("fails closed when the build has no licence authority", () => {
    const key = mintLicense(SECRET, "buyer@example.com");
    const verdict = checkEntitlement({ secret: "", unlocked: false }, "buyer@example.com", key);
    expect(verdict.ok).toBe(false);
    // An unconfigured build must not accidentally give the DLC away.
    expect(verdict.ok === false && verdict.reason).toContain("licence authority");
  });

  it("opens for development only when told to explicitly", () => {
    expect(
      checkEntitlement({ secret: "", unlocked: true }, "anyone@example.com", undefined),
    ).toEqual({ ok: true });
    expect(
      checkEntitlement({ secret: SECRET, unlocked: false }, "anyone@example.com", undefined).ok,
    ).toBe(false);
  });

  it("reads its configuration from the environment", () => {
    expect(
      entitlementFromEnv({
        HOWEVERFAR_LICENSE_SECRET: "s",
        HOWEVERFAR_REUNION_UNLOCKED: "1",
      } as NodeJS.ProcessEnv),
    ).toEqual({ secret: "s", unlocked: true });
    expect(entitlementFromEnv({} as NodeJS.ProcessEnv)).toEqual({
      secret: "",
      unlocked: false,
    });
  });

  it("separates products, so one key does not unlock everything", () => {
    const key = mintLicense(SECRET, "buyer@example.com", REUNION_PRODUCT);
    expect(verifyLicense(SECRET, "buyer@example.com", key, "some-other-product").ok).toBe(
      false,
    );
  });
});
