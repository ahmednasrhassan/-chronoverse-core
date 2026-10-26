import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256Node } from "@smithy/core/checksum";
import { XMLParser } from "fast-xml-parser";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { MAX_CONTENT_BYTES } from "./content.mjs";
import { boundedText } from "./sanity-discovery.mjs";
import { PUBLICATION_STATE } from "./publication.mjs";

const conditional = error => error?.name === "ConditionalCheckFailedException";
export function createPublicationStore(ddb, TableName) {
  const get = async pk => (await ddb.send(new GetCommand({ TableName, Key: { pk }, ConsistentRead: true }))).Item;
  async function put(Item, ConditionExpression, ExpressionAttributeValues, ExpressionAttributeNames) {
    return ddb.send(new PutCommand({ TableName, Item, ConditionExpression, ExpressionAttributeValues, ExpressionAttributeNames }));
  }
  return {
    get,
    async begin(owner, time) {
      const previous = await get(PUBLICATION_STATE);
      if (previous?.leaseUntil > time) throw new Error("publication_busy");
      const sequence = previous?.sequence || 0;
      const next = { ...previous, pk: PUBLICATION_STATE, sequence, status: "CHECKING", owner, leaseUntil: time + 180000 };
      await put(next, previous ? "#sequence = :sequence AND leaseUntil <= :now" : "attribute_not_exists(pk)",
        previous ? { ":sequence": sequence, ":now": time } : undefined, previous ? { "#sequence": "sequence" } : undefined);
      return next;
    },
    async owned(owner, time) {
      const head = await get(PUBLICATION_STATE);
      if (head?.owner !== owner || head.status !== "CHECKING" || head.leaseUntil <= time) throw new Error("publication_lease_lost");
    },
    observe: (row, previousVersion) => put(row, previousVersion ? "#version = :version" : "attribute_not_exists(pk)",
      previousVersion ? { ":version": previousVersion } : undefined, previousVersion ? { "#version": "version" } : undefined),
    async initDiscovery(start, time) {
      try { await put({ pk: "DISCOVERY", start, createdAt: time }, "attribute_not_exists(pk)"); }
      catch (error) { if (!conditional(error)) throw error; }
    },
    finish: (owner, observation, time) => put({ pk: PUBLICATION_STATE, ...observation, status: "READY", leaseUntil: 0 },
      "#owner = :owner AND leaseUntil > :now AND #sequence < :sequence",
      { ":owner": owner, ":now": time, ":sequence": observation.sequence }, { "#owner": "owner", "#sequence": "sequence" }),
    async fail(owner) {
      const head = await get(PUBLICATION_STATE);
      if (head?.owner !== owner) return;
      await put({ ...head, status: "FAILED", leaseUntil: 0 }, "#owner = :owner", { ":owner": owner }, { "#owner": "owner" });
    },
  };
}

export function createPublicationObject(env, credentials, fetcher = fetch) {
  const bucket = env.CONTENT_BUCKET, key = env.CONTENT_MANIFEST_KEY, owner = env.CONTENT_BUCKET_OWNER;
  if (env.AWS_REGION !== "eu-north-1" || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || "") ||
      !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,400}$/.test(key || "") || key.split("/").some(x => !x || x === "." || x === "..") ||
      !/^\d{12}$/.test(owner || "")) throw new Error("publication_storage_not_configured");
  const hostname = `${bucket}.s3.eu-north-1.amazonaws.com`, objectPath = `/${key.split("/").map(encodeURIComponent).join("/")}`;
  const signer = new SignatureV4({ service: "s3", region: "eu-north-1", credentials, sha256: Sha256Node, uriEscapePath: false });
  async function request(method, path, query = {}, body, headers = {}) {
    const signed = await signer.sign({ method, protocol: "https:", hostname, path, query, body,
      headers: { host: hostname, "x-amz-expected-bucket-owner": owner, ...headers } });
    const suffix = new URLSearchParams(query).toString();
    return fetcher(`https://${hostname}${path}${suffix ? `?${suffix}` : ""}`, { method, body, headers: signed.headers,
      redirect: "error", signal: AbortSignal.timeout(10000) });
  }
  const version = response => {
    const v = response.headers.get("x-amz-version-id");
    if (!v || v === "null" || v.length > 1024) throw new Error("publication_storage_unversioned");
    return v;
  };
  return {
    async versioning() {
      const response = await request("GET", "/", { versioning: "" });
      if (response.status !== 200) throw new Error("publication_storage_unavailable");
      const xml = new XMLParser({ processEntities: false }).parse(await boundedText(response, 8192));
      if (xml?.VersioningConfiguration?.Status !== "Enabled") throw new Error("publication_storage_unversioned");
    },
    async read(bootstrap) {
      const response = await request("GET", objectPath);
      // Without ListBucket, missing can mean 403. Only a conditional create is
      // authorized here; an existing object can never be blindly overwritten.
      if (bootstrap && [403, 404].includes(response.status)) { await response.body?.cancel(); return undefined; }
      if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("publication_storage_unavailable");
      const etag = response.headers.get("etag");
      if (!/^"[A-Za-z0-9_-]{1,120}"$/.test(etag || "")) throw new Error("publication_storage_invalid");
      return { raw: await boundedText(response, MAX_CONTENT_BYTES), versionId: version(response), etag };
    },
    async write(raw, etag) {
      if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_CONTENT_BYTES || (etag && !/^"[A-Za-z0-9_-]{1,120}"$/.test(etag))) throw new Error("publication_storage_invalid");
      const response = await request("PUT", objectPath, {}, raw, { "content-type": "application/json", "x-amz-server-side-encryption": "AES256",
        ...(etag ? { "if-match": etag } : { "if-none-match": "*" }) });
      if ([409, 412].includes(response.status)) throw new Error("publication_write_conflict");
      if (response.status !== 200 || response.headers.get("x-amz-server-side-encryption") !== "AES256") throw new Error("publication_storage_unavailable");
      return { versionId: version(response) };
    },
  };
}
