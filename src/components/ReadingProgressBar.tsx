"use client";

import React, { useEffect, useState } from "react";

/**
 * Elegant top Reading Progress Bar.
 * Tracks how far the reader has scrolled through the document and renders
 * a slim gradient bar fixed to the top of the viewport. Automatically
 * hidden when printing.
 */
export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, scrolled)));
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    };

    updateProgress();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 w-full h-1 z-50 bg-zinc-900/40 print:hidden pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    >
      <div
        className="h-full bg-[linear-gradient(to_right,#c87d55,#d97706,#c87d55)] shadow-[0_0_8px_rgba(200,125,85,0.6)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
