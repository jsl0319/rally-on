"use client";

import { ThemeProvider } from "@wanteddev/wds";
import { AppRouterCacheProvider } from "@wanteddev/wds-nextjs";

import type { ReactNode } from "react";

export function WdsProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider disableDefaultGlobalStyle>
      <AppRouterCacheProvider>{children}</AppRouterCacheProvider>
    </ThemeProvider>
  );
}
