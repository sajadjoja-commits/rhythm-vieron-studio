#!/usr/bin/env node

const { spawnSync } = require('child_process');

function run(command, args) {
  console.log(`\n[Vieron] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run('node', ['scripts/verify-web-assets.cjs']);

console.log('\n[Vieron] Web build, Capacitor sync, and embedded-asset verification completed successfully.');
