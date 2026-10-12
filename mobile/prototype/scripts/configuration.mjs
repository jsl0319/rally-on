import { isIP } from 'node:net';

function localHost(host) {
  if (['localhost', '127.0.0.1', '[::1]'].includes(host)) return true;
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function prototypeConfig(rawUrl, allowLocalHttp = false) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('검증할 웹앱의 절대 URL을 입력해 주세요.'); }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('인증 정보·쿼리·해시가 포함된 URL은 사용할 수 없어요.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowLocalHttp && localHost(url.hostname))) {
    throw new Error('HTTPS를 사용해 주세요. 로컬 HTTP만 --allow-local-http로 허용할 수 있어요.');
  }
  if (url.pathname !== '/' && url.pathname !== '/login') {
    throw new Error('시작 주소는 루트(/) 또는 /login만 사용할 수 있어요.');
  }
  return {
    appId: 'dev.rallyon.prototype',
    appName: 'Rally On 검증',
    webDir: 'www',
    appendUserAgent: ' RallyOnNativePrototype/0.0.1',
    loggingBehavior: 'none',
    server: {
      // iOS uses this URL as a prefix when deciding whether to leave the app.
      // Keep the origin boundary (including '/') separate from the first page.
      url: `${url.origin}/`,
      appStartPath: url.pathname,
      cleartext: url.protocol === 'http:',
      allowNavigation: ['kauth.kakao.com', 'accounts.kakao.com'],
      errorPath: 'offline.html',
    },
    // The web root handles safe areas with viewport-fit=cover and CSS env().
    ios: { contentInset: 'never' },
    android: { allowMixedContent: false },
  };
}

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function offlinePage(target) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Rally On 연결 확인</title><style>body{font:16px system-ui,sans-serif;margin:0;background:#f5f7fb;color:#1c2940}main{padding:max(48px,env(safe-area-inset-top)) 24px 32px;max-width:440px;margin:auto}h1{font-size:24px}p{line-height:1.7;color:#54637a}a{display:block;padding:16px;border-radius:14px;background:#0066ff;color:white;text-align:center;text-decoration:none;margin-top:28px}small{display:block;margin-top:24px;color:#65748a}</style></head><body><main><small>Rally On · 개발용 시제품</small><h1>연결을 확인해 주세요</h1><p>인터넷 연결 또는 개발 서버 상태를 확인한 뒤 다시 시도해 주세요. 기기의 localhost는 Mac을 가리키지 않아요.</p><a href="${escapeHtml(target)}">다시 연결</a></main></body></html>`;
}
