import "server-only";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { signedRegistration } from "./signedRegistration";
import type { Registration } from "./registration";

export async function submitFromVercel(input: Registration) {
  const roleArn = process.env.NEWSLETTER_REGISTRATION_ROLE_ARN;
  if (process.env.VERCEL_ENV !== "production" || !/^arn:aws:iam::957261948953:role\/[A-Za-z0-9+=,.@_-]{1,64}$/.test(roleArn || "")) {
    throw new Error("registration_unavailable");
  }
  const provider = awsCredentialsProvider({ roleArn: roleArn!, durationSeconds: 900, roleSessionName: "newsletter-registration",
    clientConfig: { region: "eu-north-1", maxAttempts: 1 } });
  return signedRegistration(async () => {
    const c = await provider();
    if (!c.sessionToken || !c.expiration) throw new Error("registration_unavailable");
    return { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken, expiration: c.expiration };
  })(input);
}
