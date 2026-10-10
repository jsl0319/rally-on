"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-app items-center justify-center px-5 py-12">
      <section className="rally-card w-full max-w-md p-7 text-center">
        <h1 className="rally-page-title text-2xl font-bold text-[var(--tm-text-primary)]">
          잠시 문제가 생겼어요.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">
          입력한 내용은 그대로 두고 다시 시도해 주세요. 계속 문제가 생기면
          잠시 후 이용해 주세요.
        </p>
        <Button className="mt-6" fullWidth onClick={reset}>
          다시 시도하기
        </Button>
      </section>
    </main>
  );
}
