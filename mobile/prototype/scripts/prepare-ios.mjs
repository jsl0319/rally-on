import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const templateHash = '738b9b96bb71d34d80cd8c1183cf7f8f6f2e789c64e46fb5fe6777a35ae12dfd';
const hash = value => createHash('sha256').update(value).digest('hex');

export async function prepareIOS(root) {
  const target = `${root}ios/App/App/SceneDelegate.swift`;
  const stamp = `${root}ios/.rally-scene-sha256`;
  const current = await readFile(target, 'utf8');
  const sceneSource = await readFile(`${root}native/ios/SceneDelegate.swift`, 'utf8');
  const mapSource = await readFile(`${root}native/ios/KakaoMapLinks.swift`, 'utf8');
  // Keep one generated compilation unit; no manual Xcode project edits are required.
  const source = sceneSource + '\n' + mapSource;
  let previous = '';
  try { previous = (await readFile(stamp, 'utf8')).trim(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (![templateHash, previous, hash(source)].includes(hash(current))) {
    throw new Error('SceneDelegate에 별도 수정이 있어 덮어쓰지 않았어요. native/ios 소스와 먼저 대조해 주세요.');
  }
  await writeFile(target, source);
  await writeFile(stamp, hash(source) + '\n');

  const launchTarget = `${root}ios/App/App/Base.lproj/LaunchScreen.storyboard`;
  const launchStamp = `${root}ios/.rally-launch-sha256`;
  const launchSource = await readFile(`${root}native/ios/LaunchScreen.storyboard`, 'utf8');
  const launchCurrent = await readFile(launchTarget, 'utf8');
  let launchPrevious = '';
  try { launchPrevious = (await readFile(launchStamp, 'utf8')).trim(); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const launchTemplateHash = '87a42e842164d75f39cca56a2cf743652f4d8e858f2eba12ae21a8ddcd9a21c6';
  if (![launchTemplateHash, launchPrevious, hash(launchSource)].includes(hash(launchCurrent))) {
    throw new Error('LaunchScreen에 별도 수정이 있어 덮어쓰지 않았어요. native/ios 소스와 먼저 대조해 주세요.');
  }
  await writeFile(launchTarget, launchSource);
  await writeFile(launchStamp, hash(launchSource) + '\n');

  const imageTarget = `${root}ios/App/App/Assets.xcassets/RallyWordmark.imageset`;
  await mkdir(imageTarget, { recursive: true });
  for (const file of ['RallyWordmark.pdf', 'Contents.json']) {
    const source = await readFile(`${root}native/ios/RallyWordmark.imageset/${file}`);
    const stamp = `${root}ios/.rally-wordmark-${file}-sha256`;
    let current, previous = '';
    try { current = await readFile(`${imageTarget}/${file}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { previous = (await readFile(stamp, 'utf8')).trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current && ![previous, hash(source)].includes(hash(current))) throw new Error('RallyWordmark에 별도 수정이 있어 덮어쓰지 않았어요.');
    await writeFile(`${imageTarget}/${file}`, source);
    await writeFile(stamp, hash(source) + '\n');
  }
}
