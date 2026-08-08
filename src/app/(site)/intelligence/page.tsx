"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import MarketQuoteCard from "@/components/charts/MarketQuoteCardLazy";
const LightweightChart = dynamic(() => import("@/components/charts/LightweightChart"), { ssr: false });



// Chart.js touches browser-only globals (canvas/document) at import time.
// Registering it eagerly at module scope can crash Server-Side Rendering
// (causing the generic "This page couldn't load" error). We defer all
// Chart.js setup + rendering to the client only via dynamic import.
const Radar = dynamic(
  async () => {
    const {
      Chart: ChartJS,
      RadialLinearScale,
      PointElement,
      LineElement,
      Filler,
      Tooltip,
      Legend,
    } = await import("chart.js");
    const { Radar: RadarChart } = await import("react-chartjs-2");

    ChartJS.register(
      RadialLinearScale,
      PointElement,
      LineElement,
      Filler,
      Tooltip,
      Legend
    );

    return RadarChart;
  },
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-55 flex items-center justify-center text-[#a1a1aa] text-xs border border-[#27272a] rounded-lg">
        LOADING RADAR DATA...
      </div>
    ),
  }
);

// -----------------------------------------------------------------------------
// Lightweight client-side Error Boundary.
// Any unexpected runtime error thrown while rendering the terminal widgets
// (bad chart data, malformed calculations, etc.) is caught here and a safe
// fallback UI is rendered instead of bubbling up to Next.js' generic
// "This page couldn't load" error screen.
// -----------------------------------------------------------------------------
class IntelligenceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
     
    console.error("[Intelligence Terminal] Recovered from render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-6xl mx-auto px-4 py-12 font-mono">
          <div className="bg-[#18181b] border border-red-500/50 p-6 rounded-xl text-center space-y-3">
            <h2 className="text-red-500 font-bold text-sm">[ MODULE OFFLINE ]</h2>
            <p className="text-[#a1a1aa] text-xs">
              This section of the terminal encountered an unexpected error and has been
              safely isolated. The rest of the site remains fully operational.
            </p>
            <Link
              href="/"
              className="inline-block bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold px-6 py-2.5 rounded-md text-xs transition-colors"
            >
              RETURN TO BASE
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LiveMarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

/** Static local fallback dataset — mirrors the server-side fallback in
 * `src/app/api/market-data/route.ts` — guaranteeing the ticker strip always
 * has safe, renderable data even if the client-side fetch itself throws
 * (network error, ad-blocker, offline, etc.), so this module never enters
 * a "MODULE OFFLINE" state. */
const LOCAL_FALLBACK_QUOTES: LiveMarketQuote[] = [
  { symbol: "BTC-USD", label: "Bitcoin", price: 64250.12, changePercent: 1.8 },
  { symbol: "ETH-USD", label: "Ethereum", price: 3120.55, changePercent: 0.9 },
  { symbol: "GC=F", label: "Gold (Futures)", price: 2412.3, changePercent: 0.3 },
  { symbol: "^GSPC", label: "S&P 500", price: 5480.6, changePercent: -0.2 },
  { symbol: "DX-Y.NYB", label: "US Dollar Index", price: 104.8, changePercent: 0.1 },
];

function TerminalIntelligenceContent() {
  // Scanner Typewriter State
  // Default to an empty array so any .map()/.length access is always safe,
  // even if a future refactor wires this up to a live market feed response.
  const [scannerText, setScannerText] = useState<string[]>([]);

  // Live Market Feed State — always initialized with the safe local
  // fallback dataset so the ticker strip renders immediately, then
  // opportunistically upgraded once/if the live `/api/market-data` fetch
  // resolves successfully.
  const [liveQuotes, setLiveQuotes] = useState<LiveMarketQuote[]>(LOCAL_FALLBACK_QUOTES);
  const [feedSource, setFeedSource] = useState<"fallback" | "live" | "partial">("fallback");

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const res = await fetch("/api/market-data", { cache: "no-store" });
        if (!res?.ok) return;

        const data = await res.json().catch(() => null);
        const quotes = data?.quotes;

        if (isMounted && Array.isArray(quotes) && quotes.length > 0) {
          setLiveQuotes(quotes);
          setFeedSource(data?.source === "live" || data?.source === "partial" ? data.source : "fallback");
        }
      } catch (err) {
         
        console.error("[Intelligence Terminal] Live market feed fetch failed, keeping safe fallback:", err);
        // No state change needed — `liveQuotes` already holds the safe
        // local fallback dataset from initialization.
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);


  // V_INTEL Simulation States
  const [assetPreset, setAssetPreset] = useState("custom");
  const [returnVal, setReturnVal] = useState(10);
  const [sovereigntyVal, setSovereigntyVal] = useState(5);
  const [volatilityVal, setVolatilityVal] = useState(20);
  const [macroVal, setMacroVal] = useState(10);

  // Quiz States
  const [step, setStep] = useState(1);
  const [quizScore, setQuizScore] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLog, setStatusLog] = useState("CONNECTING TO GLOBAL NODES...");
  const [quizCompleted, setQuizCompleted] = useState(false);

  // Denominator Engine States
  const [nomWealth, setNomWealth] = useState(100000);
  const [histAnchor, setHistAnchor] = useState(1);

  // Decryption Console State
  const [accessCode, setAccessCode] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);

  // 1. Scanner Output Effect
  // Any future upgrade to a live market-feed / ticker API response should
  // populate `lines` defensively (e.g. `response?.lines ?? FALLBACK_LINES`)
  // so a failed fetch never leaves `lines` undefined before the interval runs.
  useEffect(() => {
    const FALLBACK_LINES = [
      "> INITIATING V_INTEL SECURITY PROTOCOL...",
      "> SCANNING INCOMING CONNECTION...",
      "> TARGET OS DETECTED: [SECURE NODE]",
      "> BROWSER NODE: [ENCRYPTED CLIENT]",
      "> ANALYZING FIAT EXPOSURE AND TRACKABILITY...",
      "> WARNING: 87% VULNERABILITY DETECTED IN LOCAL NODE.",
      "> STATUS: ASSETS ARE EXPOSED TO CENTRALIZED MONITORING.",
      "> ADVICE: PROCEED TO THE TERMINAL BELOW TO CALCULATE REAL RISKS.",
    ];

    // Defensive default: guarantee we always have a safe array to iterate,
    // even if this were ever wired up to an external market feed response.
    const lines = FALLBACK_LINES ?? [];

    let currentLine = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    try {
      interval = setInterval(() => {
        if (currentLine < (lines?.length ?? 0)) {
          setScannerText((prev) => [...(prev ?? []), lines?.[currentLine] ?? ""]);
          currentLine++;
        } else if (interval) {
          clearInterval(interval);
        }
      }, 800);
    } catch (err) {
       
      console.error("[Intelligence Terminal] Scanner effect failed, falling back safely:", err);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);


  // 2. Preset Handler for V_INTEL
  const handlePresetChange = (preset: string) => {
    setAssetPreset(preset);
    if (preset === "fiat") {
      setReturnVal(4);
      setSovereigntyVal(1);
      setVolatilityVal(10);
      setMacroVal(85);
    } else if (preset === "realestate") {
      setReturnVal(8);
      setSovereigntyVal(4);
      setVolatilityVal(25);
      setMacroVal(60);
    } else if (preset === "crypto") {
      setReturnVal(80);
      setSovereigntyVal(10);
      setVolatilityVal(85);
      setMacroVal(15);
    } else if (preset === "gold") {
      setReturnVal(5);
      setSovereigntyVal(9);
      setVolatilityVal(15);
      setMacroVal(20);
    }
  };

  // V_INTEL Score Calculation
  const safeV = volatilityVal === 0 ? 1 : volatilityVal;
  const vScore = (((returnVal * sovereigntyVal) / safeV) * (1 - macroVal / 110)).toFixed(2);
  const numericVScore = parseFloat(vScore) || 0;

  // Quiz Navigation
  const handleQuizAnswer = (nextStepNum: number, points: number) => {
    setQuizScore((prev) => (prev ?? 0) + (points ?? 0));
    if (nextStepNum <= 3) {
      setStep(nextStepNum);
    } else {
      setIsScanning(true);
      let p = 0;
      const interval = setInterval(() => {
        try {
          p += 2;
          setProgress(p);
          if (p === 20) setStatusLog("CROSS-REFERENCING FIAT DECAY ALGORITHMS...");
          if (p === 45) setStatusLog("CALCULATING V_INTEL THRESHOLD...");
          if (p === 70) setStatusLog("MAPPING VULNERABILITIES TO THE BURNING GRID...");
          if (p === 90) setStatusLog("DECRYPTING EXIT BLUEPRINT...");
          if (p >= 100) {
            clearInterval(interval);
            setIsScanning(false);
            setQuizCompleted(true);
          }
        } catch (err) {
           
          console.error("[Intelligence Terminal] Scan progress interval failed:", err);
          clearInterval(interval);
          setIsScanning(false);
        }
      }, 50);
    }
  };

  // Radar Chart Data Logic
  // Falls back to a safe default 5-point dataset if the anchor lookup
  // ever fails to resolve (e.g. malformed / unexpected value).
  const DEFAULT_RADAR_POINTS = [90, 20, 10, 30, 80];
  const getRadarData = (): number[] => {
    try {
      if (histAnchor === 1) return [90, 20, 10, 30, 80];
      if (histAnchor === 40) return [40, 90, 95, 80, 20];
      if (histAnchor === 1000000) return [100, 10, 0, 10, 90];
      if (histAnchor === 85) return [100, 0, 0, 0, 10];
      return DEFAULT_RADAR_POINTS;
    } catch (err) {
       
      console.error("[Intelligence Terminal] Radar data lookup failed, using default:", err);
      return DEFAULT_RADAR_POINTS;
    }
  };

  // Radar labels/dataset are always given explicit safe defaults ([]/{})
  // so Chart.js never receives undefined arrays that could throw at render.
  const RADAR_LABELS: string[] = ["Liquidity", "Privacy", "Scarcity", "Autonomy", "Mobility"];
  const radarChartData = {
    labels: RADAR_LABELS ?? [],
    datasets: [
      {
        label: "Asset Resilience",
        data: getRadarData() ?? DEFAULT_RADAR_POINTS,
        backgroundColor: "rgba(200, 125, 85, 0.25)",
        borderColor: "#c87d55",
        pointBackgroundColor: "#f4f4f5",
        borderWidth: 2,
      },
    ],
  };



  const radarOptions = {
    scales: {
      r: {
        angleLines: { color: "#27272a" },
        grid: { color: "#27272a" },
        pointLabels: { color: "#c87d55", font: { family: "monospace", size: 11 } },
        ticks: { display: false, min: 0, max: 100 },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  // Decryption Executer
  const handleDecryption = () => {
    if (accessCode.trim().toUpperCase() === "LEMON-70") {
      setIsDecrypting(true);
      setTimeout(() => {
        try {
          window.open(
            "https://vault.chronoversecapital.com/checkout/buy/6bfbf7ab-53c3-4d6e-aad8-44f9835a7160",
            "_blank",
            "noopener,noreferrer"
          );
        } catch (err) {
           
          console.error("[Intelligence Terminal] Failed to open checkout link:", err);
        } finally {
          setIsDecrypting(false);
          setAccessCode("");
        }
      }, 3000);
    } else {
      alert("⚠️ [ACCESS DENIED]: INVALID ENCRYPTION KEY. IP LOGGED.");
    }
  };

  // Safe divide helper to avoid NaN / Infinity rendering issues
  const safeDivide = (numerator: number, denominator: number) => {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return 0;
    }
    return numerator / denominator;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12 font-mono">
      
      {/* Scanner Output Header */}
      <div className="bg-[#050505] border border-[#c87d55] p-6 rounded-xl shadow-lg space-y-2">
        <div className="text-xs text-[#c87d55] leading-relaxed min-h-30">
          {(scannerText ?? []).map((line, idx) => (
            <p key={idx} className={line?.includes("WARNING") ? "text-red-500 font-bold" : ""}>
              {line ?? ""}
            </p>
          ))}
          <span className="inline-block w-2 h-4 bg-[#c87d55] animate-pulse ml-1"></span>
        </div>

      </div>

      {/* Terminal Workstation Header */}
      <header className="border-b border-[#27272a] pb-6 space-y-2">
        <h1 className="text-3xl font-bold text-[#f4f4f5] tracking-wider">
          [ CHRONOVERSE <span className="text-[#c87d55]">INTELLIGENCE TERMINAL</span> ]
        </h1>
        <p className="text-[#00cc66] text-xs">
          SYSTEM STATUS: LIVE // SECURE CONNECTION ESTABLISHED
        </p>
      </header>

      {/* Live Market Feed Ticker Strip — sourced from `/api/market-data`
          (CoinGecko + Yahoo Finance), always rendered with a safe local
          fallback dataset if the live fetch fails, so this widget never
          throws or shows a "MODULE OFFLINE" state. */}
      <div className="bg-[#0f0f0f] border border-[#27272a] rounded-xl p-4 overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-widest text-[#a1a1aa]">
            Live Market Feed
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
              feedSource === "live"
                ? "text-[#00cc66] border-[#00cc66]/40 bg-[#00cc66]/10"
                : feedSource === "partial"
                ? "text-[#c87d55] border-[#c87d55]/40 bg-[#c87d55]/10"
                : "text-[#a1a1aa] border-[#27272a] bg-[#18181b]"
            }`}
          >
            {feedSource === "live" ? "LIVE" : feedSource === "partial" ? "PARTIAL" : "LOCAL CACHE"}
          </span>
        </div>
        <div className="flex gap-4 min-w-max">
          {(liveQuotes ?? []).map((quote, quoteIdx) => {
            const changePercent = quote?.changePercent;
            const isPositive = (changePercent ?? 0) >= 0;
            const price = quote?.price;

            return (
              <div
                key={quote?.symbol ?? `quote-${quoteIdx}`}
                className="flex flex-col min-w-35 bg-[#0a0a0a] border border-[#27272a] rounded-lg px-4 py-3"
              >
                <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wide">
                  {quote?.label ?? quote?.symbol ?? "—"}
                </span>
                <span className="text-sm font-bold text-[#f4f4f5]">
                  {price !== null && price !== undefined
                    ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
                <span className={`text-[11px] font-semibold ${isPositive ? "text-[#00cc66]" : "text-red-500"}`}>
                  {changePercent !== null && changePercent !== undefined
                    ? `${isPositive ? "+" : ""}${changePercent.toFixed(2)}%`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>


      {/* Embedded Live Chart Workstation */}
      <div className="bg-[#0f0f0f] border border-[#27272a] rounded-xl overflow-hidden p-4 space-y-4 shadow-2xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#27272a] pb-3">
          <h2 className="text-lg font-bold text-[#c87d55] uppercase tracking-wider">
            [ ADVANCED MARKET WORKSTATION ]
          </h2>
          <span className="text-[#a1a1aa] text-xs">
            LIVE ANALYTICS & LIQUIDITY MAP
          </span>
        </div>
        
        <div className="w-full h-[550px] min-h-[550px] rounded-lg overflow-hidden border border-[#27272a]">
          <LightweightChart 
            symbol="BTC-USD"
            range="3mo"
            interval="1d"
            chartType="candlestick"
            height={550}
            refreshMs={60000}
          />
        </div>

      </div>

      {/* V_INTEL Simulation Tool */}
      <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-6">
        <h2 className="text-xl font-bold text-[#c87d55] text-center border-b border-[#27272a] pb-4">
          &gt; RUN V_INTEL SIMULATION (ADVANCED)
        </h2>

        {/* Preset Selector */}
        <div className="flex justify-center">
          <select
            value={assetPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="bg-[#0a0a0a] border border-[#27272a] text-[#c87d55] font-bold p-3 rounded-md w-full max-w-md focus:outline-none focus:border-[#c87d55]"
          >
            <option value="custom">[ SELECT ASSET CLASS TO SIMULATE ]</option>
            <option value="fiat">TRADITIONAL FIAT (BANK DEPOSITS)</option>
            <option value="realestate">COMMERCIAL REAL ESTATE</option>
            <option value="crypto">DECENTRALIZED DIGITAL ASSET</option>
            <option value="gold">PHYSICAL GOLD (VAULTED)</option>
          </select>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs text-[#a1a1aa]">
          <div className="space-y-2">
            <label className="block">EXPECTED RETURN: <span className="text-[#f4f4f5] font-bold">{returnVal}%</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={returnVal}
              onChange={(e) => setReturnVal(Number(e.target.value))}
              className="w-full accent-[#c87d55]"
            />
          </div>
          <div className="space-y-2">
            <label className="block">SOVEREIGNTY (S): <span className="text-[#f4f4f5] font-bold">{sovereigntyVal}/10</span></label>
            <input
              type="range"
              min="0"
              max="10"
              value={sovereigntyVal}
              onChange={(e) => setSovereigntyVal(Number(e.target.value))}
              className="w-full accent-[#c87d55]"
            />
          </div>
          <div className="space-y-2">
            <label className="block">VOLATILITY (σ): <span className="text-[#f4f4f5] font-bold">{volatilityVal}%</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={volatilityVal}
              onChange={(e) => setVolatilityVal(Number(e.target.value))}
              className="w-full accent-[#c87d55]"
            />
          </div>
          <div className="space-y-2">
            <label className="block">MACRO-SHOCK (M): <span className="text-red-500 font-bold">{macroVal}%</span></label>
            <input
              type="range"
              min="0"
              max="100"
              value={macroVal}
              onChange={(e) => setMacroVal(Number(e.target.value))}
              className="w-full accent-red-500"
            />
          </div>
        </div>

        {/* Results Display */}
        <div className="text-center space-y-4 pt-4 border-t border-[#27272a]">
          <span className="text-[#a1a1aa] text-xs uppercase tracking-widest">V_INTEL SCORE:</span>
          <div
            className={`text-6xl font-extrabold transition-all ${
              numericVScore < 1.5
                ? "text-red-500"
                : numericVScore <= 4
                ? "text-[#c87d55]"
                : "text-[#00cc66]"
            }`}
          >
            {vScore}
          </div>

          <div
            className={`p-4 rounded-lg border border-dashed text-xs max-w-xl mx-auto ${
              numericVScore < 1.5
                ? "bg-red-950/20 border-red-500 text-red-400"
                : numericVScore <= 4
                ? "bg-[#c87d55]/10 border-[#c87d55] text-[#c87d55]"
                : "bg-green-950/20 border-green-500 text-green-400"
            }`}
          >
            <strong>
              &gt; [ THREAT LEVEL:{" "}
              {numericVScore < 1.5
                ? "CRITICAL"
                : numericVScore <= 4
                ? "ELEVATED"
                : "SECURE"}
              {" "}]
            </strong>
            <br />
            {numericVScore < 1.5
              ? "Asset structure highly vulnerable to fiat confiscation and inflation decay."
              : numericVScore <= 4
              ? "Partial cover but exposed to macroeconomic shocks during liquidity crises."
              : "Sovereign Node established. Asset is mathematically protected from the consensus grid."}
          </div>
        </div>
      </div>

      {/* Systemic Heatmap: The Burning Map */}
      <div className="space-y-6">
        <div className="border-b border-[#27272a] pb-4">
          <h2 className="text-xl font-bold text-[#f4f4f5]">[ THE BURNING MAP ]</h2>
          <p className="text-[#a1a1aa] text-xs">GLOBAL SYSTEMIC HEATMAP // REAL-TIME FRICTION DATA</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#18181b] border border-red-500/50 p-6 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-red-500 font-bold border-b border-red-500/30 pb-2 flex justify-between">
              AMERICAS (USD) <span>[CRITICAL]</span>
            </h3>
            <div className="space-y-2 text-xs text-[#a1a1aa]">
              <p className="flex justify-between">Debt Expansion Rate: <span className="text-red-500 font-bold">+8.4%</span></p>
              <p className="flex justify-between">Purchasing Power Decay: <span className="text-red-500 font-bold">SEVERE</span></p>
              <p className="flex justify-between">Regulatory Friction: <span className="text-[#f4f4f5] font-bold">HIGH</span></p>
            </div>
          </div>

          <div className="bg-[#18181b] border border-[#c87d55]/50 p-6 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-[#c87d55] font-bold border-b border-[#c87d55]/30 pb-2 flex justify-between">
              EUROZONE (EUR) <span>[HIGH]</span>
            </h3>
            <div className="space-y-2 text-xs text-[#a1a1aa]">
              <p className="flex justify-between">Energy Volatility Index: <span className="text-[#c87d55] font-bold">ELEVATED</span></p>
              <p className="flex justify-between">Central Bank Liquidity: <span className="text-[#f4f4f5] font-bold">RESTRICTIVE</span></p>
              <p className="flex justify-between">CBDC Implementation: <span className="text-[#f4f4f5] font-bold">PHASE 2</span></p>
            </div>
          </div>

          <div className="bg-[#18181b] border border-[#00cc66]/50 p-6 rounded-xl space-y-4 shadow-lg">
            <h3 className="text-[#00cc66] font-bold border-b border-[#00cc66]/30 pb-2 flex justify-between">
              MIDDLE EAST (GCC) <span>[STABLE]</span>
            </h3>
            <div className="space-y-2 text-xs text-[#a1a1aa]">
              <p className="flex justify-between">Gold Accumulation: <span className="text-[#00cc66] font-bold">+14.2%</span></p>
              <p className="flex justify-between">Energy Sovereignty: <span className="text-[#00cc66] font-bold">ABSOLUTE</span></p>
              <p className="flex justify-between">Tax Friction: <span className="text-[#f4f4f5] font-bold">MINIMAL</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Sovereignty Audit Quiz */}
      <div className="bg-[#18181b] border border-[#27272a] p-8 rounded-xl space-y-6">
        <div className="text-center border-b border-[#27272a] pb-4 space-y-1">
          <h2 className="text-xl font-bold text-[#f4f4f5]">[ PERSONAL SOVEREIGNTY AUDIT ]</h2>
          <p className="text-[#a1a1aa] text-xs">THE WORLD IS BURNING. ARE YOU EXPOSED?</p>
        </div>

        {!isScanning && !quizCompleted && (
          <div className="space-y-6 max-w-2xl mx-auto">
            {step === 1 && (
              <div className="space-y-4 text-center">
                <p className="text-[#f4f4f5] text-sm font-semibold">
                  &gt; QUESTION 1/3: Where is the majority (&gt;70%) of your wealth currently stored?
                </p>
                <div className="space-y-3">
                  <button onClick={() => handleQuizAnswer(2, 0)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [A] Traditional Banks &amp; Fiat Currency
                  </button>
                  <button onClick={() => handleQuizAnswer(2, 5)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [B] Real Estate &amp; Regulated Stocks
                  </button>
                  <button onClick={() => handleQuizAnswer(2, 10)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [C] Physical Gold &amp; Decentralized Crypto
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 text-center">
                <p className="text-[#f4f4f5] text-sm font-semibold">
                  &gt; QUESTION 2/3: If your central bank freezes accounts tomorrow, how long can you survive?
                </p>
                <div className="space-y-3">
                  <button onClick={() => handleQuizAnswer(3, 0)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [A] Less than 30 days (Total Dependency)
                  </button>
                  <button onClick={() => handleQuizAnswer(3, 5)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [B] 1 to 6 months (Partial Buffer)
                  </button>
                  <button onClick={() => handleQuizAnswer(3, 10)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [C] Indefinitely (Decoupled)
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 text-center">
                <p className="text-[#f4f4f5] text-sm font-semibold">
                  &gt; QUESTION 3/3: What is your primary source of income?
                </p>
                <div className="space-y-3">
                  <button onClick={() => handleQuizAnswer(4, 0)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [A] Corporate Salary mapped to a single jurisdiction
                  </button>
                  <button onClick={() => handleQuizAnswer(4, 5)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [B] Local Business owner
                  </button>
                  <button onClick={() => handleQuizAnswer(4, 10)} className="w-full bg-[#0a0a0a] hover:bg-[#27272a] border border-[#27272a] hover:border-[#c87d55] text-[#c87d55] p-4 rounded-lg text-left text-xs transition-colors">
                    [C] Borderless digital income / Capital gains
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scan Progress Bar */}
        {isScanning && (
          <div className="text-center space-y-4 py-8">
            <p className="text-[#f4f4f5] text-sm">&gt; INITIATING SYSTEMIC SCAN...</p>
            <div className="w-full bg-[#0a0a0a] border border-[#c87d55] h-3 rounded-full overflow-hidden">
              <div className="bg-[#c87d55] h-full transition-all" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-[#c87d55] text-xs font-bold">{statusLog}</p>
          </div>
        )}

        {/* Audit Results */}
        {quizCompleted && (
          <div className="bg-[#0a0a0a] border border-[#c87d55] p-6 rounded-xl text-center space-y-4">
            <h3 className="text-xl font-bold text-[#f4f4f5]">&gt; AUDIT COMPLETE</h3>
            <p className="text-sm text-[#a1a1aa]">
              DIAGNOSIS:{" "}
              <span className={`font-bold ${quizScore <= 10 ? "text-red-500" : quizScore <= 20 ? "text-[#c87d55]" : "text-[#00cc66]"}`}>
                {quizScore <= 10 ? "SYSTEM SLAVE [CRITICAL EXPOSURE]" : quizScore <= 20 ? "THE OBSERVER [PARTIALLY SECURED]" : "SOVEREIGN NODE [DECOUPLED]"}
              </span>
            </p>
            <p className="text-xs text-[#a1a1aa] max-w-md mx-auto leading-relaxed">
              {quizScore <= 10
                ? "Your liquidity is collateralized by the grid. Immediate financial decoupling required."
                : quizScore <= 20
                ? "You are still bound to fiat gateways and vulnerable to localized macroeconomic shocks."
                : "Your assets are uncollateralized and mathematically secured outside the consensus grid."}
            </p>
            <Link href="/reports" className="inline-block bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold px-6 py-2.5 rounded-md text-xs transition-colors">
              ACCESS RESEARCH DOSSIERS
            </Link>
          </div>
        )}
      </div>

      {/* Denominator Engine & Radar Section */}
      <div className="bg-[#18181b] border border-[#27272a] p-8 rounded-xl space-y-6">
        <div className="border-b border-[#27272a] pb-4">
          <h2 className="text-xl font-bold text-[#c87d55]">&gt; THE DENOMINATOR COLLAPSE ENGINE</h2>
          <p className="text-[#a1a1aa] text-xs">STRESS-TESTING ASSETS AGAINST HISTORICAL LIQUIDITY TRAPS.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#00cc66] block mb-1">Total Wealth (Nominal $):</label>
              <input
                type="number"
                value={nomWealth}
                onChange={(e) => setNomWealth(Number(e.target.value) || 0)}
                className="w-full bg-[#0a0a0a] border border-[#27272a] text-[#c87d55] p-3 rounded-md focus:outline-none focus:border-[#c87d55]"
              />
            </div>
            <div>
              <label className="text-xs text-[#00cc66] block mb-1">Select Historical Anchor:</label>
              <select
                value={histAnchor}
                onChange={(e) => setHistAnchor(Number(e.target.value) || 1)}
                className="w-full bg-[#0a0a0a] border border-[#27272a] text-[#c87d55] p-3 rounded-md focus:outline-none focus:border-[#c87d55]"
              >
                <option value={1}>USD (Current Illusion)</option>
                <option value={40}>Gold Standard (1971 Pre-Shock)</option>
                <option value={1000000}>Weimar Mark (1923 Collapse)</option>
                <option value={85}>CBDC Rollout (2026 Simulation)</option>
              </select>
            </div>
            <div className="bg-[#0a0a0a] border-l-4 border-[#c87d55] p-4 rounded-r-lg space-y-1">
              <span className="text-[#a1a1aa] text-xs">TRUE SOVEREIGN PURCHASING POWER:</span>
              <div className="text-2xl font-bold text-[#c87d55]">
                {safeDivide(nomWealth, histAnchor).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                <span className="text-xs text-[#a1a1aa]">UNITS</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-2">
            <h3 className="text-xs font-bold text-[#c87d55]">&gt; V_INTEL SURVIVAL RADAR</h3>
            <div className="w-full max-w-70">
              <Radar data={radarChartData} options={radarOptions} />
            </div>
          </div>
        </div>
      </div>

      {/* Decryption Interface */}
      <div className="bg-[#050505] border border-[#00cc66] p-6 rounded-xl space-y-4">
        <div className="border-b border-[#00cc66]/30 pb-2">
          <span className="text-[#00cc66] text-xs font-bold">[SYSTEM] V_INTEL SECURE DECRYPTION INTERFACE</span>
          <p className="text-[#a1a1aa] text-[10px]">ENCRYPTION: AES-256-GCM // STATUS: WAITING FOR KEY</p>
        </div>

        {!isDecrypting ? (
          <div className="space-y-3">
            <label className="text-xs text-[#00cc66] block">ENTER ACCESS CODE:</label>
            <input
              type="text"
              placeholder="ENTER KEY (e.g. LEMON-70)"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#27272a] text-[#00cc66] p-3 rounded-md focus:outline-none focus:border-[#00cc66]"
            />
            <button
              onClick={handleDecryption}
              className="w-full bg-[#00cc66] hover:bg-[#00b85c] text-black font-bold py-3 rounded-md transition-colors text-xs uppercase"
            >
              EXECUTE DECRYPTION
            </button>
          </div>
        ) : (
          <div className="text-xs text-[#00cc66] space-y-2 leading-relaxed py-4">
            <p>&gt; INITIATING BRUTE FORCE DECRYPTION...</p>
            <p>&gt; BYPASSING FIREWALL [9.2.1.0]...</p>
            <p>&gt; DECRYPTING DATA STREAM [LEMON_70_SEC]...</p>
            <p className="text-[#c87d55] font-bold">&gt; ACCESS GRANTED. REDIRECTING TO SECURE DOSSIER...</p>
          </div>
        )}
      </div>

    </div>
  );
}

export default function TerminalIntelligencePage() {
  return (
    <IntelligenceErrorBoundary>
      <TerminalIntelligenceContent />
    </IntelligenceErrorBoundary>
  );
}
