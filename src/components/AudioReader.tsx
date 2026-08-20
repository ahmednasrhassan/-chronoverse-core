"use client";

import { useState, useEffect } from "react";

interface AudioReaderProps {
  textToRead: string;
}

export default function AudioReader({ textToRead }: AudioReaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    // إيقاف الصوت تلقائياً إذا خرج القارئ من الصفحة
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleTogglePlay = () => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in your browser.");
      return;
    }

    const synth = window.speechSynthesis;

    if (isPlaying) {
      if (isPaused) {
        synth.resume();
        setIsPaused(false);
      } else {
        synth.pause();
        setIsPaused(true);
      }
    } else {
      synth.cancel(); // تنظيف أي صوت سابق
      
      const cleanText = textToRead.replace(/[#*`_]/g, ""); // تنظيف وسوم الماركداون
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95; // سرعة هادئة ومؤسسية
      utterance.pitch = 1.0;

      // اختيار صوت إنجليزي طبيعي إذا توفر في النظام
      const voices = synth.getVoices();
      const naturalVoice = voices.find(
        (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Premium"))
      );
      if (naturalVoice) utterance.voice = naturalVoice;

      utterance.onend = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      synth.speak(utterance);
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  const handleStop = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 bg-[#161616] my-6 max-w-fit">
      <button
        onClick={handleTogglePlay}
        className="flex items-center gap-2 text-xs font-mono tracking-wider uppercase font-semibold text-[#c87d55] hover:text-[#d9916b] transition-colors"
      >
        <span className="relative flex h-2.5 w-2.5">
          {isPlaying && !isPaused && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c87d55] opacity-75"></span>
          )}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPlaying && !isPaused ? "bg-[#c87d55]" : "bg-zinc-600"}`}></span>
        </span>
        {isPlaying ? (isPaused ? "Resume Audio" : "Pause Audio") : "Listen to Briefing (AI Audio)"}
      </button>

      {isPlaying && (
        <button
          onClick={handleStop}
          className="text-zinc-500 hover:text-zinc-300 text-xs font-mono ml-2 border-l border-zinc-700 pl-3 transition-colors"
        >
          Stop
        </button>
      )}
    </div>
  );
}