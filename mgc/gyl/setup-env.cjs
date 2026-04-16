#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = __dirname;
const serverDir = path.join(rootDir, 'server');
const args = new Set(process.argv.slice(2));
const skipInstall = args.has('--skip-install');
const checkOnly = args.has('--check');
const useNpmInstall = args.has('--npm-install');

const rootPackage = path.join(rootDir, 'package.json');
const serverPackage = path.join(serverDir, 'package.json');
const rootLock = path.join(rootDir, 'package-lock.json');
const serverLock = path.join(serverDir, 'package-lock.json');
const rootEnvLocal = path.join(rootDir, '.env.local');
const serverEnv = path.join(serverDir, '.env');
const serverLocalData = path.join(serverDir, 'local-data');

const rootEnvLocalTemplate = `VITE_API_BASE=http://localhost:3000/api
`;

const serverEnvTemplate = `# Local API
PORT=3000
JWT_SECRET=local-file-jwt-secret
JWT_EXPIRES_IN=12h
SUPER_ADMIN_LOGIN_IDS=jiaohaoyuan
SUPER_ADMIN_ROLE_IDS=1
SUPER_ADMIN_ROLE_NAMES=超级管理员

# Optional integrations. The current local development server can run with local JSON storage.
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=cdop_sys
REDIS_URL=redis://localhost:6379

# Optional SMS provider app code. Leave empty for local development.
SMS_APP_CODE=
`;

const npmCommand = 'npm';
const useShell = process.platform === 'win32';

const print = (message = '') => console.log(message);
const step = (message) => print(`\n[setup] ${message}`);
const ok = (message) => print(`[ok] ${message}`);
const warn = (message) => print(`[warn] ${message}`);

const fail = (message) => {
  console.error(`\n[error] ${message}`);
  process.exit(1);
};

const parseVersion = (value) => {
  const match = String(value || '').replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
};

const atLeast = (version, major, minor, patch) => {
  if (version.major !== major) return version.major > major;
  if (version.minor !== minor) return version.minor > minor;
  return version.patch >= patch;
};

const isSupportedNode = (version) => {
  if (!version) return false;
  if (version.major === 20) return atLeast(version, 20, 19, 0);
  if (version.major > 22) return true;
  if (version.major === 22) return atLeast(version, 22, 12, 0);
  return false;
};

const assertFileExists = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    fail(`${label} 不存在：${path.relative(rootDir, filePath)}`);
  }
};

const ensureDir = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    ok(`目录已存在：${path.relative(rootDir, dirPath)}`);
    return;
  }
  if (checkOnly) {
    warn(`目录缺失：${path.relative(rootDir, dirPath)}`);
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
  ok(`已创建目录：${path.relative(rootDir, dirPath)}`);
};

const ensureFile = (filePath, content, label) => {
  if (fs.existsSync(filePath)) {
    ok(`${label} 已存在，保留现有配置：${path.relative(rootDir, filePath)}`);
    return;
  }
  if (checkOnly) {
    warn(`${label} 缺失：${path.relative(rootDir, filePath)}`);
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  ok(`已创建 ${label}：${path.relative(rootDir, filePath)}`);
};

const run = (cwd, command, commandArgs) => {
  const relative = path.relative(rootDir, cwd) || '.';
  print(`\n$ ${command} ${commandArgs.join(' ')}   # ${relative}`);
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: useShell
  });
  if (result.error) {
    fail(`执行失败：${command} ${commandArgs.join(' ')}，原因：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`命令退出码 ${result.status}：${command} ${commandArgs.join(' ')}`);
  }
};

const installDependencies = (cwd, lockFile, label) => {
  if (skipInstall || checkOnly) {
    warn(`${label} 依赖安装已跳过`);
    return;
  }
  const installArgs = fs.existsSync(lockFile) && !useNpmInstall ? ['ci'] : ['install'];
  run(cwd, npmCommand, installArgs);
  ok(`${label} 依赖安装完成`);
};

const checkNpm = () => {
  const result = spawnSync(npmCommand, ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: useShell
  });
  if (result.error || result.status !== 0) {
    fail('未检测到 npm，请先安装 Node.js LTS，并确认 npm 可用');
  }
  ok(`npm ${String(result.stdout || '').trim()} 可用`);
};

const main = () => {
  print('SCMP 一键环境配置');
  print('用法：node setup-env.cjs [--skip-install] [--check] [--npm-install]');

  step('检查项目结构');
  assertFileExists(rootPackage, '前端 package.json');
  assertFileExists(serverPackage, '后端 package.json');
  ok('项目结构检查通过');

  step('检查 Node.js / npm');
  const nodeVersion = parseVersion(process.version);
  if (!isSupportedNode(nodeVersion)) {
    fail(`当前 Node.js ${process.version} 不满足 package.json engines：^20.19.0 || >=22.12.0`);
  }
  ok(`Node.js ${process.version} 满足版本要求`);
  checkNpm();

  step('准备本地配置文件');
  ensureFile(rootEnvLocal, rootEnvLocalTemplate, '前端本地环境变量');
  ensureFile(serverEnv, serverEnvTemplate, '后端环境变量');
  ensureDir(serverLocalData);

  step('安装依赖');
  installDependencies(rootDir, rootLock, '前端');
  installDependencies(serverDir, serverLock, '后端');

  step('完成');
  print('环境已准备好。常用启动命令：');
  print('1. 后端：cd server && npm start');
  print('2. 前端：npm run dev');
  print('3. 只检查环境不安装：node setup-env.cjs --check');
  print('4. 跳过安装依赖：node setup-env.cjs --skip-install');
};

main();
