import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import webpush from "web-push";

const base = resolve(".vercel/ops-backups");
const target = resolve(process.argv[2] || ".vercel/ops-backups/web-push.env");
if (relative(base, target).startsWith("..") || target === base) throw new Error("Use a file inside .vercel/ops-backups (ignored by Git).");
mkdirSync(base, { recursive: true, mode: 0o700 });
const keys = webpush.generateVAPIDKeys();
// Exclusive creation avoids accidentally rotating the identity of existing subscriptions.
writeFileSync(target, `WEB_PUSH_ENABLED=true\nWEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=mailto:rallyon.support@gmail.com\n`, { mode: 0o600, flag: "wx" });
console.log("VAPID keys saved to the protected output file. Values are not printed.");
