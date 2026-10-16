"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { installNavigationHistory, resetNavigationHistory, restoreAfterRender } from "@/navigation/history";

export function NavigationHistory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(installNavigationHistory, []);
  useEffect(() => {
    if (pathname === "/login") resetNavigationHistory();
    else restoreAfterRender(pathname + (search ? `?${search}` : ""));
  }, [pathname, search]);
  return null;
}
