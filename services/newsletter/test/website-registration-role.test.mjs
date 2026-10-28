import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("website role trusts only one production OIDC subject and invokes only the existing POST register route", () => {
  const template = JSON.parse(readFileSync(new URL("../website-registration-role-template.json", import.meta.url)));
  assert.deepEqual(Object.keys(template.Resources), ["WebsiteRegistrationRole"]);
  const p = template.Resources.WebsiteRegistrationRole.Properties;
  const trust = JSON.parse(p.AssumeRolePolicyDocument["Fn::Sub"].replaceAll("${TeamSlug}", "synthetic-team").replaceAll("${ProjectName}", "synthetic-project"));
  assert.deepEqual(trust.Statement, [{ Effect: "Allow", Principal: { Federated: "arn:aws:iam::957261948953:oidc-provider/oidc.vercel.com/synthetic-team" },
    Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: {
      "oidc.vercel.com/synthetic-team:aud": "https://vercel.com/synthetic-team",
      "oidc.vercel.com/synthetic-team:sub": "owner:synthetic-team:project:synthetic-project:environment:production",
    } } }]);
  assert.equal(p.Policies.length, 1);
  assert.deepEqual(p.Policies[0].PolicyDocument.Statement, [{ Effect: "Allow", Action: "execute-api:Invoke",
    Resource: "arn:aws:execute-api:eu-north-1:957261948953:lh71lvbqi8/$default/POST/register" }]);
  assert.equal(p.ManagedPolicyArns, undefined);
});
