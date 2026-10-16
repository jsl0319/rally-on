"use client";

import { useSyncExternalStore } from "react";
import { getClientEnvironment } from "./client-environment";

const subscribe = () => () => {};
const serverSnapshot = () => false;
function clientSnapshot() {
  const { os } = getClientEnvironment();
  return os === "ios" || os === "macos";
}

/** Only the unconnected preview button is platform-specific, not future Apple accounts. */
export function useAppleLoginPreview() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
