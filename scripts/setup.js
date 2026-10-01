import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Ejecuta este script mediante npm run setup.');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw new Error(`Falló ${path.basename(command)} ${args.join(' ')}`);
}
for (const folder of ['', 'backend', 'frontend']) {
  const file = path.join(root, folder, '.env');
  if (!existsSync(file)) {
    let content = readFileSync(`${file}.example`, 'utf8');
    if (folder === 'backend')
      content = content
        .replace('generate_on_setup', randomBytes(32).toString('hex'))
        .replace('change_this_in_real_environments', randomBytes(48).toString('hex'));
    writeFileSync(file, content, { mode: 0o600 });
    console.log(`Creado ${folder || 'raíz'}/.env`);
  }
  if (folder === 'backend') {
    let content = readFileSync(file, 'utf8');
    if (!/^INITIAL_SETUP_KEY=/m.test(content))
      content += `\nINITIAL_SETUP_KEY=${randomBytes(32).toString('hex')}\n`;
    else
      content = content.replace(
        'INITIAL_SETUP_KEY=generate_on_setup',
        `INITIAL_SETUP_KEY=${randomBytes(32).toString('hex')}`,
      );
    writeFileSync(file, content, { mode: 0o600 });
  }
}
if (process.argv.includes('--env-only')) process.exit(0);
for (const folder of ['', 'backend', 'frontend']) {
  run(
    process.execPath,
    [npmCli, existsSync(path.join(root, folder, 'package-lock.json')) ? 'ci' : 'install'],
    path.join(root, folder),
  );
}
run('docker', ['compose', 'up', '-d', '--wait']);
for (const script of ['db:generate', 'db:migrate'])
  run(process.execPath, [npmCli, 'run', script], path.join(root, 'backend'));
console.log(
  'SAGE preparado SIN datos demo. Ejecuta npm run setup:key, luego npm run dev y crea el primer administrador desde la pantalla inicial.',
);
