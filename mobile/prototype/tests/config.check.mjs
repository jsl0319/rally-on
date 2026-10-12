import test from 'node:test';
import assert from 'node:assert/strict';
import { prototypeConfig, offlinePage } from '../scripts/configuration.mjs';

test('HTTPS 앱 주소와 제한된 카카오 이동만 설정한다', () => {
  const c = prototypeConfig('https://example.com/login');
  assert.equal(c.server.cleartext, false);
  assert.equal(c.loggingBehavior, 'none');
  assert.deepEqual(c.server.allowNavigation, ['kauth.kakao.com', 'accounts.kakao.com']);
  assert.equal(c.android.allowMixedContent, false);
  // Adding native automatic insets again makes CSS viewport height and fixed bars disagree.
  assert.equal(c.ios.contentInset, 'never');
});
test('로그인 시작 경로와 앱 기준 주소를 분리해 인증 callback과 상세를 앱에 유지한다', () => {
  for (const startPath of ['/', '/login']) {
    const c = prototypeConfig(`https://example.com${startPath}`);
    assert.equal(c.server.url, 'https://example.com/');
    assert.equal(new URL(c.server.appStartPath, c.server.url).pathname, startPath);
    for (const path of ['/api/auth/callback/kakao', '/start', '/matches/example']) {
      // Capacitor iOS WebViewDelegationHandler's application-navigation check.
      assert.ok(`https://example.com${path}`.startsWith(c.server.url));
    }
    assert.ok(!'https://example.com.evil.test/login'.startsWith(c.server.url));
    assert.ok(!'https://maps.kakao.com/'.startsWith(c.server.url));
    assert.deepEqual(prototypeConfig(new URL(c.server.appStartPath, c.server.url).href), c);
  }
});
for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'http://example.com', 'https://user:password@example.com', 'https://example.com?token=abc', 'https://example.com/#secret', 'https://example.com/api/auth/callback/kakao', '//example.com']) {
  test(`허용하지 않는 시작 주소 차단: ${url.split('?')[0]}`, () => assert.throws(() => prototypeConfig(url, true)));
}
test('HTTP는 명시적 옵션과 사설/루프백 주소가 모두 필요하다', () => {
  assert.throws(() => prototypeConfig('http://192.168.0.10:3000'));
  assert.equal(prototypeConfig('http://192.168.0.10:3000', true).server.cleartext, true);
  assert.throws(() => prototypeConfig('http://192.168.0.10.evil.test', true));
  assert.throws(() => prototypeConfig('http://172.32.0.1', true));
});
test('오프라인 페이지 링크의 HTML 문자를 이스케이프한다', () => {
  const page = offlinePage('https://example.com/" onmouseover="alert(1)');
  assert.ok(!page.includes('href="https://example.com/" onmouseover='));
  assert.ok(page.includes('&quot;'));
});
