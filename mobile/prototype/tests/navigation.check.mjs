import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('iOS 스와이프는 앱 화면만 허용하고 외부·로그인·인증 callback을 제외한다', { skip: process.platform !== 'darwin' }, async t => {
  const root = await mkdtemp(`${tmpdir()}/rally-navigation-swift-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await readFile(new URL('../native/ios/AppNavigation.swift', import.meta.url), 'utf8');
  const checks = `
let server = URL(string: "https://tennis-mate-ochre.vercel.app/")!
let source = URL(string: "/my", relativeTo: server)!.absoluteURL
for path in ["/", "/my/notifications", "/activity/sent", "/?gameType=MIXED_DOUBLES", "/partner-sessions/123"] {
    precondition(AppNavigation.allowsHistoryDestination(URL(string: path, relativeTo: server)!.absoluteURL, from: source, server: server))
}
for path in ["https://accounts.kakao.com/login", "https://evil.test/my", "https://tennis-mate-ochre.vercel.app.evil.test/my", "http://tennis-mate-ochre.vercel.app/my", "https://tennis-mate-ochre.vercel.app:444/my", "https://user@tennis-mate-ochre.vercel.app/my", "/login", "/login?returnTo=/my", "/api/auth/callback/kakao"] {
    precondition(!AppNavigation.allowsHistoryDestination(URL(string: path, relativeTo: server)!.absoluteURL, from: source, server: server), path)
}
let login = URL(string: "/login", relativeTo: server)!.absoluteURL
let kakao = URL(string: "https://accounts.kakao.com/login")!
precondition(AppNavigation.allowsHistoryDestination(login, from: kakao, server: server))
precondition(AppNavigation.allowsHistoryDestination(server, from: login, server: server))
print("Navigation destination checks passed")
`;
  await writeFile(`${root}/check.swift`, source + checks);
  const result = spawnSync('/usr/bin/swift', ['-module-cache-path', `${root}/cache`, `${root}/check.swift`], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /checks passed/);
});
