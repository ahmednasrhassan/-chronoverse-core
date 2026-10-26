import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, open, rename, readFile, readdir, lstat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { encrypt, decrypt, envelope, unlockKey, digest, MAX_BYTES } from "./crypto.mjs";
import { canonical, requireThat } from "./safe.mjs";
import { validateConfig, authConfig, scope } from "./aws.mjs";
import { collect } from "./sync.mjs";
import { recoveryBundle, validateStats, reconcile, unique } from "./model.mjs";

const exec = promisify(execFile), repository = fileURLToPath(new URL("../../../", import.meta.url));
const script = fileURLToPath(new URL("../windows-storage.ps1", import.meta.url));
export const defaultDirectory = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Chronoverse", "NewsletterBackups");
export function validateLocation(directory) {
  requireThat(process.platform === "win32" && /^[A-Za-z]:\\/.test(directory) && !directory.includes("..") && !/[\r\n]/.test(directory), "private_windows_path_required");
  const target = path.resolve(directory).toLowerCase(), repo = path.resolve(repository).toLowerCase();
  requireThat(target !== repo && !target.startsWith(repo + path.sep) && !/(?:^|[\\/])(?:onedrive[^\\/]*|dropbox|google drive|public)(?:[\\/]|$)/i.test(target), "unsafe_backup_location");
  for (const [name, value] of Object.entries(process.env)) if (/^OneDrive/i.test(name) && value) requireThat(!target.startsWith(path.resolve(value).toLowerCase() + path.sep) && target !== path.resolve(value).toLowerCase(), "unsafe_backup_location");
}
export async function privateStorage(directory, initialize = false) {
  validateLocation(directory);
  for (let cursor = path.resolve(directory); ; cursor = path.dirname(cursor)) {
    try { await lstat(path.join(cursor, ".git")); throw new Error("unsafe_backup_location"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (path.dirname(cursor) === cursor) break;
  }
  try {
    const { stdout } = await exec(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-File", script, "-BackupRoot", directory, ...(initialize ? ["-Initialize"] : [])], { shell: false, windowsHide: true, timeout: 30000, maxBuffer: 4096 });
    requireThat(stdout.trim() === "PRIVATE_STORAGE_OK", "private_storage_required");
  } catch { throw new Error("private_storage_required"); }
}
async function boundedRead(file) {
  validateLocation(path.dirname(path.resolve(file)));
  const stat = await lstat(file); requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BYTES * 1.5, "invalid_backup_file");
  return readFile(file);
}
export async function createVault(directory, config, passphrase) {
  validateConfig(config);
  const context = await unlockKey(passphrase);
  try {
    await privateStorage(directory, true);
    const raw = encrypt({ version: 1, config, createdAt: new Date().toISOString(), vaultId: randomUUID() }, context, "vault");
    await atomicFile(directory, "vault.cvnb", raw, context, "vault");
    await mkdir(path.join(directory, "auth"));
    const file = await open(path.join(directory, "auth", "config"), "wx", 0o600);
    try { await file.writeFile(authConfig(config)); await file.sync(); } finally { await file.close(); }
  } finally { context.key.fill(0); }
}
export async function verifyFile(file, passphrase) {
  const raw = await boundedRead(file), header = envelope(raw).header, context = await unlockKey(passphrase, header.salt);
  try {
    const payload = decrypt(raw, context, header.purpose);
    requireThat(["snapshot", "recovery"].includes(header.purpose) && payload.stats?.sendable === 0 && Number.isFinite(Date.parse(payload.completedAt || payload.sourceCompletedAt)), "invalid_backup");
    const timestamp = payload.completedAt || payload.sourceCompletedAt;
    requireThat(new Date(timestamp).toISOString() === timestamp, "invalid_snapshot");
    return { purpose: header.purpose, stats: validateStats(payload.stats), lastSuccessfulRead: timestamp, authenticated: true, chainChecked: false };
  } finally { context.key.fill(0); }
}
export async function restoreLocal(sourceDirectory, targetDirectory, passphrase) {
  validateLocation(sourceDirectory);
  const names = (await readdir(sourceDirectory)).filter(n => n === "vault.cvnb" || /^snapshot-\d{8}\.cvnb$/.test(n)).sort();
  requireThat(names.includes("vault.cvnb") && names.length <= 1001, "invalid_backup");
  const sourceVault = await boundedRead(path.join(sourceDirectory, "vault.cvnb"));
  const context = await unlockKey(passphrase, envelope(sourceVault).header.salt);
  try {
    const vault = decrypt(sourceVault, context, "vault"); validateConfig(vault.config);
    await privateStorage(targetDirectory, true);
    let total = 0;
    // Copy encrypted files only. Authentication/chain verification follows;
    // failures leave an encrypted quarantine directory, never a live restore.
    for (const name of names) {
      const raw = await boundedRead(path.join(sourceDirectory, name));
      total += raw.length; requireThat(total <= 128 * 1024 * 1024, "archive_limit_reached");
      decrypt(raw, context, name === "vault.cvnb" ? "vault" : "snapshot");
      await atomicFile(targetDirectory, name, raw, context, name === "vault.cvnb" ? "vault" : "snapshot");
    }
    const restored = await openVault(targetDirectory, passphrase);
    try {
      await mkdir(path.join(targetDirectory, "auth"));
      const file = await open(path.join(targetDirectory, "auth", "config"), "wx", 0o600);
      try { await file.writeFile(authConfig(restored.config)); await file.sync(); } finally { await file.close(); }
      return { restoredLocally: true, snapshots: restored.snapshots.length, cloudWrites: 0, activationAuthorized: false };
    } finally { await restored.close(); }
  } finally { context.key.fill(0); }
}
export async function rotateLocal(sourceDirectory, targetDirectory, passphrase) {
  const old = await openVault(sourceDirectory, passphrase);
  let next;
  try {
    await old.lock(); requireThat(old.snapshots.length > 0, "no_snapshot");
    const latest = old.snapshots.at(-1), evidence = old.snapshots.flatMap(snap => snap.data.ledger.filter(row => /^(AUDIT|MIGRATION|MIGRATION-BATCH|EVENT)#/.test(row.pk?.S || "")));
    const data = { ...latest.data, ledger: unique([...latest.data.ledger, ...evidence]) };
    const preserved = reconcile(data, old.snapshots.flatMap(snap => snap.stickySuppressions));
    await createVault(targetDirectory, old.config, passphrase);
    next = await openVault(targetDirectory, passphrase); await next.lock();
    await next.seed({ ...latest, data, stats: preserved.stats, stickySuppressions: preserved.stickySuppressions, archiveDigest: old.latestDigest() });
    return { rotatedLocally: true, oldArchivePreserved: true, lastSuccessfulRead: latest.completedAt, cloudWrites: 0, activationAuthorized: false };
  } finally { await next?.close(); await old.close(); }
}
export async function atomicFile(directory, name, raw, context, purpose, signal) {
  requireThat(/^(?:vault|snapshot-\d{8}|recovery-[a-f0-9-]{36})\.cvnb$/.test(name), "invalid_backup_file");
  const target = path.join(directory, name), temporary = path.join(directory, `.partial-${randomUUID()}`);
  try { await lstat(target); throw new Error("backup_exists"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  let handle, created = false;
  try {
    requireThat(!signal?.aborted, "cancelled");
    handle = await open(temporary, "wx", 0o600); created = true; await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = undefined;
    const written = await boundedRead(temporary); requireThat(digest(written) === digest(raw), "backup_integrity_failed"); decrypt(written, context, purpose);
    // An exclusive vault lock plus a fresh filename prevents replacement.
    requireThat(!signal?.aborted, "cancelled");
    await rename(temporary, target);
  } catch (e) { await handle?.close(); if (created) { try { await unlink(temporary); } catch {} } throw e; }
}
export async function openVault(directory, passphrase) {
  await privateStorage(directory);
  const raw = await boundedRead(path.join(directory, "vault.cvnb")), context = await unlockKey(passphrase, envelope(raw).header.salt);
  try {
    const vault = decrypt(raw, context, "vault"); validateConfig(vault.config);
    requireThat(vault.version === 1 && typeof vault.vaultId === "string", "invalid_backup");
    const files = (await readdir(directory)).filter(n => /^snapshot-\d{8}\.cvnb$/.test(n)).sort();
    requireThat(files.length <= 1000, "backup_limit_reached");
    const snapshots = []; let previous = null, totalBytes = 0;
    for (let i = 0; i < files.length; i++) {
      requireThat(files[i] === `snapshot-${String(i + 1).padStart(8, "0")}.cvnb`, "backup_chain_incomplete");
      const bytes = await boundedRead(path.join(directory, files[i])), snapshot = decrypt(bytes, context, "snapshot");
      totalBytes += bytes.length; requireThat(totalBytes <= 128 * 1024 * 1024, "archive_limit_reached");
      requireThat(snapshot.sequence === i + 1 && snapshot.previousDigest === previous && snapshot.vaultId === vault.vaultId && canonical(snapshot.scope) === canonical(scope(vault.config)), "backup_chain_incomplete");
      requireThat(snapshot.format === "chronoverse-subscriber-snapshot" && snapshot.version === 1 && Number.isFinite(Date.parse(snapshot.completedAt)), "invalid_snapshot");
      validateStats(snapshot.stats); requireThat(new Date(snapshot.completedAt).toISOString() === snapshot.completedAt && new Date(snapshot.startedAt).toISOString() === snapshot.startedAt, "invalid_snapshot");
      snapshots.push(snapshot); previous = digest(bytes);
    }
    let lock;
    return { directory, config: vault.config, snapshots, authPath: path.join(directory, "auth", "config"),
      async lock() { requireThat(!lock, "vault_in_use"); try { lock = await open(path.join(directory, ".owner-lock"), "wx", 0o600); } catch { throw new Error("vault_in_use"); } },
      async sync(source, signal) {
        requireThat(lock && snapshots.length < vault.config.maxSnapshots, "backup_limit_or_lock");
        await privateStorage(directory); requireThat(!signal?.aborted, "cancelled");
        const snapshot = await collect(source, scope(vault.config), snapshots.at(-1)?.stickySuppressions || []);
        requireThat(!signal?.aborted, "cancelled");
        Object.assign(snapshot, { vaultId: vault.vaultId, sequence: snapshots.length + 1, previousDigest: previous });
        const bytes = encrypt(snapshot, context, "snapshot");
        requireThat(totalBytes + bytes.length <= 128 * 1024 * 1024, "archive_limit_reached");
        await atomicFile(directory, `snapshot-${String(snapshot.sequence).padStart(8, "0")}.cvnb`, bytes, context, "snapshot", signal);
        snapshots.push(snapshot); previous = digest(bytes); totalBytes += bytes.length; return snapshot;
      },
      async seed(prior) {
        requireThat(lock && snapshots.length === 0 && canonical(prior.scope) === canonical(scope(vault.config)), "invalid_rotation");
        const snapshot = { ...prior, vaultId: vault.vaultId, sequence: 1, previousDigest: null, ancestorDigest: prior.archiveDigest, snapshotKind: "OFFLINE_ROTATION_SEED" };
        delete snapshot.archiveDigest;
        validateStats(snapshot.stats);
        const bytes = encrypt(snapshot, context, "snapshot"); requireThat(bytes.length <= 128 * 1024 * 1024, "archive_limit_reached");
        await atomicFile(directory, "snapshot-00000001.cvnb", bytes, context, "snapshot");
        snapshots.push(snapshot); previous = digest(bytes); totalBytes = bytes.length;
      },
      latestDigest() { return previous; },
      async exportRecovery() {
        requireThat(lock, "vault_in_use");
        const bundle = recoveryBundle(snapshots, scope(vault.config));
        bundle.sourceSnapshotDigest = previous;
        await atomicFile(directory, `recovery-${randomUUID()}.cvnb`, encrypt(bundle, context, "recovery"), context, "recovery");
        return bundle.stats;
      },
      async close() {
        context.key.fill(0);
        if (lock) { await lock.close(); lock = undefined; await unlink(path.join(directory, ".owner-lock")); }
      },
    };
  } catch (e) { context.key.fill(0); throw e; }
}
