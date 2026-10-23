import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Terms from "../../../app/(site)/terms-of-service/page";
import Privacy from "../../../app/(site)/privacy-policy/page";
import Faq from "../../../app/(site)/faq/page";
import { default as Support } from "../../../app/(site)/contact/page";

async function main(): Promise<void> {
  for (const page of [Terms, Privacy, Faq]) {
    const html = renderToStaticMarkup(createElement(page));
    assert.match(html, /one-time books/);
    assert.match(html, /Lemon Squeezy and Gumroad/);
    assert.match(html, /refund/);
    assert.doesNotMatch(html, /href="\/pricing"|shop\.chronoversecapital|VIP checkout is available|\$15\.99|\$150\.99/);
  }
  const support = renderToStaticMarkup(createElement(Support));
  assert.match(support, /delivery, refund or dispute issue/);
  assert.match(support, /Original purchase terms and/);
  console.log("PASS: free-only legal and support disclosures preserve historical customer obligations");
}

void main();
