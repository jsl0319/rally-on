import { LOGIN_SUPPORT_EMAIL, LOGIN_SUPPORT_HREF } from "@/lib/support-contact";

export function LoginSupportContact() {
  return <p className="text-center text-[10px] leading-[18px] text-[var(--tm-text-secondary)]">로그인 문의 · <a className="inline-flex min-h-6 items-center underline underline-offset-4" href={LOGIN_SUPPORT_HREF}>{LOGIN_SUPPORT_EMAIL}</a></p>;
}
