import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('생성된 시작 경로가 iOS의 로컬 파일 존재 검사도 통과한다', async t => {
  const root = await mkdtemp(`${tmpdir()}/rally-configure-`);
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(`${root}/scripts`);
  for (const name of ['configure.mjs', 'configuration.mjs', 'prepare.mjs', 'prepare-ios.mjs', 'prepare-android.mjs']) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), `${root}/scripts/${name}`);
  }
  for (const path of ['/', '/login']) {
    const result = spawnSync(process.execPath, [`${root}/scripts/configure.mjs`, '--url', `https://example.com${path}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await readFile(`${root}/capacitor.config.json`, 'utf8'));
    const bundledStart = `${root}/www${config.server.appStartPath}`;
    assert.ok(await stat(bundledStart));
    const html = await readFile(path === '/' ? `${bundledStart}index.html` : bundledStart, 'utf8');
    assert.ok(html.includes(`href="https://example.com${path}"`));
  }
  await rm(`${root}/www/login`);
  const missingStart = spawnSync(process.execPath, [`${root}/scripts/prepare.mjs`, 'ios'], { encoding: 'utf8' });
  assert.equal(missingStart.status, 1);
  assert.match(missingStart.stderr, /시작 경로에 필요한 로컬 파일/);
});
