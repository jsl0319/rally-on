import { RallyWordmark } from "./rally-wordmark";

/** Identical geometry while waiting and after sign-in actions become available. */
export function EntryBrand() {
  return <div className="rally-welcome-identity" data-entry-identity>
    <h1><RallyWordmark /></h1>
    <p className="rally-welcome-slogan">부담 없이, 함께 테니스</p>
    <p className="rally-welcome-purpose">나와 비슷한 메이트를 만나요</p>
  </div>;
}

export function EntryCourt() {
  return <svg className="rally-welcome-court" viewBox="0 0 440 680" fill="none" aria-hidden="true" focusable="false">
    <path d="M20 20H420V660H20Z M70 20V660 M370 20V660 M20 340H420 M70 180H370 M70 500H370 M220 180V500" stroke="currentColor" strokeWidth="2" />
  </svg>;
}
