import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, open, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';

// Fresh project each time. Never reads project .env files or remote project refs.
const dockerHost = process.env.DOCKER_HOST;
if (!dockerHost?.startsWith('unix://')) throw new Error('Set DOCKER_HOST to the dedicated local container runtime Unix socket.');
const env = { PATH: process.env.PATH, DOCKER_HOST: dockerHost, SUPABASE_TELEMETRY_DISABLED: '1' };
const work = await mkdtemp('/tmp/bar-tools-supabase-');
let started = false;
let passed = false;
async function command(name, args, logName, timeout = 180000) {
  const log = await open(join(work, logName), 'w', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(name, args, { env, stdio: ['ignore', log.fd, log.fd] });
      const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
      child.on('error', () => { clearTimeout(timer); reject(new Error(`${name} could not start; private log retained.`)); });
      child.on('close', code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`${name} failed; private ${logName} retained (output withheld).`));
      });
    });
  } finally { await log.close(); }
}
function configureSection(text, section, changes) {
  const escaped = section.replaceAll('.', '\\.');
  const pattern = new RegExp(`(\\[${escaped}\\]\\n)([\\s\\S]*?)(?=\\n\\[|$)`);
  if (!pattern.test(text)) throw new Error(`CLI config section missing: ${section}`);
  return text.replace(pattern, (_, header, body) => {
    for (const [key, value] of Object.entries(changes)) {
      const setting = new RegExp(`^${key} = .*`, 'm');
      if (!setting.test(body)) throw new Error(`CLI config setting missing: ${section}.${key}`);
      body = body.replace(setting, `${key} = ${value}`);
    }
    return header + body;
  });
}
try {
  await command('supabase', ['init', '--workdir', work, '--yes'], 'init.log');
  const configFile = join(work, 'supabase/config.toml');
  let config = await readFile(configFile, 'utf8');
  config = config.replace(/^project_id = .*$/m, `project_id = "${basename(work).toLowerCase()}"`);
  config = configureSection(config, 'api', { port: 56321 });
  config = configureSection(config, 'db', { port: 56322, shadow_port: 56320 });
  config = configureSection(config, 'db.seed', { enabled: false });
  config = configureSection(config, 'studio', { port: 56323 });
  config = configureSection(config, 'local_smtp', { port: 56324 });
  config = configureSection(config, 'analytics', { port: 56327 });
  config = configureSection(config, 'edge_runtime', { inspector_port: 8183 });
  config = configureSection(config, 'auth', { enable_signup: false, enable_anonymous_sign_ins: false });
  // CLI maps email.enable_signup to the EMAIL provider flag. Global signup
  // stays disabled, while existing/invited users can sign in by email.
  config = configureSection(config, 'auth.email', { enable_signup: true, enable_confirmations: true });
  await writeFile(configFile, config, { mode: 0o600 });
  console.log(`Starting the full disposable Supabase stack (${basename(work)}). CLI output is private.`);
  started = true; // also clean up a partially successful start
  await command('supabase', ['start', '--workdir', work], 'start.log', 900000);
  console.log('Services healthy; executing Auth/JWT/PostgREST integration tests.');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/test-supabase-stack.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...env, BARTOOLS_STACK_WORKDIR: work }, stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', () => reject(new Error('Test process failed to start.')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Full-stack integration assertions failed.')));
  });
  passed = true;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  let cleaned = !started;
  if (started) {
    try {
      await command('supabase', ['stop', '--workdir', work, '--no-backup'], 'stop.log');
      cleaned = true;
      console.log('Disposable stack stopped; its containers and data volumes removed.');
    } catch {
      console.error(`Cleanup failed; inspect only the dedicated project at ${work}.`);
      process.exitCode = 1;
    }
  }
  if (cleaned && passed) await rm(work, { recursive: true, force: true });
  else console.log(`Private local diagnostics retained at ${work}; do not publish their contents.`);
}
