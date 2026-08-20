import React from 'react';

const socialLinks = {
  linkedin: "https://www.linkedin.com/in/ahmed-n-hassan-09b739238",
  twitter: "https://x.com/ChronoVerseCap",
  reddit: "https://www.reddit.com/u/Prestigious_Mine_321/s/Pd8RhR79Z4",
  pinterest: "https://pin.it/5qmsex75a",
};

interface IconProps {
  className?: string;
}

// 1. LinkedIn Icon
export const LinkedInIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <a
    href={socialLinks.linkedin}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="LinkedIn"
    className="text-zinc-400 hover:text-[#0a66c2] transition-colors duration-200 inline-flex items-center justify-center"
  >
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.7a1.62 1.62 0 1 0 0 3.24 1.62 1.62 0 0 0 0-3.24z" />
    </svg>
  </a>
);

// 2. X (Twitter) Icon
export const TwitterIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <a
    href={socialLinks.twitter}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="X (formerly Twitter)"
    className="text-zinc-400 hover:text-white transition-colors duration-200 inline-flex items-center justify-center"
  >
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  </a>
);

// 3. Reddit Icon
export const RedditIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <a
    href={socialLinks.reddit}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Reddit"
    className="text-zinc-400 hover:text-[#ff4500] transition-colors duration-200 inline-flex items-center justify-center"
  >
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.363.043-.538A1.758 1.758 0 0 1 4.08 12.00a1.754 1.754 0 0 1 1.754-1.754c.463 0 .898.18 1.207.49 1.194-.858 2.85-1.419 4.674-1.488l.944-4.42 3.25.688a1.25 1.25 0 0 1 1.102-.772zm-7.01 7.252a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm4 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm-5.02 4.148a.38.38 0 0 0-.268.65 5.56 5.56 0 0 0 3.288 1.05 5.56 5.56 0 0 0 3.288-1.05.38.38 0 0 0-.268-.65 4.805 4.805 0 0 1-3.02.83 4.805 4.805 0 0 1-3.02-.83z" />
    </svg>
  </a>
);

// 4. Pinterest Icon
export const PinterestIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <a
    href={socialLinks.pinterest}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Pinterest"
    className="text-zinc-400 hover:text-[#e60023] transition-colors duration-200 inline-flex items-center justify-center"
  >
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.367 18.592 0 12.017 0z" />
    </svg>
  </a>
);

export default function SocialGroup({ className = "flex items-center gap-4" }: { className?: string }) {
  return (
    <nav aria-label="Social media profiles" className={className}>
      <LinkedInIcon />
      <TwitterIcon />
      <RedditIcon />
      <PinterestIcon />
    </nav>
  );
}
