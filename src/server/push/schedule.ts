import { after } from "next/server";
import { getPrisma } from "@/server/db/prisma";
import { dispatchPush } from "./dispatch";
import { pushConfig } from "./policy";

let dispatching = false;

export function schedulePushDispatch() {
  if (!pushConfig()) return;
  try {
    after(async () => {
      if (dispatching) return;
      dispatching = true;
      try { await dispatchPush(getPrisma()); }
      catch { console.error({ event: "push.dispatch.failed" }); }
      finally { dispatching = false; }
    });
  } catch {
    // CLI/tests have no request context. Persisted notifications are picked up by cron.
  }
}
