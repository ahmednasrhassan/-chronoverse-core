"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import MarketQuoteCard, {
  type MarketQuote,
} from "./MarketQuoteCard";

interface MarketDefinition {
  symbol: string;
  label: string;
  href: string;
}

interface MarketQuoteGroupProps {
  markets: MarketDefinition[];
}

const REFRESH_MS =
  15 * 60 * 1000;

export default function MarketQuoteGroup({
  markets,
}: MarketQuoteGroupProps) {
  const [quotes, setQuotes] =
    useState<
      Record<
        string,
        MarketQuote
      >
    >({});

  const lastFetchedAtRef =
    useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function loadQuotes() {
      try {
        const symbols =
          markets
            .map(
              ({ symbol }) =>
                symbol
            )
            .join(",");

        const response =
          await fetch(
            `/api/market-data?symbols=${encodeURIComponent(
              symbols
            )}`,
            {
              cache: "no-store",
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response
            .json()
            .catch(
              () => null
            );

        const receivedQuotes:
          MarketQuote[] =
          Array.isArray(
            data?.quotes
          )
            ? data.quotes
            : [];

        if (!isMounted) {
          return;
        }

        const nextQuotes:
          Record<
            string,
            MarketQuote
          > = {};

        for (
          const quote of
          receivedQuotes
        ) {
          if (
            quote?.symbol
          ) {
            nextQuotes[
              quote.symbol
            ] = quote;
          }
        }

        setQuotes(
          nextQuotes
        );

        lastFetchedAtRef.current =
          Date.now();
      } catch (error) {
        console.error(
          "[Chronoverse Markets] Failed to load homepage market quotes:",
          error
        );
      }
    }

    function refreshIfNeeded() {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      const elapsed =
        Date.now() -
        lastFetchedAtRef.current;

      if (
        elapsed >=
        REFRESH_MS
      ) {
        void loadQuotes();
      }
    }

    void loadQuotes();

    const timer =
      window.setInterval(
        refreshIfNeeded,
        REFRESH_MS
      );

    document.addEventListener(
      "visibilitychange",
      refreshIfNeeded
    );

    return () => {
      isMounted = false;

      window.clearInterval(
        timer
      );

      document.removeEventListener(
        "visibilitychange",
        refreshIfNeeded
      );
    };
  }, [markets]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {markets.map(
        ({
          symbol,
          label,
          href,
        }) => (
          <Link
            key={symbol}
            href={href}
            aria-label={`Open ${label} chart`}
            className="block bg-[#18181b] border border-zinc-800 p-3 rounded-xl h-40 shadow-lg shadow-black/40 hover:border-[#c87d55]/50 transition-colors cursor-pointer"
          >
            <MarketQuoteCard
              symbol={symbol}
              label={label}
              quote={
                quotes[
                  symbol
                ] ?? null
              }
            />
          </Link>
        )
      )}
    </div>
  );
}