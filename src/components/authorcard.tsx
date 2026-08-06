import { client } from "@/sanity/client";

interface AuthorCardProps {
  authorName?: string;
}

interface SanityAuthor {
  name: string | null;
  role: string | null;
  bio: string | null;
}

export default async function AuthorCard({ authorName }: AuthorCardProps) {
  const authorData = {
    name: authorName || "Ahmed Abdel-Fattah",
    role: "Lead Financial Researcher & Strategist",
    bio: "Responsible for macro-strategy, asset correlation modeling, and institutional capital flows analysis.",
  };

  try {
    const sanityAuthor = await client.fetch<SanityAuthor | null>(
      `*[_type == "author" && name == $name][0]{ name, role, bio }`,
      { name: authorData.name }
    );
    if (sanityAuthor) {
      if (sanityAuthor.name) authorData.name = sanityAuthor.name;
      if (sanityAuthor.role) authorData.role = sanityAuthor.role;
      if (sanityAuthor.bio) authorData.bio = sanityAuthor.bio;
    }
  } catch (err) {
    // Fallback quietly if fetch fails
  }

  // Generate initials safely, handling any extra whitespace
  const initials = authorData.name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mt-12 border-t border-b border-zinc-800 py-6 my-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 print:hidden bg-zinc-950/20 px-4">
      <div className="w-14 h-14 rounded-none bg-zinc-900 border border-zinc-700 flex items-center justify-center text-sm font-mono tracking-wider text-[#c87d55] shrink-0 shadow-inner">
        [{initials || "A"}]
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-100 font-bold">{authorData.name}</h3>
          <span className="text-[9px] font-mono border border-[#c87d55]/30 text-[#c87d55] px-2 py-0.5 rounded-none font-semibold uppercase tracking-widest bg-[#c87d55]/5">
            Contributor
          </span>
        </div>
        <p className="text-xs text-zinc-400 font-sans tracking-wide font-medium">{authorData.role}</p>
        <p className="text-xs text-zinc-500 leading-relaxed font-sans max-w-2xl">{authorData.bio}</p>
      </div>
    </div>
  );
}
