"use client";

import React from "react";

export default function PrintButton() {
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      aria-label="Print or Export Article as PDF"
      title="Print or Save Article as PDF"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-[#c87d55]/50 rounded transition-colors cursor-pointer print:hidden shadow-sm"
    >
      <span aria-hidden="true">🖨️</span> Print / Export PDF
    </button>
  );
}
