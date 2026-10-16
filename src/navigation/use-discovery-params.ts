"use client";

import { useCallback, useMemo, type SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { readDiscoveryParams, writeDiscoveryParams, type DiscoveryState } from "./discovery-params";

export function useDiscoveryParams<S extends string>(sorts: readonly S[], defaultSort: S) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const value = useMemo(() => readDiscoveryParams(new URLSearchParams(search), sorts, defaultSort), [search, sorts, defaultSort]);
  const setValue = useCallback((action: SetStateAction<DiscoveryState<S>>) => {
    const current = readDiscoveryParams(new URLSearchParams(location.search), sorts, defaultSort);
    const next = typeof action === "function" ? action(current) : action;
    const params = writeDiscoveryParams(new URLSearchParams(location.search), next, defaultSort);
    // Applying filters is one list visit, not another step in the back stack.
    window.history.replaceState(null, "", pathname + (params.size ? `?${params}` : ""));
  }, [pathname, sorts, defaultSort]);
  return [value, setValue] as const;
}
