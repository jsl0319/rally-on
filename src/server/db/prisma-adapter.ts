import { PrismaPg } from "@prisma/adapter-pg";

/** adapter-pg serializes DateTime assuming UTC; apply it to every pooled connection. */
export function createPrismaPg(connectionString: string) {
  const url = new URL(connectionString);
  const options = url.searchParams.get("options") ?? "";
  url.searchParams.set("options", `${options} -c timezone=UTC`.trim());
  return new PrismaPg({ connectionString: url.toString() });
}
