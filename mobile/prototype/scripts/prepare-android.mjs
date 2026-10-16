import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prototypeAppName } from './configuration.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function optionalFile(path) {
  try { return await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(`${directory}/${entry.name}`, `${name}/`));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

export async function prepareAndroid(root) {
  const native = `${root}native/android/`;
  const generated = `${root}android/`;
  const stamp = `${generated}.rally-managed-files.json`;
  const previous = JSON.parse((await optionalFile(stamp))?.toString() ?? '{}');
  const archive = `${root}node_modules/@capacitor/cli/assets/android-template.tar.gz`;
  const templateFiles = new Set(execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n'));
  const plan = [];
  for (const source of await files(native)) {
    const relative = source.startsWith('res/') ? `app/src/main/${source}` : `app/src/main/java/dev/rallyon/prototype/${source}`;
    const bytes = await readFile(native + source);
    const current = await optionalFile(generated + relative);
    const templatePath = relative.replace('dev/rallyon/prototype', 'com/getcapacitor/myapp');
    let template;
    if (templateFiles.has(templatePath)) {
      template = execFileSync('tar', ['-xOf', archive, templatePath]);
      if (source.endsWith('.java')) template = Buffer.from(template.toString().replaceAll('com.getcapacitor.myapp', 'dev.rallyon.prototype'));
    }
    if (current && ![previous[relative], hash(bytes), template && hash(template)].includes(hash(current))) {
      throw new Error(`${relative}에 별도 수정이 있어 덮어쓰지 않았어요. native/android 원본과 먼저 대조해 주세요.`);
    }
    plan.push({ relative, bytes });
  }
  const namesPath = 'app/src/main/res/values/strings.xml';
  let names = await readFile(generated + namesPath, 'utf8');
  for (const key of ['app_name', 'title_activity_main']) {
    const pattern = new RegExp(`(<string name="${key}">)([^<]*)(</string>)`);
    const current = names.match(pattern)?.[2];
    if (!['App', 'Rally On 검증', prototypeAppName].includes(current)) {
      throw new Error(`Android 앱 표시 이름에 별도 수정이 있어 덮어쓰지 않았어요: ${key}`);
    }
    names = names.replace(pattern, `$1${prototypeAppName}$3`);
  }
  plan.push({ relative: namesPath, bytes: Buffer.from(names) });
  // Validate every managed target first; a local edit must not leave a partial update.
  for (const { relative, bytes } of plan) {
    await mkdir(dirname(generated + relative), { recursive: true });
    await writeFile(generated + relative, bytes);
    previous[relative] = hash(bytes);
  }
  await writeFile(stamp, JSON.stringify(previous, null, 2) + '\n');
}
