import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Header from "../../../components/navigation/Header";
import Footer from "../../../components/navigation/Footer";
import { PlatformHomePageContent } from "../../../components/platform/PlatformHomePage";
import About from "../../../app/(site)/about/page";
import Faq from "../../../app/(site)/faq/page";
import Methodology from "../../../app/(site)/methodology/page";
import Manifesto from "../../../app/(site)/manifesto/page";
import Contact from "../../../app/(site)/contact/page";
import Editorial from "../../../app/(site)/editorial-policy/page";
import Terms from "../../../app/(site)/terms-of-service/page";
import Privacy from "../../../app/(site)/privacy-policy/page";
import { default as Support } from "../../../app/(site)/contact/page";
import { isFreeOnlyMode } from "../../../config/siteAvailability";
import { createAccessResolverV1 } from "../../auth/access";

async function main(): Promise<void> {

  assert.equal(isFreeOnlyMode(), true);
  const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
  const forbiddenPromotion = /href="(?:\/pricing|\/premium|\/vip(?:\/|\?|"|$)|\/sponsors|https?:\/\/(?:shop|vault)\.chronoversecapital\.com)|Explore VIP|Compare Free and VIP|Deeper in VIP|\$15\.99|\$150\.99|Browse Dossiers/i;
  for (const component of [Header, Footer, About, Faq, Methodology, Manifesto, Contact, Editorial, Terms, Privacy]) {
    const html = render(createElement(component));
    assert.doesNotMatch(html, forbiddenPromotion, component.name);
    assert.doesNotMatch(html, /\bVIP\b|Free Lite|five.market|five.product/i, component.name);
  }
  const shell = render(createElement(PlatformHomePageContent, {
    researchPreview: createElement("p", null, "Published research fixture"),
  }));
  assert.doesNotMatch(shell, forbiddenPromotion);
  assert.doesNotMatch(shell, /\bVIP\b|Premium Dossiers|Membership &amp; Research/i);
  assert.doesNotMatch(shell, /Five free market tools|Explore Free Market Tools|href="\/markets"/i);
  assert.match(shell, /Published research fixture/);
  assert.match(shell, /Newsletter|newsletter/);
  const billing = render(createElement(Support));
  assert.match(billing, /one-time books/);
  assert.doesNotMatch(billing, /Lemon Squeezy|Gumroad/);
  assert.match(billing, /refund/);
  assert.doesNotMatch(billing, forbiddenPromotion);
  assert.doesNotMatch(billing, /Manage subscription|\bVIP\b|No active paid subscription/);
  for (const page of [Terms, Privacy, Contact]) {
    const html = render(createElement(page));
    assert.doesNotMatch(html, /Lemon Squeezy|Gumroad/);
    assert.match(html, /refund/);
    assert.match(html, /dispute/);
  }
  // Free identity must not need commercial config, a billing RPC, or payment secrets.
  const resolver = createAccessResolverV1(async () => ({
    authSubject: "verified-subject",
    trustedAccess: [{ user_id: "internal-user", auth_user_id: "verified-subject", role: "user", access_state: "authenticated_free", can_access_vip: false }],
  }));
  assert.equal((await resolver()).state, "authenticated_free");
  console.log("PASS: rendered free-only public surfaces, retired pages and billing-independent free identity");
}

void main();
