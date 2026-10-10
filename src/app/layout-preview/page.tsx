import { notFound } from "next/navigation";
import { LayoutPreview } from "./preview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LayoutPreview />;
}
