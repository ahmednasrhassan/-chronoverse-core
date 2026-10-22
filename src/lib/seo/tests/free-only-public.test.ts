import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Header from "../../../components/navigation/Header";
import Footer from "../../../components/navigation/Footer";
import { FreeHomePageContent } from "../../../components/home/FreeHomePageContent";
import About from "../../../app/(site)/about/page";
import Faq from "../../../app/(site)/faq/page";
import HomeMarketTools from "../../../components/home/HomeMarketTools";
import FreeMarketSurface from "../../../components/home/FreeMarketSurface";
import Methodology from "../../../app/(site)/methodology/page";
import Manifesto from "../../../app/(site)/manifesto/page";
import Contact from "../../../app/(site)/contact/page";
import Editorial from "../../../app/(site)/editorial-policy/page";
import Terms from "../../../app/(site)/terms-of-service/page";
import Privacy from "../../../app/(site)/privacy-policy/page";
import Billing from "../../../app/(site)/billing/page";
import VipOverview from "../../../app/(vip)/vip/page";
import VipMarkets from "../../../app/(vip)/vip/markets/page";
import VipMarket from "../../../app/(vip)/vip/markets/[market]/page";
import { isFreeOnlyMode } from "../../../config/siteAvailability";
import { createAccessResolverV1 } from "../../auth/access";

async function main(): Promise<void> {

  assert.equal(isFreeOnlyMode(), true);
  const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
  const forbiddenPromotion = /href="(?:\/pricing|\/premium|\/vip(?:\/|\?|"|$)|\/sponsors|https?:\/\/(?:shop|vault)\.chronoversecapital\.com)|Explore VIP|Compare Free and VIP|Deeper in VIP|\$15\.99|\$150\.99|Browse Dossiers/i;
  for (const component of [Header, Footer, About, Faq, Methodology, Manifesto, Contact, Editorial, Terms, Privacy]) {
    const html = render(createElement(component));
    assert.doesNotMatch(html, forbiddenPromotion, component.name);
    assert.doesNotMatch(html, /\bVIP\b/i, component.name);
  }
  const projections = { eurusd: null, eurjpy: null, eurgbp: null, eurchf: null, estr: null };
  assert.doesNotMatch(render(createElement(FreeMarketSurface, { projections })), forbiddenPromotion);
  const shell = render(createElement(FreeHomePageContent, {
    marketTools: createElement(HomeMarketTools, { projections }),
    researchPreview: createElement("p", null, "Published research fixture"),
  }));
  assert.doesNotMatch(shell, forbiddenPromotion);
  assert.doesNotMatch(shell, /\bVIP\b|Premium Dossiers|Membership &amp; Research/i);
  for (const market of ["EUR/USD", "EUR/JPY", "EUR/GBP", "EUR/CHF", "\u20acSTR"]) assert.ok(shell.includes(market), market);
  assert.match(shell, /Published research fixture/);
  assert.match(shell, /Newsletter|newsletter/);
  const billing = render(await Billing());
  assert.match(billing, /one-time books/);
  assert.match(billing, /Lemon Squeezy and Gumroad/);
  assert.match(billing, /refund/);
  assert.doesNotMatch(billing, forbiddenPromotion);
  assert.doesNotMatch(billing, /Manage subscription|\bVIP\b|No active paid subscription/);
  for (const page of [Terms, Privacy, Contact]) {
    const html = render(createElement(page));
    assert.match(html, /Lemon Squeezy and Gumroad/);
    assert.match(html, /refund/);
    assert.match(html, /dispute/);
  }
  const missing = (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404";
  await assert.rejects(VipOverview({ searchParams: Promise.resolve({}) }), missing);
  await assert.rejects(VipMarkets(), missing);
  for (const market of ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr", "unknown"]) {
    await assert.rejects(VipMarket({ params: Promise.resolve({ market }) }), missing);
  }
  // Free identity must not need commercial config, a billing RPC, or payment secrets.
  const deniedDependency = () => { throw new Error("Unexpected commercial dependency"); };
  const resolver = createAccessResolverV1(async () => ({
    authSubject: "verified-subject",
    trustedAccess: [{ user_id: "internal-user", auth_user_id: "verified-subject", role: "user", access_state: "authenticated_free", can_access_vip: false }],
    loadCommercialAccess: deniedDependency,
  }), { commercialAccessEnabled: false, getVipCommercialConfig: deniedDependency, getCurrentTime: deniedDependency });
  assert.equal((await resolver()).state, "authenticated_free");
  console.log("PASS: rendered free-only public surfaces, retired pages and billing-independent free identity");
}

void main();
