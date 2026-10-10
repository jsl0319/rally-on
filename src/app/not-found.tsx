"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-app items-center justify-center px-5 py-12">
      <section className="rally-card w-full max-w-md p-7 text-center">
        <p className="text-sm font-semibold text-[var(--tm-action-primary)]">404</p>
        <h1 className="rally-page-title mt-3 text-2xl font-bold text-[var(--tm-text-primary)]">
          찾는 화면이 없어요.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">
          주소가 바뀌었거나 사용할 수 없는 화면이에요.
        </p>
        <Button as={Link} className="mt-6" fullWidth href="/" size="large">
          처음으로 돌아가기
        </Button>
      </section>
    </main>
  );
}
