import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const lockDir = resolve('.cache/paraglide-generation.lock');
const ownerFile = resolve(lockDir, 'owner.json');
const timeoutMs = 120_000;
const staleMs = 10 * 60_000;
const startedAt = Date.now();

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function clearStaleLock() {
	try {
		const lockStat = await stat(lockDir);
		if (Date.now() - lockStat.mtimeMs <= staleMs) return false;
		await rm(lockDir, { recursive: true, force: true });
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

async function acquireLock() {
	await mkdir(dirname(lockDir), { recursive: true });

	while (Date.now() - startedAt < timeoutMs) {
		try {
			await mkdir(lockDir);
			await writeFile(
				ownerFile,
				JSON.stringify({ pid: process.pid, command: process.argv.slice(2), acquiredAt: new Date().toISOString() })
			);
			return;
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			if (await clearStaleLock()) continue;
			await delay(100);
		}
	}

	let owner = 'unknown';
	try {
		owner = await readFile(ownerFile, 'utf8');
	} catch {
		// The owner may have released the lock between the timeout and this read.
	}
	throw new Error(`Timed out waiting for the Paraglide generation lock. Current owner: ${owner}`);
}

async function releaseLock() {
	await rm(lockDir, { recursive: true, force: true });
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
	console.error('Usage: node scripts/with-i18n-lock.mjs <command> [...args]');
	process.exit(2);
}

await acquireLock();

let released = false;
const cleanup = async () => {
	if (released) return;
	released = true;
	await releaseLock();
};

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, async () => {
		await cleanup();
		process.kill(process.pid, signal);
	});
}

try {
	const exitCode = await new Promise((resolveExit, reject) => {
		const child = spawn(command, args, { stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) {
				process.kill(process.pid, signal);
				return;
			}
			resolveExit(code ?? 1);
		});
	});
	process.exitCode = exitCode;
} finally {
	await cleanup();
}
