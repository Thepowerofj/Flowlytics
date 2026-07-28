const baseUrl = process.env.APP_URL || "http://localhost:3000";

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      const body = (await res.json()) as { ok?: boolean; service?: string };
      if (res.ok && body.ok === true && body.service === "flowlytics") {
        return;
      }
    } catch {
      // App may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Health check did not pass at ${baseUrl}/api/health`);
}

async function assertRoute(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (res.status >= 500) {
    throw new Error(`${path} returned ${res.status}`);
  }
}

async function main() {
  await waitForHealth();
  await assertRoute("/ask");
  console.log(`Smoke E2E passed for ${baseUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
