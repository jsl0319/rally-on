import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prototypeConfig } from './configuration.mjs';
import { prepareIOS } from './prepare-ios.mjs';
import { prepareAndroid } from './prepare-android.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const platform = process.argv[2];
try {
  if (!['ios', 'android'].includes(platform)) throw new Error('ios 또는 android를 선택하세요.');
  const config = JSON.parse(await readFile(`${root}capacitor.config.json`, 'utf8'));
  const startUrl = new URL(config.server?.appStartPath ?? '/', config.server?.url).href;
  const expected = prototypeConfig(startUrl, config.server?.cleartext === true);
  if (JSON.stringify(config) !== JSON.stringify(expected)) throw new Error('설정을 다시 생성해 주세요. 임의 인증/도메인 확장은 허용하지 않아요.');
  try {
    await access(`${root}www${config.server.appStartPath}`);
  } catch {
    throw new Error('iOS 시작 경로에 필요한 로컬 파일이 없어요. configure를 다시 실행해 주세요.');
  }
  let exists = true;
  try { await access(`${root}${platform}`); } catch { exists = false; }
  for (const args of exists ? [['sync', platform]] : [['add', platform], ['sync', platform]]) {
    const result = spawnSync(process.execPath, [`${root}node_modules/@capacitor/cli/bin/capacitor`, ...args], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('플랫폼 준비가 끝나지 않았어요. 위 개발 도구/의존성 오류를 확인해 주세요.');
  }
  if (platform === 'ios') await prepareIOS(root);
  if (platform === 'android') await prepareAndroid(root);
  console.log('플랫폼 프로젝트 준비 완료. 네이티브 빌드/실기기 로그인 성공을 뜻하지 않습니다.');
} catch (error) {
  console.error(error.code === 'ENOENT' ? '먼저 npm install과 npm run configure를 실행해 주세요.' : error.message);
  process.exitCode = 1;
}
