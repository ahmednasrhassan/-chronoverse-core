import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { requireVipV1 } from "@/lib/auth/guards";
import { enforceVipPageAccessV1 } from "@/lib/auth/vipPageAccess";

export const metadata: Metadata = {
  title: "VIP Market Rooms | Chronoverse Capital",
  description:
    "The five-product Chronoverse VIP Market Room directory for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function VipMarketsPage() {
  await enforceVipPageAccessV1(requireVipV1, redirect);

  return (
    <div className="relative isolate overflow-hidden pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_78%_8%,rgba(167,123,216,0.13),transparent_31%),linear-gradient(180deg,#15131A_0%,#08070A_52%,#050506_88%)]"
      />

      <section className="border-b border-[#6F4C91]/30 bg-[#0D0D11]/80">
        <div className="mx-auto grid max-w-[88rem] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" className="h-9 w-0.5 shrink-0 bg-[#A77BD8]" />
            <div className="min-w-0">
              <div className={EYEBROW}>Chronoverse VIP</div>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-[#F3EBDD]">
                Market Rooms
              </h1>
            </div>
            <span className="hidden h-8 w-px bg-[#6F4C91]/30 sm:block" />
            <p className="hidden max-w-md text-xs leading-5 text-[#CFC5B8] sm:block">
              Five focused workspaces across four FX pairs and one official rate.
            </p>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-[#6F4C91]/30 border-l border-[#6F4C91]/30">
            <CommandDatum label="Universe" value="05 products" />
            <CommandDatum label="FX rooms" value="04" />
            <CommandDatum label="Rate rooms" value="01" />
          </dl>
        </div>
      </section>

      <main className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
        <nav aria-label="VIP workspace" className="py-4">
          <Link
            href="/vip"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-[#CFC5B8] underline decoration-[#6F4C91] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            Back to VIP Overview
          </Link>
        </nav>

        <header className="grid gap-5 border-y border-[#6F4C91]/40 bg-[radial-gradient(circle_at_76%_5%,rgba(200,167,232,0.08),transparent_34%),linear-gradient(145deg,#15131A,#0D0D11_72%)] px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-9">
          <div>
            <div className={EYEBROW}>Five-product VIP universe</div>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.04em] text-[#F3EBDD] sm:text-4xl">
              Choose a dedicated analytical workspace.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#CFC5B8]">
              Each room keeps historical context and canonical Deep intelligence
              distinct, with product-specific language and provenance.
            </p>
          </div>
          <div className="border-l-2 border-[#A77BD8] pl-4 text-xs leading-5 text-[#CFC5B8] lg:max-w-xs">
            History and Deep layers report their availability independently. One
            is never substituted for the other.
          </div>
        </header>

        <section aria-labelledby="market-room-directory" className="py-6 sm:py-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className={EYEBROW}>Directory</div>
              <h2 id="market-room-directory" className="mt-1 text-xl font-bold text-[#F3EBDD]">
                VIP Market Rooms
              </h2>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-[#91889A]">
              05 / 05 products
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {LAUNCH_MARKETS_V1.map((market, index) => (
              <article
                key={market.productId}
                className="group grid min-h-64 border border-[#6F4C91]/35 bg-[#0D0D11] p-5 transition-colors hover:border-[#A77BD8]/70 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-[10px] tabular-nums text-[#91889A]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <h3 className="mt-3 text-2xl font-black tracking-[-0.035em] text-[#F3EBDD]">
                      {market.label}
                    </h3>
                  </div>
                  <span className="border border-[#6F4C91]/40 bg-[#A77BD8]/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]">
                    {market.kind === "fx" ? "FX" : "Official rate"}
                  </span>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-semibold text-[#F3EBDD]">
                    {market.roomDescription}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-[#CFC5B8]">
                    {roomDetail(market.kind)}
                  </p>
                </div>

                <div className="mt-auto border-t border-[#6F4C91]/25 pt-4">
                  <Link
                    href={`/vip/markets/${market.productId}`}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-xs font-bold text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
                  >
                    Open {market.label} Market Room
                    <span aria-hidden="true" className="ml-2">&#8594;</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const EYEBROW =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]";

function CommandDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-1.5 sm:px-4">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[11px] font-semibold text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function roomDetail(kind: "fx" | "rate") {
  return kind === "fx"
    ? "Reference-rate history alongside signal, risk, confidence, conditional scenarios, invalidation, and provenance when the corresponding layers are available."
    : "Official €STR history alongside basis-point mechanics, regimes, signal and risk coverage, and provenance when the corresponding layers are available.";
}
