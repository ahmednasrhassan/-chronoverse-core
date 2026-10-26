import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { requireThat, BackupError, delay } from "./safe.mjs";

const exec = promisify(execFile);
export function validateConfig(c) {
  requireThat(c && typeof c === "object" && Object.keys(c).every(k => ["region", "accountId", "roleArn", "tableArn", "contactList", "awsExe", "auth", "maxSnapshots"].includes(k)), "invalid_configuration");
  requireThat(c.region === "eu-north-1" && /^\d{12}$/.test(c.accountId) && c.accountId !== "000000000000", "invalid_configuration");
  requireThat(new RegExp(`^arn:aws:iam::${c.accountId}:role/[A-Za-z0-9_+=,.@/-]{1,512}$`).test(c.roleArn), "invalid_configuration");
  requireThat(new RegExp(`^arn:aws:dynamodb:eu-north-1:${c.accountId}:table/[A-Za-z0-9_.-]{3,255}$`).test(c.tableArn), "invalid_configuration");
  requireThat(/^[A-Za-z0-9_-]{1,64}$/.test(c.contactList) && typeof c.awsExe === "string" && /^[A-Za-z]:\\/.test(c.awsExe) && path.win32.basename(c.awsExe).toLowerCase() === "aws.exe", "invalid_configuration");
  requireThat(Number.isSafeInteger(c.maxSnapshots) && c.maxSnapshots >= 2 && c.maxSnapshots <= 1000, "invalid_configuration");
  requireThat(c.auth && ["login", "sso"].includes(c.auth.kind), "invalid_configuration");
  if (c.auth.kind === "login") requireThat(Object.keys(c.auth).length === 1, "invalid_configuration");
  else requireThat(Object.keys(c.auth).every(k => ["kind", "session", "startUrl", "region", "roleName"].includes(k)) &&
    /^[A-Za-z0-9_-]{1,64}$/.test(c.auth.session) && /^https:\/\/[a-z0-9.-]+\.awsapps\.com\/start\/?$/.test(c.auth.startUrl) &&
    /^[a-z]{2}-[a-z]+-\d$/.test(c.auth.region) && /^[A-Za-z0-9_+=,.@-]{1,64}$/.test(c.auth.roleName), "invalid_configuration");
  return c;
}
export function scope(c) { return { region: c.region, accountId: c.accountId, roleArn: c.roleArn, tableArn: c.tableArn, contactList: c.contactList }; }
export function authConfig(c) {
  validateConfig(c);
  const base = `[profile newsletter-backup]\nregion = ${c.region}\n`;
  return c.auth.kind === "login" ? base : base + `sso_session = ${c.auth.session}\nsso_account_id = ${c.accountId}\nsso_role_name = ${c.auth.roleName}\n\n[sso-session ${c.auth.session}]\nsso_region = ${c.auth.region}\nsso_start_url = ${c.auth.startUrl}\nsso_registration_scopes = sso:account:access\n`;
}
export function validateAuthConfig(raw, c) {
  const expected = authConfig(c);
  if (c.auth.kind === "sso") { requireThat(raw.replace(/\r/g, "").trim() === expected.trim(), "unsafe_auth_profile"); return; }
  const lines = raw.replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean);
  requireThat(lines.length === 3 && lines[0] === "[profile newsletter-backup]", "unsafe_auth_profile");
  const entries = lines.slice(1).map(line => /^([a-z_]+)\s*=\s*(\S+)$/.exec(line));
  requireThat(entries.every(Boolean) && new Set(entries.map(x => x[1])).size === 2, "unsafe_auth_profile");
  const values = Object.fromEntries(entries.map(x => [x[1], x[2]]));
  const roleName = c.roleArn.split("/").at(-1);
  requireThat(values.region === c.region && (values.login_session === c.roleArn || values.login_session?.startsWith(`arn:aws:sts::${c.accountId}:assumed-role/${roleName}/`)), "unsafe_auth_profile");
}
export function childEnvironment(authPath) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (/^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(key)) env[key] = value;
  return { ...env, AWS_CONFIG_FILE: authPath, AWS_SHARED_CREDENTIALS_FILE: path.join(path.dirname(authPath), "no-static-credentials"),
    AWS_EC2_METADATA_DISABLED: "true", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true", AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off" };
}
export function validateCredentials(data, now = Date.now()) {
  const expiry = Date.parse(data?.Expiration);
  requireThat(data?.Version === 1 && /^ASIA[A-Z0-9]{16}$/.test(data.AccessKeyId) && typeof data.SecretAccessKey === "string" && data.SecretAccessKey.length >= 20 &&
    typeof data.SessionToken === "string" && data.SessionToken.length >= 20 && Number.isFinite(expiry) && expiry > now + 90000 && expiry <= now + 13 * 3600000, "temporary_authentication_required");
  return { accessKeyId: data.AccessKeyId, secretAccessKey: data.SecretAccessKey, sessionToken: data.SessionToken, expiration: new Date(expiry) };
}
export function verifyIdentity(identity, c) {
  requireThat(identity?.Account === c.accountId && typeof identity.Arn === "string" &&
    identity.Arn.startsWith(`arn:aws:sts::${c.accountId}:assumed-role/${c.roleArn.split("/").at(-1)}/`) && identity.Arn.split("/").length === 3, "wrong_readonly_role");
}
export async function loadAwsLibrary() {
  const [ddb, ses, sts] = await Promise.all([import("@aws-sdk/client-dynamodb"), import("@aws-sdk/client-sesv2"), import("@aws-sdk/client-sts")]);
  return { client: (service, credentials, region) => new ({ ddb: ddb.DynamoDBClient, ses: ses.SESv2Client, sts: sts.STSClient })[service]({ region, credentials, maxAttempts: 1, requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
    endpoint: `https://${{ ddb: "dynamodb", ses: "email", sts: "sts" }[service]}.${region}.amazonaws.com` }),
    command: (name, input) => new ({ ...ddb, ...ses, ...sts })[name](input) };
}
export async function createAwsSource(c, authPath, approved, { library, execute = exec, wait = delay, now = Date.now, signal } = {}) {
  const synthetic = Boolean(library);
  validateConfig(c); requireThat(approved === true, "aws_reads_not_approved");
  if (!library) {
    requireThat(process.platform === "win32" && process.env.CV_BACKUP_OFFLINE_TEST !== "1", "aws_reads_disabled");
    requireThat(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "unsafe_tls_configuration");
    const executable = await lstat(c.awsExe); requireThat(executable.isFile() && !executable.isSymbolicLink(), "invalid_aws_cli");
    validateAuthConfig(await readFile(authPath, "utf8"), c);
    try { await lstat(childEnvironment(authPath).AWS_SHARED_CREDENTIALS_FILE); throw new BackupError("unsafe_auth_profile"); }
    catch (e) { if (e.code !== "ENOENT") throw new BackupError("unsafe_auth_profile"); }
    library = await loadAwsLibrary();
  }
  let cached, refreshing, lastSes = -Infinity;
  const cli = async args => {
    try { requireThat(!signal?.aborted, "cancelled"); return (await execute(c.awsExe, args, { shell: false, windowsHide: true, timeout: 45000, maxBuffer: 64 * 1024, env: childEnvironment(authPath), signal })).stdout; }
    catch { throw new BackupError("temporary_authentication_required"); }
  };
  const version = await cli(["--version"]);
  const v = /aws-cli\/2\.(\d+)\./.exec(version); requireThat(v && Number(v[1]) >= 32, "aws_cli_update_required");
  async function credentials() {
    if (cached && cached.expiration.getTime() > now() + 120000) return cached;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let result;
      if (!synthetic) validateAuthConfig(await readFile(authPath, "utf8"), c);
      try { result = validateCredentials(JSON.parse(await cli(["configure", "export-credentials", "--profile", "newsletter-backup", "--format", "process"])), now()); }
      catch { throw new BackupError("temporary_authentication_required"); }
      const probe = library.client("sts", result, c.region);
      try { verifyIdentity(await probe.send(library.command("GetCallerIdentityCommand", {}), { abortSignal: signal }), c); }
      catch { throw new BackupError("wrong_readonly_role"); }
      finally { probe.destroy?.(); }
      cached = result; return result;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  const ddb = library.client("ddb", credentials, c.region), ses = library.client("ses", credentials, c.region);
  async function call(client, name, input, isSes = false) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (isSes) { await wait(Math.max(0, lastSes + 2000 - now())); lastSes = now(); }
      requireThat(!signal?.aborted, "cancelled");
      try { return await client.send(library.command(name, input), { abortSignal: signal }); }
      catch (e) {
        if (name === "GetSuppressedDestinationCommand" && e.name === "NotFoundException") return null;
        if (!["TooManyRequestsException", "ThrottlingException", "ProvisionedThroughputExceededException"].includes(e.name) || attempt === 2) throw new BackupError("aws_read_failed");
        await wait(2000 * 2 ** attempt);
      }
    }
  }
  return {
    async verify() {
      await credentials();
      const result = await call(ddb, "DescribeTableCommand", { TableName: c.tableArn });
      requireThat(result.Table?.TableArn === c.tableArn && result.Table.TableStatus === "ACTIVE" && result.Table.KeySchema?.length === 1 && result.Table.KeySchema[0].AttributeName === "pk" && result.Table.KeySchema[0].KeyType === "HASH", "wrong_backup_table");
      const list = await call(ses, "GetContactListCommand", { ContactListName: c.contactList }, true);
      requireThat(list.ContactListName === c.contactList && list.Topics?.some(t => t.TopicName === "weekly-research"), "wrong_contact_list");
    },
    scan: (input = {}) => call(ddb, "ScanCommand", { TableName: c.tableArn, ConsistentRead: true, Limit: 100, ...(input.ExclusiveStartKey === undefined ? {} : { ExclusiveStartKey: input.ExclusiveStartKey }) }),
    contacts: (input = {}) => call(ses, "ListContactsCommand", { ContactListName: c.contactList, PageSize: 100, ...(input.NextToken === undefined ? {} : { NextToken: input.NextToken }) }, true),
    async suppression(address) { const result = await call(ses, "GetSuppressedDestinationCommand", { EmailAddress: address }, true); if (result === null) return null; requireThat(result?.SuppressedDestination, "invalid_page"); return result.SuppressedDestination; },
    close() { cached = undefined; ddb.destroy?.(); ses.destroy?.(); },
  };
}
