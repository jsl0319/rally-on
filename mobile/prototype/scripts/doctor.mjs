import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const xcode = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' });
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${homedir()}/Library/Android/sdk`;
const checks = [
  ['Node.js 22 이상', Number(process.versions.node.split('.')[0]) >= 22],
  ['Xcode 앱 선택', xcode.status === 0 && /Xcode[^/]*\.app\/Contents\/Developer/.test(xcode.stdout.trim())],
  ['Android Studio', existsSync('/Applications/Android Studio.app') || existsSync(`${homedir()}/Applications/Android Studio.app`)],
  ['Android SDK 36 및 platform-tools', existsSync(`${sdk}/platform-tools/adb`) && existsSync(`${sdk}/platforms/android-36/android.jar`)],
];
for (const [label, ok] of checks) console.log(`${ok ? '확인' : '미준비'} · ${label}`);
console.log('이 검사는 설치 유무 확인입니다. 버전·라이선스·서명·연결 기기는 IDE에서 추가 확인하세요.');
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
