/** Public fallback for people who cannot sign in; this does not send mail. */
export const LOGIN_SUPPORT_EMAIL = "rallyon.support@gmail.com";
export const LOGIN_SUPPORT_HREF = `mailto:${LOGIN_SUPPORT_EMAIL}?subject=${encodeURIComponent("Rally On 로그인 문의")}`;
