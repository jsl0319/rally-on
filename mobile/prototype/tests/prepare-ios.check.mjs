import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { prepareIOS } from '../scripts/prepare-ios.mjs';

async function fixture(t) {
  const root = await mkdtemp(`${tmpdir()}/rally-ios-`) + '/';
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(`${root}ios/App/App/Base.lproj`, { recursive: true });
  await mkdir(`${root}native/ios`, { recursive: true });
  await mkdir(`${root}native/ios/RallyWordmark.imageset`, { recursive: true });
  for (const file of ['RallyWordmark.pdf', 'Contents.json']) {
    await writeFile(`${root}native/ios/RallyWordmark.imageset/${file}`, await readFile(new URL('../native/ios/RallyWordmark.imageset/' + file, import.meta.url)));
  }
  const source = await readFile(new URL('../native/ios/SceneDelegate.swift', import.meta.url), 'utf8');
  const mapSource = await readFile(new URL('../native/ios/KakaoMapLinks.swift', import.meta.url), 'utf8');
  await writeFile(`${root}native/ios/KakaoMapLinks.swift`, mapSource);
  await writeFile(`${root}native/ios/SceneDelegate.swift`, source);
  await writeFile(`${root}ios/App/App/SceneDelegate.swift`, source + '\n' + mapSource);
  const launch = await readFile(new URL('../native/ios/LaunchScreen.storyboard', import.meta.url), 'utf8');
  await writeFile(`${root}native/ios/LaunchScreen.storyboard`, launch);
  await writeFile(`${root}ios/App/App/Base.lproj/LaunchScreen.storyboard`, launch);
  return { root, source, mapSource, target: `${root}ios/App/App/SceneDelegate.swift` };
}

test('플랫폼 재준비는 반복 가능하고 추적 소스 갱신을 반영한다', async t => {
  const { root, source, mapSource, target } = await fixture(t);
  await prepareIOS(root);
  await prepareIOS(root);
  await writeFile(`${root}native/ios/SceneDelegate.swift`, source + '\n// updated\n');
  await prepareIOS(root);
  assert.equal(await readFile(target, 'utf8'), source + '\n// updated\n\n' + mapSource);
});

test('시작 화면도 별도 수정을 보존한다', async t => {
  const { root } = await fixture(t);
  await prepareIOS(root);
  const target = `${root}ios/App/App/Base.lproj/LaunchScreen.storyboard`;
  const edited = (await readFile(target, 'utf8')) + '\n<!-- local edit -->\n';
  await writeFile(target, edited);
  await assert.rejects(prepareIOS(root), /LaunchScreen.*덮어쓰지/);
  assert.equal(await readFile(target, 'utf8'), edited);
});

test('생성 프로젝트에서 다른 사람이 고친 SceneDelegate는 덮어쓰지 않는다', async t => {
  const { root, source, target } = await fixture(t);
  await prepareIOS(root);
  const edited = source + '\n// local change\n';
  await writeFile(target, edited);
  await assert.rejects(prepareIOS(root), /덮어쓰지/);
  assert.equal(await readFile(target, 'utf8'), edited);
});
