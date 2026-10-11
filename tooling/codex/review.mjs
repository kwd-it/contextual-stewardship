#!/usr/bin/env node
// Runs one bounded, read-only Codex review and never waits indefinitely.
// - The prompt is read from a file (or stdin with "-") and stdin is then closed, because
//   `codex exec` otherwise waits for EOF on a non-TTY stdin and hangs.
// - A stall (no Codex event for --idle seconds) or the overall --timeout kills the whole
//   Codex process tree.
// - An OS-held per-workspace lock refuses a second concurrent review; Codex processes left by a
//   dead run are killed before the next review starts.
// - Failures are classified so the caller knows whether one retry is justified.
//
// Usage: node review.mjs [--timeout <s>] [--idle <s>] [--effort low|medium|high] [--cd <dir>] <prompt-file|->
// Exit:  0 review completed (final message on stdout)
//        1 Codex failed; retry once only if the error looks transient
//        2 usage error, or another review is already running for this workspace
//        3 stalled or timed out; one retry is allowed if justified
//        4 authentication, usage-limit or quota failure; do not retry
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const usage = "Usage: node review.mjs [--timeout <s>] [--idle <s>] [--effort low|medium|high] [--cd <dir>] <prompt-file|->";
const opts = { timeout: 300, idle: 120, effort: "medium", cd: process.cwd(), prompt: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (["--timeout", "--idle", "--effort", "--cd"].includes(a) && i + 1 < argv.length) opts[a.slice(2)] = argv[++i];
  else if (opts.prompt === null && (a === "-" || !a.startsWith("--"))) opts.prompt = a;
  else fail(2, `Unknown argument: ${a}\n${usage}`);
}
opts.timeout = Number(opts.timeout);
opts.idle = Math.min(Number(opts.idle), opts.timeout);
if (opts.prompt === null) fail(2, usage);
if (!(opts.timeout >= 30 && opts.timeout <= 900)) fail(2, "--timeout must be 30-900 seconds.");
if (!(opts.idle >= 30)) fail(2, "--idle must be at least 30 seconds.");
if (!["low", "medium", "high"].includes(opts.effort)) fail(2, "--effort must be low, medium or high.");

const prompt = opts.prompt === "-" ? fs.readFileSync(0, "utf8") : readPromptFile(opts.prompt);
if (!prompt.trim()) fail(2, "The review prompt is empty.");

const win = process.platform === "win32";
const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: opts.cd, encoding: "utf8", windowsHide: true });
const inGit = gitRoot.status === 0;
const dir = path.resolve(inGit ? gitRoot.stdout.trim() : opts.cd);
const key = win ? dir.toLowerCase() : dir;
const work = path.join(os.tmpdir(), `codex-review-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`);
fs.mkdirSync(work, { recursive: true });
const lockInfo = path.join(work, "running.json");
const files = { events: path.join(work, "events.jsonl"), stderr: path.join(work, "stderr.log"), last: path.join(work, "last-message.md") };

await acquireLock();
for (const f of Object.values(files)) fs.rmSync(f, { force: true });

const args = ["exec", "-s", "read-only", "--ephemeral", "--json", "--color", "never",
  "-c", `model_reasoning_effort=${opts.effort}`, ...(inGit ? [] : ["--skip-git-repo-check"]), "-o", files.last, "-"];
// Windows needs a shell to run npm's codex.cmd shim; only the output path can need quoting.
const child = spawn("codex", win ? args.map((a) => (a === files.last ? `"${a}"` : a)) : args, {
  cwd: dir, shell: win, detached: !win, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
});
child.stdin.on("error", () => {});
child.stdin.end(prompt);

const started = Date.now();
let lastEvent = started, lastBeat = started, events = 0, lastLabel = "starting";
let codexErrors = "", stderrText = "", stopReason = null, buffered = "";
const eventLog = fs.createWriteStream(files.events);
const stderrLog = fs.createWriteStream(files.stderr);

child.stdout.on("data", (chunk) => {
  eventLog.write(chunk);
  buffered += chunk;
  const lines = buffered.split("\n");
  buffered = lines.pop();
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    lastEvent = Date.now();
    events++;
    lastLabel = describe(e);
    if (e.type === "error") codexErrors += `${e.message}\n`;
    if (e.type === "turn.failed") codexErrors += `${e.error?.message ?? "turn failed"}\n`;
  }
});
child.stderr.on("data", (chunk) => {
  stderrLog.write(chunk);
  stderrText = (stderrText + chunk).slice(-20000);
});

const watchdog = setInterval(() => {
  const now = Date.now();
  if (now - lastBeat >= 60000) {
    lastBeat = now;
    process.stderr.write(`codex-review: ${Math.round((now - started) / 1000)}s elapsed, ${events} events, last: ${lastLabel}\n`);
  }
  if (now - lastEvent > opts.idle * 1000) stop(`stalled: no Codex event for ${opts.idle}s (last: ${lastLabel})`);
  else if (now - started > opts.timeout * 1000) stop(`timed out after ${opts.timeout}s (last: ${lastLabel})`);
}, 5000);

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => stop(`interrupted by ${sig}`));

child.on("error", (err) => { codexErrors += `${err.message}\n`; });
child.on("close", (code) => {
  clearInterval(watchdog);
  eventLog.end();
  stderrLog.end();
  const secs = Math.round((Date.now() - started) / 1000);
  if (stopReason) finish(3, `${stopReason}. Codex process tree killed after ${secs}s.`);
  const last = fs.existsSync(files.last) ? fs.readFileSync(files.last, "utf8").trim() : "";
  if (code === 0 && last) {
    process.stdout.write(`${last}\n`);
    finish(0, `completed in ${secs}s.`);
  }
  // Classify on Codex's own error events; stderr can carry unrelated plugin or MCP warnings.
  const errors = codexErrors.trim() ? codexErrors : stderrText;
  const detail = errors.trim().split("\n").filter(Boolean).slice(-8).join("\n");
  if (/unauthori[sz]ed|\b401\b|\b403\b|not logged in|log ?in again|authenticat|usage limit|rate limit|\b429\b|quota|insufficient|billing|credits/i.test(errors)) {
    finish(4, `authentication, usage-limit or quota failure; do not retry.\n${detail}`);
  }
  finish(1, `Codex exited with code ${code} after ${secs}s.\n${detail}`);
});

function stop(reason) {
  if (stopReason) return;
  stopReason = reason;
  killTree(child.pid);
  // If the tree survives the kill, exit anyway; the next run kills it before starting.
  setTimeout(() => finish(3, `${reason}. Codex did not exit after the kill; the next run will kill it first.`), 15000);
}

function killTree(pid) {
  if (!pid) return;
  if (win) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} } }
}

// The lock is a listening named pipe (Windows) or abstract socket (Linux): the OS refuses a
// second listener and releases it when this process dies, so it can never go stale.
async function acquireLock() {
  const name = path.basename(work);
  const address = win ? `\\\\.\\pipe\\${name}` : process.platform === "linux" ? `\0${name}` : path.join(work, "lock.sock");
  const server = net.createServer();
  await new Promise((resolve) => {
    server.once("error", (e) => {
      if (e.code !== "EADDRINUSE") fail(2, `Could not take the review lock ${address}: ${e.message}`);
      let held = {};
      try { held = JSON.parse(fs.readFileSync(lockInfo, "utf8")); } catch {}
      fail(2, `Another Codex review is already running for ${dir} (pid ${held.pid ?? "unknown"}, started ${held.started ?? "unknown"}). ` +
        `Wait for it to finish; do not start another. Progress: ${files.events}`);
    });
    server.listen(address, resolve);
  });
  server.unref();
  // Holding the lock, any Codex process still using this workspace's output path was left by a
  // dead run: kill it, and refuse to start if that cannot be confirmed.
  let left = orphans();
  for (let i = 0; i < 6 && left.length; i++) {
    for (const pid of left) killTree(pid);
    await new Promise((r) => setTimeout(r, 500));
    left = orphans();
  }
  if (left.length) fail(2, `A Codex process from an earlier review of ${dir} survived termination (pid ${left.join(", ")}). Stop it, then retry.`);
  fs.writeFileSync(lockInfo, JSON.stringify({ pid: process.pid, dir, started: new Date().toISOString() }));
}

// Codex processes started for this workspace, identified by the `exec ... -o <output path>`
// arguments this runner passes rather than by a PID that may have been reused.
function orphans() {
  const out = files.last.toLowerCase();
  const ours = (cmd) => {
    const c = cmd.toLowerCase();
    return / exec /.test(c) && (c.includes(`-o ${out}`) || c.includes(`-o "${out}"`));
  };
  const r = win
    ? spawnSync("powershell", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"],
      { encoding: "utf8", windowsHide: true })
    : spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  if (r.error || r.status !== 0 || !r.stdout.trim()) {
    fail(2, `Could not list processes to check for a stalled earlier review of ${dir}: ${r.error?.message ?? r.stderr ?? "no output"}`);
  }
  return r.stdout.split(/\r?\n/).filter(ours).map((l) => Number(l.trim().split(/\s+/)[0]));
}

function describe(e) {
  const item = e.item ?? {};
  if (item.type === "command_execution") return `${e.type} command: ${String(item.command ?? "").slice(0, 100)}`;
  if (item.type) return `${e.type} ${item.type}`;
  return e.type ?? "event";
}

function readPromptFile(file) {
  try { return fs.readFileSync(file, "utf8"); } catch (e) { fail(2, `Cannot read prompt file ${file}: ${e.message}`); }
}

function finish(code, message) {
  process.stderr.write(`codex-review: ${message}\n`);
  if (code !== 0) process.stderr.write(`codex-review: events and stderr in ${work}\n`);
  process.exit(code);
}

function fail(code, message) {
  process.stderr.write(`codex-review: ${message}\n`);
  process.exit(code);
}
