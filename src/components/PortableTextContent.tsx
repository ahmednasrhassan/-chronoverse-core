import Image from "next/image";
import Link from "next/link";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { urlFor } from "@/sanity/image";

interface SanityImageValue {
  _type: "image";
  asset?: {
    _ref?: string;
    _id?: string;
  };
  alt?: string;
  caption?: string;
}

const components: PortableTextComponents = {
  types: {
    image: ({ value }: { value: SanityImageValue }) => {
      if (!value?.asset) return null;

      const imageUrl = urlFor(value).width(1200).fit("max").auto("format").url();

      return (
        <figure className="my-8 w-full">
          <div className="relative w-full h-96 md:h-[28rem] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
            <Image
              src={imageUrl}
              alt={value.alt || "Article image"}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-full object-cover"
            />
          </div>
          {value.caption && (
            <figcaption className="text-center text-xs text-zinc-500 mt-3 italic">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
  },
  marks: {
    link: ({ children, value }) => {
      const href = value?.href || "#";
      const isInternal = href.startsWith("/") || href.startsWith("#");
      if (isInternal) {
        return (
          <Link href={href} className="text-[#c87d55] hover:text-[#e09870] underline">
            {children}
          </Link>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-[#c87d55] hover:text-[#e09870] underline"
        >
          {children}
        </a>
      );
    },
  },
  block: {
    h2: ({ children }) => (
      <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 mt-10 mb-4">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl md:text-2xl font-bold text-zinc-100 mt-8 mb-3">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-lg font-bold text-zinc-100 mt-6 mb-2">{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-[#c87d55] pl-5 italic text-zinc-300 my-6">
        {children}
      </blockquote>
    ),
    normal: ({ children }) => <p className="mb-5 leading-relaxed">{children}</p>,
  },
  list: {
    bullet: ({ children }) => <ul className="list-disc pl-6 mb-5 space-y-2">{children}</ul>,
    number: ({ children }) => <ol className="list-decimal pl-6 mb-5 space-y-2">{children}</ol>,
  },
};

interface PortableTextContentProps {
  value: PortableTextBlock[] | null | undefined;
}

/**
 * Renders structured Sanity Portable Text `body` content — used as the
 * primary article renderer for posts authored directly in the Studio
 * (as opposed to legacy Blogger-imported `legacyBody` raw HTML, which is
 * rendered separately via `dangerouslySetInnerHTML`).
 */
export default function PortableTextContent({ value }: PortableTextContentProps) {
  if (!value || value.length === 0) return null;

  return <PortableText value={value} components={components} />;
}
