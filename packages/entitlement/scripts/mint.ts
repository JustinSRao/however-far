import { mintLicense, REUNION_PRODUCT } from "../src/index.js";

/**
 * Issue Reunion keys from the command line — the whole fulfilment pipeline
 * (ADR-0024). Whatever storefront takes the money, this is what turns an
 * address into the key that goes in the receipt.
 *
 *   HOWEVERFAR_LICENSE_SECRET=... npm run mint -w @howeverfar/entitlement -- buyer@example.com
 *
 * Reads addresses from arguments, or one per line on stdin for a batch.
 */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const secret = process.env["HOWEVERFAR_LICENSE_SECRET"] ?? "";
  if (secret.length === 0) {
    console.error(
      "HOWEVERFAR_LICENSE_SECRET is not set. Keys minted with a different secret than the\n" +
        "server verifies with will not work, so this refuses rather than guess.",
    );
    process.exitCode = 2;
    return;
  }
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const piped = (await readStdin())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const emails = [...args, ...piped];

  if (emails.length === 0) {
    console.error("usage: mint <email> [email...]   (or pipe one address per line)");
    process.exitCode = 2;
    return;
  }
  for (const email of emails) {
    console.log(`${email}\t${mintLicense(secret, email, REUNION_PRODUCT)}`);
  }
}

void main();
