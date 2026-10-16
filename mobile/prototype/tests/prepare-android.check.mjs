import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { prepareAndroid } from '../scripts/prepare-android.mjs';

async function fixture(t) {
  const root = await mkdtemp(`${tmpdir()}/rally-android-`) + '/';
  t.after(() => rm(root, { recursive: true, force: true }));
  const assets = 'node_modules/@capacitor/cli/assets/';
  await mkdir(root + assets, { recursive: true });
  await copyFile(new URL('../' + assets + 'android-template.tar.gz', import.meta.url), root + assets + 'android-template.tar.gz');
  await mkdir(root + 'android', { recursive: true });
  execFileSync('tar', ['-xzf', root + assets + 'android-template.tar.gz', '-C', root + 'android']);
  await cp(new URL('../native/android/', import.meta.url), root + 'native/android', { recursive: true });
  const activity = 'app/src/main/java/dev/rallyon/prototype/MainActivity.java';
  await mkdir(root + 'android/app/src/main/java/dev/rallyon/prototype', { recursive: true });
  const template = await readFile(root + 'android/app/src/main/java/com/getcapacitor/myapp/MainActivity.java', 'utf8');
  await writeFile(root + 'android/' + activity, template.replaceAll('com.getcapacitor.myapp', 'dev.rallyon.prototype'));
  await writeFile(root + 'android/app/src/main/res/values/strings.xml', '<resources><string name="app_name">Rally On 검증</string><string name="title_activity_main">Rally On 검증</string><string name="custom_url_scheme">dev.rallyon.prototype</string></resources>');
  return { root, activity };
}

test('Android 재준비는 이름·B 아이콘·뒤로가기를 반복 적용하고 별도 URL scheme을 보존한다', async t => {
  const { root, activity } = await fixture(t);
  await prepareAndroid(root);
  await prepareAndroid(root);
  assert.match(await readFile(root + 'android/app/src/main/res/values/strings.xml', 'utf8'), /랠리온 검증/);
  assert.match(await readFile(root + 'android/app/src/main/res/values/strings.xml', 'utf8'), /dev.rallyon.prototype/);
  assert.deepEqual(await readFile(root + 'android/' + activity), await readFile(root + 'native/android/MainActivity.java'));
  assert.deepEqual(await readFile(root + 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'), await readFile(root + 'native/android/res/mipmap-xxxhdpi/ic_launcher.png'));
});

test('Android의 다른 개발자 수정이 있으면 전체 적용 전에 중단한다', async t => {
  const { root, activity } = await fixture(t);
  await prepareAndroid(root);
  const names = root + 'android/app/src/main/res/values/strings.xml';
  await writeFile(names, (await readFile(names, 'utf8')).replaceAll('랠리온 검증', 'Local app'));
  const original = await readFile(root + 'android/' + activity);
  await writeFile(root + 'native/android/MainActivity.java', '// new version');
  await assert.rejects(prepareAndroid(root), /표시 이름.*덮어쓰지/);
  assert.deepEqual(await readFile(root + 'android/' + activity), original);
});

test('Android 생성 아이콘의 별도 수정도 덮어쓰지 않는다', async t => {
  const { root } = await fixture(t);
  await prepareAndroid(root);
  const icon = root + 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png';
  await writeFile(icon, 'local icon');
  await assert.rejects(prepareAndroid(root), /별도 수정.*덮어쓰지/);
  assert.equal(await readFile(icon, 'utf8'), 'local icon');
});
