import { spawn } from 'node:child_process';

const env = { ...process.env, PORT: '3210', PUBLIC_ORIGIN: 'http://localhost:5173' };
const processes = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];

function stop(code) {
  for (const process of processes) process.kill();
  globalThis.process.exitCode = code;
}

for (const child of processes) child.on('exit', code => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
