import React from "react";
import Image from "next/image";
import { SHIMMER_BLUR_DATA_URL } from "@/lib/blurPlaceholder";


export default function AboutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
      
      {/* Hero / Header Section */}
      <section className="text-center space-y-6 border-b border-border pb-10">
        <div className="flex justify-center mb-4">
          <Image
            src="/logo.svg"
            alt="Chronoverse Capital"
            width={380}
            height={100}
            className="h-auto max-w-full object-contain"
            priority
          />

        </div>
        <p className="text-[#C8A7E8] text-lg md:text-xl font-semibold font-mono tracking-wide">
          Five-market intelligence. Independent research.
        </p>
      </section>

      {/* Institutional Profile */}
      <section className="space-y-6">
        <h1 className="text-3xl font-bold text-[#F3EBDD]">Institutional Profile</h1>
        <div className="text-[#CFC5B8] leading-relaxed space-y-4 text-base">
          <p>
            <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> is
            an independent market-intelligence and research platform. Its V1
            product surface covers <strong className="text-[#C8A7E8]">EUR/USD,
            EUR/JPY, EUR/GBP, EUR/CHF, and €STR</strong>.
          </p>
          <p>
            Free and VIP use the same canonical market truth at different
            analytical depths. Separately published editorial research may
            examine broader historical and financial subjects without adding
            them to the launch product universe.
          </p>
        </div>

        {/* Strategic Vision Card */}
        <div className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-4">
          <h3 className="text-xl font-bold text-[#C8A7E8]">Product &amp; Research Boundary</h3>
          <p className="text-[#CFC5B8] text-sm leading-relaxed">
            Our public product separates observed source data, Chronoverse
            analytical transformation, freshness assessment, and availability
            limits.
          </p>
          <ul className="space-y-3 text-sm text-[#CFC5B8] list-disc list-inside border-t border-border pt-4">
            <li>
              <strong className="text-[#F3EBDD]">Focused Coverage:</strong> Four
              euro foreign-exchange references and the €STR benchmark rate.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Shared Truth:</strong> Free is
              the Lite projection; VIP is the Deep projection of the same five
              products.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Separate Research:</strong>
              Editorial articles and standalone dossiers do not expand the
              application&apos;s launch coverage.
            </li>
          </ul>
        </div>
      </section>

      {/* Executive Leadership */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold text-[#F3EBDD] border-b border-border pb-4">
          Executive Leadership
        </h2>

        <div className="grid gap-8 md:grid-cols-3">
          
          {/* Executive 1: Ahmed Abdel Fattah */}
          <div className="bg-[#0D0D11] border border-border p-6 rounded-xl flex flex-col items-center text-center space-y-4 hover:border-[#C8A7E8]/50 transition-all">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-[#C8A7E8]">
              <Image
                 src="https://cdn.sanity.io/images/xfs4j01p/production/a03a88e45b450a8f347633edf76d251bd9881fea-1080x1358.jpg"
                 alt="Ahmed Abdel Fattah"
                 fill
                 className="object-cover"
/>

            </div>
            <div>
              <h3 className="text-xl font-bold text-[#F3EBDD]">Ahmed Abdel Fattah</h3>
              <p className="text-[#C8A7E8] text-xs font-mono font-medium mt-1">Lead Financial Researcher &amp; Strategist</p>
            </div>
            <p className="text-[#CFC5B8] text-xs leading-relaxed">
              Responsible for macro-strategy, asset correlation modeling, and the architectural vision of Chronoverse research dossiers.
            </p>
          </div>

          {/* Executive 2: Mohamed Younes */}
          <div className="bg-[#0D0D11] border border-border p-6 rounded-xl flex flex-col items-center text-center space-y-4 hover:border-[#C8A7E8]/50 transition-all">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-[#C8A7E8]">
              <Image
               src="https://cdn.sanity.io/images/xfs4j01p/production/a198b6ca1d4adc3d8bc92b60f0cbe5422a313935-500x729.webp"
               alt="Mohamed Younes"
               fill
               className="object-cover"
               />
              
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#F3EBDD]">Mohamed Younes</h3>
              <p className="text-[#C8A7E8] text-xs font-mono font-medium mt-1">Trading Infrastructure Engineer &amp; Market Analyst</p>
            </div>
            <p className="text-[#CFC5B8] text-xs leading-relaxed">
              Mohamed bridges trading technology and macro analysis, examining
              market liquidity, execution data, and order-flow dynamics for
              analytical context.
            </p>
          </div>
         {/* Executive: Ahmed Sayed Younis */}
<div className="bg-[#0D0D11] border border-border p-6 rounded-xl flex flex-col items-center text-center">
  <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-[#C8A7E8]/30 mb-4 shrink-0">
    <Image
      src="https://cdn.sanity.io/images/xfs4j01p/production/be70d39bfca56986f8a16aee34afe753934009e9-896x1198.png"
      alt="Ahmed Sayed Younis"
      fill
      className="object-cover"
    />
  </div>
  <div>
    <h3 className="text-xl font-bold text-[#F3EBDD]">Ahmed Sayed Younis</h3>
    <p className="text-[#C8A7E8] text-xs font-mono font-medium tracking-wide uppercase mt-1 mb-3">
      Chief Investment Strategist &amp; Macroeconomics Lead
    </p>
  </div>
  <p className="text-[#CFC5B8] text-xs leading-relaxed">
    Ahmed contributes research on sovereign risk, liquidity, cross-asset macro
    dynamics, monetary history, and capital-preservation frameworks.
  </p>
</div>
          {/* Executive 3: Heba Sayed Ahmed */}
          <div className="bg-[#0D0D11] border border-border p-6 rounded-xl flex flex-col items-center text-center space-y-4 hover:border-[#C8A7E8]/50 transition-all">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-[#C8A7E8]">
              <Image
               src="https://cdn.sanity.io/images/xfs4j01p/production/c9b34301e4a2b857b1878fd640c57e6396708422-1911x1856.webp"
               alt="Heba Nasr"
               fill
               className="object-cover"
/>

            </div>
            <div>
              <h3 className="text-xl font-bold text-[#F3EBDD]">Heba Sayed Ahmed</h3>
              <p className="text-[#C8A7E8] text-xs font-mono font-medium mt-1">Senior Historical Analyst &amp; Editor</p>
            </div>
            <p className="text-[#CFC5B8] text-xs leading-relaxed">
              Specializes in archival research, comparative economic history, and verifying the integrity of historical data points.
            </p>
          </div>

        </div>
      </section>

      {/* Strategic Partners & Ecosystem Alliance */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[#F3EBDD] border-b border-border pb-4">
          Strategic Partners &amp; Ecosystem Alliance
        </h2>

        <div className="bg-[#0D0D11] border-l-4 border-l-[#C8A7E8] border border-border p-6 rounded-r-xl space-y-3">
          <h3 className="text-xl font-bold text-[#F3EBDD]">Emmanuel Oluwasegun Taiwo</h3>
          <p className="text-[#C8A7E8] text-sm font-semibold">
            Founder of{" "}
            <a 
              href="https://afrikdp.com/partners.html" 
              target="_blank" 
              rel="noopener noreferrer nofollow sponsored"
              className="underline hover:text-[#A77BD8]"
            >
              AfriKDP
            </a>{" "}
            | External Contributor
          </p>
          <p className="text-[#CFC5B8] text-sm leading-relaxed pt-2">
            Emmanuel contributes research perspectives on the creator economy,
            AI infrastructure, automated finance, and digital sovereignty.
          </p>
        </div>
      </section>

      {/* Public product boundary */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[#F3EBDD] border-b border-border pb-4">
          Public Product Boundary
        </h2>

        <div className="bg-[#050506] border border-border p-6 rounded-xl space-y-6">
          <div>
            <h3 className="text-xl font-bold text-[#C8A7E8] mb-2">The Core Directive</h3>
            <p className="text-[#CFC5B8] text-sm leading-relaxed">
              Present analytical context without treating model output as a
              trade order, personalized advice, or a guaranteed outcome.
            </p>
          </div>

          <hr className="border-border" />

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#F3EBDD]">Current Structure</h3>
            <div className="grid gap-4 md:grid-cols-3 text-xs">
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">Free [Lite]</strong>
                <p className="text-[#CFC5B8]">A source-dated, availability-aware view of the five launch products.</p>
              </div>
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">VIP [Deep]</strong>
                <p className="text-[#CFC5B8]">Deeper analysis of the same five products for verified VIP access.</p>
              </div>
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">Research [Separate]</strong>
                <p className="text-[#CFC5B8]">Published research and standalone dossiers remain distinct from VIP membership.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
