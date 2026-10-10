/** Small scheduled caller; business rules and database access stay in Rally On. */
type Environment = { RECONCILE_CRON_SECRET?: string };
type ScheduledEvent = { scheduledTime: number; noRetry(): void };

const endpoint = "https://tennis-mate-ochre.vercel.app/api/cron/reconcile-matches";

export async function runReconciliation(env: Environment, scheduledTime: number) {
  const startedAt = Date.now();
  let failure = "configuration";
  let httpStatus: number | undefined;
  try {
    const secret = env.RECONCILE_CRON_SECRET;
    if (!secret || secret.trim().length < 32) throw new Error("Missing secret");
    failure = "network_or_timeout";
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      // Never forward the credential to a redirected host or login page.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    httpStatus = response.status;
    failure = "http_status";
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error("Unexpected response");
    }
    failure = "invalid_result";
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("status" in result) || result.status !== "ok") {
      throw new Error("Invalid result");
    }
    // Do not log response bodies, request headers, or raw fetch errors.
    console.info({ event: "rally.cron.completed", scheduledTime, durationMs: Date.now() - startedAt });
  } catch {
    console.error({ event: "rally.cron.failed", scheduledTime, durationMs: Date.now() - startedAt, failure, httpStatus });
    // A rejected scheduled handler appears as a failed Cron Event.
    throw new Error(`Rally reconciliation failed: ${failure}`);
  }
}

const worker = {
  async scheduled(controller: ScheduledEvent, env: Environment) {
    // A timeout may leave the original server request running. Resume at the next
    // scheduled tick, rather than adding retries and unnecessary database wakeups.
    controller.noRetry();
    await runReconciliation(env, controller.scheduledTime);
  },
};

export default worker;
