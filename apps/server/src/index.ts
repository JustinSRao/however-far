import { NO_KEY_MESSAGE, resolveProvider } from "@unwritten/director";
import { buildServer } from "./app.js";

const PORT = Number(process.env["PORT"] ?? 3001);

async function main(): Promise<void> {
  const app = buildServer({ logger: true });

  const provider = resolveProvider();
  if (provider) {
    app.log.info(`Director provider: ${provider}`);
  } else {
    app.log.warn(
      `${NO_KEY_MESSAGE} The server will boot, but POST /api/sessions returns 503 until then.`,
    );
  }

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
