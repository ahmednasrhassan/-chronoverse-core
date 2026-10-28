import "server-only";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256Node } from "@smithy/core/checksum";
import { REGISTRATION_TARGET, type Registration } from "./registration";

type TemporaryCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: Date };
export function signedRegistration(credentials: () => Promise<TemporaryCredentials>, fetcher: typeof fetch = fetch) {
  return async (input: Registration) => {
    const identity = await credentials();
    if (!identity.sessionToken || !Number.isFinite(identity.expiration?.getTime()) ||
        identity.expiration.getTime() < Date.now() + 30000) throw new Error("registration_unavailable");
    const body = JSON.stringify(input), target = REGISTRATION_TARGET;
    const signer = new SignatureV4({ service: "execute-api", region: "eu-north-1", credentials: identity, sha256: Sha256Node });
    const request = await signer.sign({ protocol: "https:", hostname: target.hostname, method: "POST", path: "/register",
      headers: { host: target.hostname, origin: target.origin, "content-type": "application/json" }, body });
    const response = await fetcher(target.href, { method: "POST", headers: request.headers, body,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
    // Never proxy the upstream HTML, headers, addresses or diagnostics.
    await response.body?.cancel(); return response.status;
  };
}
