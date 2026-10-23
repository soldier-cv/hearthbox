#!/usr/bin/env node
/**
 * 用工作区根目录 `.keys/keystore.properties` 里的密钥打签名 release APK。
 *
 * 私钥不进任何仓库：keystore 放在 `hearthbox-projects/.keys/`（工作区根，不是 `hearthbox/`）。
 * CI 不读这个文件，走 GitHub Secrets 里的同名变量。
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const propsPath = resolve(root, '..', '.keys', 'keystore.properties');

if (!existsSync(propsPath)) {
  console.error(`找不到 ${propsPath}`);
  console.error('keystore 与密码放在工作区根目录的 .keys/ 下，不要放进仓库。');
  process.exit(1);
}

const props = {};
for (const line of readFileSync(propsPath, 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) props[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}

for (const key of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
  if (!props[key]) {
    console.error(`keystore.properties 缺少 ${key}`);
    process.exit(1);
  }
}

const androidDir = join(root, 'native', 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const env = {
  ...process.env,
  ANDROID_KEYSTORE_PATH: props.storeFile,
  ANDROID_KEYSTORE_PASSWORD: props.storePassword,
  ANDROID_KEY_ALIAS: props.keyAlias,
  ANDROID_KEY_PASSWORD: props.keyPassword,
};

if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  console.warn('未设置 ANDROID_HOME / ANDROID_SDK_ROOT，Gradle 可能找不到 Android SDK。');
}

const child = spawn(gradlew, ['assembleRelease'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`\n签名 APK: ${join(androidDir, 'app/build/outputs/apk/release/app-release.apk')}`);
  }
  process.exit(code ?? 1);
});
