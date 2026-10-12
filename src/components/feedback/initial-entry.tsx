"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const InitialEntryContext = createContext(true);

/** The root layout survives menu navigation; a new document starts a new entry. */
export function InitialEntryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [entryPath, setEntryPath] = useState<string | null>(pathname);
  const isInitialEntry = entryPath !== null && entryPath === pathname;

  // Derive this before rendering children, not in an effect that could flash the
  // brand for one frame. Once we leave the entry route, back navigation stays in-app.
  if (entryPath !== null && entryPath !== pathname) setEntryPath(null);

  return <InitialEntryContext.Provider value={isInitialEntry}>{children}</InitialEntryContext.Provider>;
}

export function useIsInitialEntry() {
  return useContext(InitialEntryContext);
}
