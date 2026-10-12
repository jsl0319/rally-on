import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('iOS 길찾기는 목적지 좌표·이름을 유지하고 다른 호스트·잘못된 좌표를 거절한다', { skip: process.platform !== 'darwin' }, async t => {
  const root = await mkdtemp(`${tmpdir()}/rally-map-swift-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = await readFile(new URL('../native/ios/KakaoMapLinks.swift', import.meta.url), 'utf8');
  const checks = `
let encodedName = "이지테니스 둔촌점".addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!
let valid = URL(string: "https://map.kakao.com/link/to/" + encodedName + ",37.5,127.1")!
let output = KakaoMapLinks.route(from: valid)!
let result = URLComponents(url: output, resolvingAgainstBaseURL: false)!
let query = Dictionary(uniqueKeysWithValues: result.queryItems!.map { ($0.name, $0.value!) })
precondition(result.scheme == "kakaomap" && result.host == "route")
precondition(query["ep"] == "37.5,127.1" && query["en"] == "이지테니스 둔촌점", String(describing: query))
precondition(query["by"] == "car" && query["sp"] == nil)
let special = KakaoMapLinks.route(from: URL(string: "https://map.kakao.com/link/to/A%2CB%2F%26C,37.5,127.1")!)!
precondition(URLComponents(url: special, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "en" }!.value == "A,B/&C")
for invalid in [
    "https://map.kakao.com.evil.test/link/to/A,37,127",
    "http://map.kakao.com/link/to/A,37,127",
    "https://map.kakao.com:444/link/to/A,37,127",
    "https://user@map.kakao.com/link/to/A,37,127",
    "https://map.kakao.com/link/to/A,91,127",
    "https://map.kakao.com/link/to/A,37,181",
    "https://map.kakao.com/link/to/A,nan,127",
    "https://map.kakao.com/link/to/A,37,inf",
    "https://map.kakao.com/link/to/A,,127",
    "https://map.kakao.com/link/to/,37,127",
    "https://map.kakao.com/link/to/A,37,127?ep=1,2",
    "https://map.kakao.com/link/search/A",
    "https://example.com/api/auth/callback/kakao"
] { precondition(KakaoMapLinks.route(from: URL(string: invalid)!) == nil, invalid) }
print("Kakao map destination checks passed")
`;
  await writeFile(`${root}/check.swift`, source + checks);
  const result = spawnSync('/usr/bin/swift', ['-module-cache-path', `${root}/cache`, `${root}/check.swift`], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.match(result.stdout, /checks passed/);
});
