"use client";

export default function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-md transition-colors border border-zinc-700 cursor-pointer"
      title="Print or Save Article as PDF"
    >
      <span>🖨️</span> Print / Export PDF
    </button>
  );
}