"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { getSafeReturnTo, getStartAuthCallbackPath, type StartIntent } from "@/navigation/return-to";
import { WelcomeScreen } from "./welcome-screen";

export function EntrySelection({ returnTo = "/" }: { returnTo?: string }) {
  const safeReturnTo = getSafeReturnTo(returnTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const start = async (intent: StartIntent) => {
    setLoading(true); setError("");
    try { await signIn("kakao", { callbackUrl: getStartAuthCallbackPath(intent, safeReturnTo) }); }
    catch { setError("카카오에 연결하지 못했어요. 다시 시도해 주세요."); setLoading(false); }
  };
  return <WelcomeScreen error={error} loading={loading} onSignIn={() => void start("PLAYER")} onOperator={() => void start("OPERATOR")} />;
}
