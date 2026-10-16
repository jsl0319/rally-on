import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
test('Android 뒤로가기는 서비스 내부 이동과 인증 취소만 허용하고 로그아웃 이력을 차단한다', {
  skip: !existsSync(`${javaHome}/bin/javac`) && 'Java 개발 도구 없음',
}, async t => {
  const root = await mkdtemp(`${tmpdir()}/rally-navigation-java-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(`${root}/AppNavigation.java`, await readFile(new URL('../native/android/AppNavigation.java', import.meta.url)));
  await writeFile(`${root}/NavigationCheck.java`, `package dev.rallyon.prototype;
public class NavigationCheck {
  static String server = "https://tennis-mate-ochre.vercel.app/";
  static void check(boolean expected, String to, String from) {
    if (AppNavigation.allowsHistoryDestination(to, from, server) != expected) throw new AssertionError(to);
  }
  public static void main(String[] args) {
    for (String path : new String[]{"", "my/notifications", "activity/sent?kind=court", "?gameType=MIXED_DOUBLES", "terms#refund"}) {
      check(true, server + path, server + "my");
    }
    for (String to : new String[]{server + "login", server + "login/", server + "api/auth/callback/kakao", server + "my/notifications/open/123",
      "https://accounts.kakao.com/login", "https://evil.test/my", "https://tennis-mate-ochre.vercel.app.evil.test/my",
      "http://tennis-mate-ochre.vercel.app/my", "https://tennis-mate-ochre.vercel.app:444/my", "https://user@tennis-mate-ochre.vercel.app/my", "bad url", "javascript:alert(1)", null}) {
      check(false, to, server + "my");
    }
    check(false, server + "my", server + "login");
    check(false, server + "my", "https://accounts.kakao.com/login");
    check(false, "https://accounts.kakao.com.evil.test/login", server + "login");
    check(true, server + "login", "https://accounts.kakao.com/login");
    check(true, server + "login", server + "terms");
    check(true, server + "login", server + "privacy");
    check(true, "https://kauth.kakao.com/oauth/authorize", "https://accounts.kakao.com/login");
    check(true, "https://tennis-mate-ochre.vercel.app:443/my", server + "activity/sent");
    System.out.println("Android navigation checks passed");
  }
}`);
  const build = spawnSync(`${javaHome}/bin/javac`, ['-d', root, `${root}/AppNavigation.java`, `${root}/NavigationCheck.java`], { encoding: 'utf8', timeout: 60000 });
  assert.equal(build.status, 0, build.stderr || String(build.error));
  const run = spawnSync(`${javaHome}/bin/java`, ['-cp', root, 'dev.rallyon.prototype.NavigationCheck'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  assert.match(run.stdout, /checks passed/);
});
