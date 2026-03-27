import { sync } from "./index.ts";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

function formatTimestamp(date: Date): string {
  return date.toISOString();
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function wait(durationMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function parseIntervalMinutes(arg: string | undefined): number {
  if (arg === undefined) {
    return DEFAULT_INTERVAL_MS;
  }

  const value = Number(arg);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Interval must be a positive integer in minutes");
  }

  return value * 60 * 1000;
}

async function runOnce(): Promise<void> {
  const startedAt = new Date();
  writeStdout(`[${formatTimestamp(startedAt)}] sync started`);

  try {
    await sync(false);
    const finishedAt = new Date();
    writeStdout(`[${formatTimestamp(finishedAt)}] sync succeeded`);
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(`[${formatTimestamp(finishedAt)}] sync failed: ${message}`);
  }
}

async function scheduleNextRun(intervalMs: number, isRunning: () => boolean): Promise<void> {
  if (!isRunning()) {
    writeStdout(`[${formatTimestamp(new Date())}] sync loop stopped`);
    return;
  }

  const nextRunAt = new Date(Date.now() + intervalMs);
  writeStdout(`[${formatTimestamp(new Date())}] next run at ${formatTimestamp(nextRunAt)}`);
  await wait(intervalMs);
  await runLoop(intervalMs, isRunning);
}

async function runLoop(intervalMs: number, isRunning: () => boolean): Promise<void> {
  if (!isRunning()) {
    writeStdout(`[${formatTimestamp(new Date())}] sync loop stopped`);
    return;
  }

  await runOnce();
  await scheduleNextRun(intervalMs, isRunning);
}

export async function runSyncLoop(intervalMs = DEFAULT_INTERVAL_MS): Promise<void> {
  let running = true;

  function stop(signal: NodeJS.Signals): void {
    if (!running) {
      return;
    }

    running = false;
    writeStdout(
      `[${formatTimestamp(new Date())}] received ${signal}, stopping after current cycle`,
    );
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  writeStdout(`[${formatTimestamp(new Date())}] sync loop started`);

  await runLoop(intervalMs, () => {
    return running;
  });
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const intervalMs = parseIntervalMinutes(process.argv[2]);
  await runSyncLoop(intervalMs);
}
