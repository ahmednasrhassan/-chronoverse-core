import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createVault, openVault, restoreLocal, rotateLocal, verifyFile, validateLocation, privateStorage } from "../src/storage.mjs";
import { config, source, passphrase, address } from "./fixtures.mjs";

test("private storage rejects the repository, network paths and cloud-sync locations", () => {
  assert.throws(() => validateLocation(process.cwd()), /unsafe_backup/);
  for (const directory of ["\\\\server\\share", "C:\\Users\\Synthetic\\OneDrive\\backup", "C:\\Users\\Public\\backup"]) assert.throws(() => validateLocation(directory));
});
test("real Windows NTFS encrypted vault, failed sync preservation, locks, restore, chain and tamper checks with synthetic data only", async t => {
  assert.equal(process.platform, "win32");
  const parent = await mkdtemp(path.join(os.tmpdir(), "chronoverse-backup-synthetic-")), directory = path.join(parent, "vault");
  try {
    await createVault(directory, config, passphrase);
    let vault = await openVault(directory, passphrase); await vault.lock();
    await t.test("successful read is encrypted before commit and reports counts", async () => {
      const result = await vault.sync(source()); assert.equal(result.stats.identities, 1);
      const bytes = await readFile(path.join(directory, "snapshot-00000001.cvnb")); assert.equal(bytes.includes(address), false);
    });
    await t.test("AWS errors never replace the last successful snapshot or time", async () => {
      const prior = vault.snapshots.at(-1).completedAt, before = await readdir(directory);
      await assert.rejects(vault.sync({ ...source(), async contacts() { throw new Error("synthetic-outage"); } }));
      assert.equal(vault.snapshots.at(-1).completedAt, prior); assert.deepEqual(await readdir(directory), before);
    });
    await t.test("cancellation after reads and configured retention cap cannot commit a snapshot", async () => {
      const controller = new AbortController(), current = vault.snapshots.length;
      await assert.rejects(vault.sync({ ...source(), async suppression() { controller.abort(); return null; } }, controller.signal), /cancelled/);
      assert.equal(vault.snapshots.length, current);
      const maximum = vault.config.maxSnapshots; vault.config.maxSnapshots = current;
      try { await assert.rejects(vault.sync(source()), /limit/); assert.equal(vault.snapshots.length, current); } finally { vault.config.maxSnapshots = maximum; }
    });
    await t.test("a target collision fails without overwrite or advancing the successful snapshot", async () => {
      const file = path.join(directory, "snapshot-00000002.cvnb"), sentinel = Buffer.from("synthetic-collision-evidence");
      await writeFile(file, sentinel);
      try { await assert.rejects(vault.sync(source()), /backup_exists/); assert.deepEqual(await readFile(file), sentinel); assert.equal(vault.snapshots.length, 1); }
      finally { await rm(file); }
    });
    await t.test("another process cannot acquire the owner lock", async () => {
      const other = await openVault(directory, passphrase);
      try { await assert.rejects(other.lock(), /vault_in_use/); } finally { await other.close(); }
    });
    await t.test("recovery review stays encrypted and can be authenticated independently", async () => {
      assert.equal((await vault.exportRecovery()).sendable, 0);
      const file = (await readdir(directory)).find(n => n.startsWith("recovery-"));
      assert.equal((await readFile(path.join(directory, file))).includes(address), false);
      const checked = await verifyFile(path.join(directory, file), passphrase); assert.equal(checked.stats.sendable, 0); assert.equal(checked.chainChecked, false);
    });
    await vault.close();
    await t.test("offline restoration copies ciphertext, resets authentication profile and never calls AWS", async () => {
      const target = path.join(parent, "restored");
      const result = await restoreLocal(directory, target, passphrase); assert.equal(result.cloudWrites, 0); assert.equal(result.snapshots, 1);
      assert.equal((await readFile(path.join(target, "auth", "config"), "utf8")).includes("login_session"), false);
      const restored = await openVault(target, passphrase); assert.equal(restored.snapshots[0].stats.identities, 1); await restored.close();
    });
    await t.test("manual rotation keeps prior archive, evidence, read time and sticky complaints without a fresh AWS read", async () => {
      const old = await openVault(directory, passphrase); await old.lock();
      const snapshot = await old.sync({ ...source(), async suppression() { return { EmailAddress: address, Reason: "COMPLAINT" }; } });
      const before = await readFile(path.join(directory, "snapshot-00000002.cvnb")); await old.close();
      const target = path.join(parent, "rotated"), result = await rotateLocal(directory, target, passphrase);
      assert.equal(result.oldArchivePreserved, true); assert.equal(result.lastSuccessfulRead, snapshot.completedAt);
      assert.deepEqual(await readFile(path.join(directory, "snapshot-00000002.cvnb")), before);
      const next = await openVault(target, passphrase);
      try {
        assert.equal(next.snapshots.length, 1); assert.equal(next.snapshots[0].snapshotKind, "OFFLINE_ROTATION_SEED");
        assert.equal(next.snapshots[0].stats.complaints, 1); assert.ok(next.snapshots[0].ancestorDigest);
        await next.lock(); await next.sync(source()); assert.equal(next.snapshots[1].stats.complaints, 1);
      } finally { await next.close(); }
    });
    await t.test("wrong passphrase and modified ciphertext fail authentication", async () => {
      await assert.rejects(openVault(directory, passphrase + "wrong"), /authentication/);
      const file = path.join(directory, "snapshot-00000001.cvnb"), raw = await readFile(file), data = JSON.parse(raw);
      data.tag = Buffer.alloc(16).toString("base64"); await writeFile(file, JSON.stringify(data));
      await assert.rejects(openVault(directory, passphrase), /authentication/); await writeFile(file, raw);
    });
    await t.test("deleted chain links fail closed", async () => {
      vault = await openVault(directory, passphrase); await vault.lock(); await vault.sync(source()); await vault.close();
      const first = path.join(directory, "snapshot-00000001.cvnb"), bytes = await readFile(first); await rm(first);
      await assert.rejects(openVault(directory, passphrase), /chain/); await writeFile(first, bytes);
    });
    await t.test("ACL broadening is detected rather than quietly accepted", async () => {
      await promisify(execFile)(path.join(process.env.SystemRoot, "System32", "icacls.exe"), [directory, "/grant", "*S-1-5-32-545:(OI)(CI)R"], { shell: false, windowsHide: true });
      await assert.rejects(privateStorage(directory), /private_storage/);
    });
  } finally {
    const resolved = path.resolve(parent); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("chronoverse-backup-synthetic-"));
    await rm(resolved, { recursive: true, force: true });
  }
});
