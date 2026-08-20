import React from "react";
import Image from "next/image";
import Link from "next/link";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { urlForOptimized } from "@/sanity/image";
import { SHIMMER_BLUR_DATA_URL } from "@/lib/blurPlaceholder";

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

      const imageUrl = urlForOptimized(value).width(1200).fit("max").url();
      const altText = value.alt || "Article image";

      return (
        <figure className="my-8 w-full">
          <div className="relative w-full h-96 md:h-[28rem] rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
            <Image
              src={imageUrl}
              alt={altText}
              title={value.caption || altText}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-full object-cover"
              loading="lazy"
              placeholder="blur"
              blurDataURL={SHIMMER_BLUR_DATA_URL}
            />
          </div>

          {value.caption && (
            <figcaption className="text-center text-xs text-zinc-400 mt-3 italic">
              {value.caption}
            </figcaption>
          )}
        </figure>
      );
    },
  },
  marks: {
    link: ({ children, value }: { children?: React.ReactNode; value?: { href?: string } }) => {
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
    normal: ({ children }) => <p className="mb-6 leading-[1.85]">{children}</p>,
  },
  list: {
    bullet: ({ children }) => <ul className="list-disc pl-6 mb-6 space-y-2 leading-[1.85]">{children}</ul>,
    number: ({ children }) => <ol className="list-decimal pl-6 mb-6 space-y-2 leading-[1.85]">{children}</ol>,
  },
};

interface PortableTextContentProps {
  value?: PortableTextBlock[] | null;
}

/**
 * Renders structured Sanity Portable Text `body` content.
 */
export default function PortableTextContent({ value }: PortableTextContentProps) {
  if (!value || value.length === 0) return null;

  return <PortableText value={value} components={components} />;
}
