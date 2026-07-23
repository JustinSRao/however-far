import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The Reunion is paid for (ADR-0024). This is the whole of the mechanism:
 * an offline licence key bound to the buyer's email address.
 *
 * Why offline. The Reunion is self-hosted — one of the two players runs the
 * server on their own machine — so there is no licence server to call, and
 * under the zero-spend rule (ADR-0013) there is not going to be one. A key
 * that verifies with nothing but a shared secret and the address it was issued
 * to works on a laptop with no internet, costs nothing to run, and can be
 * issued by any storefront that can send an email.
 *
 * Why email. The Call already asks for it, in fiction, because that is how the
 * two players find each other. Binding the licence to the same address means
 * the DLC gate asks for nothing the story was not already asking for.
 *
 * What this is NOT. Offline licensing is not copy protection and this file
 * does not pretend otherwise: anyone running their own server can read the
 * secret out of their own build. It is a receipt, not a lock. It keeps honest
 * buyers straight and it is proportionate to a two-player finale that both
 * people have to have finished a whole playthrough to reach.
 */

export const REUNION_PRODUCT = "however-far-reunion";

const PREFIX = "HF1";
/** Crockford base32: no I, L, O or U, so a key can be read aloud. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 80 bits of signature — 16 characters, plenty against guessing. */
const KEY_BYTES = 10;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * The key for an address. Deterministic: the same secret and the same address
 * always produce the same key, so a buyer who loses theirs can be re-issued
 * the identical one without any record being kept.
 */
export function mintLicense(
  secret: string,
  email: string,
  product: string = REUNION_PRODUCT,
): string {
  if (secret.length === 0) throw new Error("cannot mint a licence without a secret");
  const mac = createHmac("sha256", secret)
    .update(`${product}\n${normalizeEmail(email)}`)
    .digest();
  const body = base32(mac.subarray(0, KEY_BYTES));
  const grouped = (body.match(/.{1,4}/g) ?? []).join("-");
  return `${PREFIX}-${grouped}`;
}

export type LicenseVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Check a key against the address that claims it. Comparison is
 * constant-time; formatting (case, spaces, dashes) is forgiven, because a key
 * gets retyped off a receipt by hand.
 */
export function verifyLicense(
  secret: string,
  email: string,
  key: string,
  product: string = REUNION_PRODUCT,
): LicenseVerdict {
  if (secret.length === 0) {
    return { ok: false, reason: "this build has no licence authority configured" };
  }
  const tidy = (s: string) => s.trim().toUpperCase().replace(/[\s-]/g, "");
  const expected = tidy(mintLicense(secret, email, product));
  const offered = tidy(key);
  if (offered.length !== expected.length) {
    return { ok: false, reason: "that key is not the right shape" };
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(offered, "utf8");
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "that key does not belong to that address" };
  }
  return { ok: true };
}

export interface EntitlementConfig {
  /** The shared secret keys are minted with. Empty means no authority. */
  secret: string;
  /**
   * Development escape hatch. Set `HOWEVERFAR_REUNION_UNLOCKED=1` to play the
   * finale without a key — for building it, and for the owner's own machine.
   * Deliberately separate from "no secret configured", so an unconfigured
   * build fails closed rather than open.
   */
  unlocked: boolean;
}

export function entitlementFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EntitlementConfig {
  return {
    secret: env["HOWEVERFAR_LICENSE_SECRET"] ?? "",
    unlocked: env["HOWEVERFAR_REUNION_UNLOCKED"] === "1",
  };
}

/**
 * May this address open the Reunion? The one question the server asks.
 *
 * Both players are checked, not just the host: the finale is something two
 * people bought, and letting one carry the other would make the "DLC" a
 * single purchase for two seats.
 */
export function checkEntitlement(
  config: EntitlementConfig,
  email: string,
  key: string | undefined,
): LicenseVerdict {
  if (config.unlocked) return { ok: true };
  if (!key || key.trim().length === 0) {
    return { ok: false, reason: "the Reunion needs a key, and there is none here" };
  }
  return verifyLicense(config.secret, email, key);
}
