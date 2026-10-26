import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { defaultDirectory, createVault, openVault, restoreLocal, rotateLocal, verifyFile, privateStorage } from "./src/storage.mjs";
import { hiddenPassphrase } from "./src/prompt.mjs";
import { createAwsSource } from "./src/aws.mjs";
import { SyncSession } from "./src/sync.mjs";
import { requireThat } from "./src/safe.mjs";

const help = `Private Windows owner utility. No web server. No AWS writes or email capability.
  node tools/newsletter-backup/cli.mjs init --config=PRIVATE_JSON [--directory=PRIVATE_NTFS_DIRECTORY]
  node tools/newsletter-backup/cli.mjs status [--directory=PRIVATE_NTFS_DIRECTORY]
  node tools/newsletter-backup/cli.mjs open [--directory=PRIVATE_NTFS_DIRECTORY] [--aws-read-approved]
  node tools/newsletter-backup/cli.mjs export-review [--directory=PRIVATE_NTFS_DIRECTORY]
  node tools/newsletter-backup/cli.mjs verify --file=ENCRYPTED_FILE
  node tools/newsletter-backup/cli.mjs restore-local --from=ARCHIVE_DIRECTORY --directory=NEW_PRIVATE_DIRECTORY
  node tools/newsletter-backup/cli.mjs rotate-local --from=EXISTING_VAULT --directory=NEW_PRIVATE_DIRECTORY
Passphrases are accepted only by a hidden terminal prompt. Never use command arguments or environment variables for them.
Automatic sync starts OFF; only open + explicit approval + the a command enables it.
See tools/newsletter-backup/README.md before configuring authenticated reads.`;

function summary(vault) {
  const last = vault.snapshots.at(-1);
  console.log(JSON.stringify({ localSnapshots: vault.snapshots.length, lastSuccessfulSync: last?.completedAt || null,
    readStartedAt: last?.startedAt || null, atomicPointInTime: false, statistics: last?.stats || null, note: "Stored observations only; not live counts. Recovery never activates contacts." }, null, 2));
}
async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") { console.log(help); return; }
  requireThat(["init", "status", "open", "export-review", "verify", "restore-local", "rotate-local"].includes(command), "invalid_command");
  const allowed = { init: ["config", "directory"], status: ["directory"], open: ["directory", "aws-read-approved"], "export-review": ["directory"], verify: ["file"], "restore-local": ["from", "directory"], "rotate-local": ["from", "directory"] }[command];
  const options = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)(?:=(.+))?$/.exec(argument);
    requireThat(match && allowed.includes(match[1]) && options[match[1]] === undefined && (match[1] === "aws-read-approved" ? match[2] === undefined : match[2] !== undefined), "invalid_arguments");
    options[match[1]] = match[2] ?? true;
  }
  requireThat(process.platform === "win32", "windows_required");
  const directory = options.directory ? path.resolve(options.directory) : defaultDirectory();
  if (command === "init") requireThat(typeof options.config === "string", "configuration_required");
  if (command === "verify") requireThat(typeof options.file === "string", "encrypted_file_required");
  if (["restore-local", "rotate-local"].includes(command)) requireThat(typeof options.from === "string" && typeof options.directory === "string", "restore_paths_required");
  let passphrase = await hiddenPassphrase();
  try {
    if (command === "init") {
      const second = await hiddenPassphrase("Confirm backup passphrase (not displayed): ");
      const hash = text => createHash("sha256").update(text).digest();
      requireThat(timingSafeEqual(hash(passphrase), hash(second)), "passphrase_mismatch");
      await createVault(directory, JSON.parse(await readFile(options.config, "utf8")), passphrase);
      console.log("Encrypted private vault initialized. AWS NOT CONNECTED. Automatic sync INACTIVE."); return;
    }
    if (command === "verify") { console.log(JSON.stringify(await verifyFile(path.resolve(options.file), passphrase), null, 2)); return; }
    if (command === "restore-local") { console.log(JSON.stringify(await restoreLocal(path.resolve(options.from), directory, passphrase), null, 2)); return; }
    if (command === "rotate-local") { console.log(JSON.stringify(await rotateLocal(path.resolve(options.from), directory, passphrase), null, 2)); return; }
    const vault = await openVault(directory, passphrase); passphrase = "";
    let ui, session;
    try {
      summary(vault);
      if (command === "status") { console.log("Automatic sync INACTIVE in this status process; no AWS read was performed."); return; }
      await vault.lock();
      if (command === "export-review") { console.log(JSON.stringify({ encryptedReviewBundleSaved: true, statistics: await vault.exportRecovery(), activationAuthorized: false })); return; }
      const approved = options["aws-read-approved"] === true;
      session = new SyncSession({ announce: state => console.log(state), sync: async signal => {
        requireThat(approved, "aws_reads_not_approved");
        await privateStorage(directory);
        const source = await createAwsSource(vault.config, vault.authPath, approved, { signal });
        try { await vault.sync(source, signal); summary(vault); } finally { source.close(); }
      } });
      console.log("Automatic sync INACTIVE. No updates while closed, sleeping, offline or powered off. Snapshot reads are not a live subscriber count.");
      if (!approved) console.log("AWS reads DISABLED in this session. Exit and reopen with explicit approval before any Sync.");
      ui = createInterface({ input: process.stdin, output: process.stdout });
      for (;;) {
        const action = (await ui.question("s=manual sync, a=automatic hourly after completion, p=pause, v=statistics, r=encrypted recovery review, q=quit > ")).trim().toLowerCase();
        try {
          if (action === "q") break;
          if (action === "s") void session.refresh().catch(() => console.error("Refresh failed or was cancelled; previous backup preserved."));
          else if (action === "a") { requireThat(approved, "aws_reads_not_approved"); session.enable(); }
          else if (action === "p") session.pause();
          else if (action === "v") { summary(vault); console.log(session.busy ? "Refresh IN PROGRESS or cancelling; displayed counts/time remain the last committed snapshot." : "No refresh in progress."); console.log(session.active ? "Automatic sync ACTIVE only while this process runs; next attempt follows the previous completion plus one hour." : "Automatic sync INACTIVE."); }
          else if (action === "r") { requireThat(!session.busy, "sync_busy_or_stopped"); console.log(JSON.stringify({ encryptedReviewBundleSaved: true, statistics: await vault.exportRecovery(), activationAuthorized: false })); }
        } catch { console.error("Operation stopped safely. Stored backup remains unchanged on failed sync. Check approved authentication, permissions, storage and limits privately."); }
      }
    } finally { await session?.stop(); ui?.close(); await vault.close(); }
  } finally { passphrase = ""; }
}
main().catch(() => { console.error("Stopped safely. No private data or credential details displayed. Consult the local guide; inspect configuration/ACL, passphrase, integrity, authentication and approval requirements privately."); process.exitCode = 1; });
