import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prototypeConfig, offlinePage } from './configuration.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const rawUrl = args[args.indexOf('--url') + 1];
try {
  if (!args.includes('--url')) throw new Error('사용법: npm run configure -- --url https://앱주소/login');
  const config = prototypeConfig(rawUrl, args.includes('--allow-local-http'));
  await mkdir(`${root}www`, { recursive: true });
  await writeFile(`${root}capacitor.config.json`, JSON.stringify(config, null, 2) + '\n');
  const html = offlinePage(new URL(config.server.appStartPath, config.server.url).href);
  await writeFile(`${root}www/index.html`, html);
  await writeFile(`${root}www/offline.html`, html);
  // iOS validates the bundled start path even when server.url is remote.
  // The only supported non-root start path is /login (validated above).
  if (config.server.appStartPath === '/login') await writeFile(`${root}www/login`, html);
  console.log('개발용 설정 생성 완료. npm run prepare:ios 또는 prepare:android로 반영하세요.');
  console.log('이 설정은 스토어 제출용이 아닙니다. 앱에서 수행하는 실제 거래는 연결된 서버에 반영됩니다.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
