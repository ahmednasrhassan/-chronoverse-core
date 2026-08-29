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
          Decoding Future Markets Through Historical Intelligence.
        </p>
      </section>

      {/* Institutional Profile */}
      <section className="space-y-6">
        <h1 className="text-3xl font-bold text-[#F3EBDD]">Institutional Profile</h1>
        <div className="text-[#CFC5B8] leading-relaxed space-y-4 text-base">
          <p>
            <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> is an independent research firm situated at the intersection of <strong className="text-[#C8A7E8]">Financial History, Macro-Economic Strategy, and Digital Asset Dynamics</strong>.
          </p>
          <p>
            We do not follow the news cycle. Instead, we analyze the structural DNA of markets. By moving beyond traditional historical narratives, we provide professional-grade analysis on how centuries-old liquidity cycles dictate the movements of today&apos;s digital frontier.
          </p>
        </div>

        {/* Strategic Vision Card */}
        <div className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-4">
          <h3 className="text-xl font-bold text-[#C8A7E8]">Strategic Vision</h3>
          <p className="text-[#CFC5B8] text-sm leading-relaxed">
            Our mission is to arm investors and thinkers with &quot;Temporal Alpha&quot;—the edge gained by understanding market patterns that repeat over centuries.
          </p>
          <ul className="space-y-3 text-sm text-[#CFC5B8] list-disc list-inside border-t border-border pt-4">
            <li>
              <strong className="text-[#F3EBDD]">Macro-Cyclical Analysis:</strong> Modeling how 18th-century &quot;Bubbles&quot; mirror modern Crypto volatility.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Sovereignty &amp; Decentralization:</strong> Tracing the evolution of financial autonomy from the Medici era to DeFi protocols.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Asset Class Correlation:</strong> Studying the &quot;Everything Bubble&quot; phenomenon through a historical lens.
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
              Mohamed bridges trading technology and macro analysis, analyzing market liquidity, execution data, and order-flow dynamics to uncover actionable trading insights.
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
    Ahmed orchestrates sovereign risk architecture and long-term liquidity models across global reserve assets. Specializing in cross-asset macro dynamics, monetary history, and capital preservation frameworks, he leads the platform’s institutional research and strategic market intelligence initiatives.
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
            | Elite Economic Contributor
          </p>
          <p className="text-[#CFC5B8] text-sm leading-relaxed pt-2">
            A visionary in the global creator economy, Emmanuel partners with Chronoverse Capital to deliver premium, uncompromised insights on AI infrastructure, automated finance, and digital sovereignty.
          </p>
        </div>
      </section>

      {/* Strategic Roadmap */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-[#F3EBDD] border-b border-border pb-4">
          Strategic Roadmap
        </h2>

        <div className="bg-[#050506] border border-border p-6 rounded-xl space-y-6">
          <div>
            <h3 className="text-xl font-bold text-[#C8A7E8] mb-2">The Core Directive</h3>
            <p className="text-[#CFC5B8] text-sm leading-relaxed">
              We exist to dismantle the illusions of the modern fiat system. Chronoverse Capital is engineered to provide a sanctuary of absolute wealth preservation, utilizing historical decryption to navigate impending financial shifts.
            </p>
          </div>

          <hr className="border-border" />

          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#F3EBDD]">Operational Trajectory</h3>
            <div className="grid gap-4 md:grid-cols-3 text-xs">
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">Phase I [Intelligence]</strong>
                <p className="text-[#CFC5B8]">Decrypting historical wealth traps and macro-cycles to forecast liquidity shifts.</p>
              </div>
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">Phase II [Sovereign Network]</strong>
                <p className="text-[#CFC5B8]">Forging an elite coalition prioritizing portable, cryptographic assets.</p>
              </div>
              <div className="bg-[#0D0D11] p-4 rounded-lg border border-border">
                <strong className="text-[#C8A7E8] block mb-1">Phase III [Vault Protocol]</strong>
                <p className="text-[#CFC5B8]">Establishing advanced macro-economic alerts and defensive asset allocation.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}