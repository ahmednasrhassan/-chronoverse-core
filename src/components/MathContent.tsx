"use client";

import { useEffect, useRef } from "react";
import type katexType from "katex";

interface MathContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Client-side LaTeX Math Renderer.
 *
 * Since article content can arrive either as structured Sanity Portable Text
 * (rendered via `PortableTextContent`) or as raw legacy Blogger HTML
 * (rendered via `dangerouslySetInnerHTML`), we can't rely on a markdown-only
 * pipeline (remark-math/rehype-katex) which expects a markdown AST. Instead,
 * this wrapper walks the rendered DOM after mount/hydration and converts any
 * `$$...$$` (block/display) or `$...$` (inline) LaTeX expressions found in
 * text nodes into properly formatted KaTeX markup — covering both content
 * pipelines uniformly with a single implementation.
 *
 * Example: "$$V_{crisis} = \\sum P_i \\times S_i$$" renders as a clean,
 * centered display equation instead of raw text.
 *
 * Performance: the (relatively heavy) `katex` package is now lazily
 * `import()`-ed only when a `$`/`$$` delimiter is actually detected in the
 * rendered content, instead of being bundled into every page's initial JS
 * chunk — keeping first paint fast on the vast majority of articles that
 * contain no math at all.
 */
export default function MathContent({ children, className }: MathContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes("$")) {
        // Skip text nodes inside <script>/<style> or already-rendered KaTeX output
        const parentEl = node.parentElement;
        if (parentEl && parentEl.closest(".katex, script, style")) continue;
        textNodes.push(node as Text);
      }
    }

    // Nothing to render — bail out before ever loading the KaTeX bundle.
    if (textNodes.length === 0) return;

    let cancelled = false;

    const renderMath = (katex: typeof katexType) => {
      if (cancelled) return;

      const mathRegex = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;

      textNodes.forEach((textNode) => {
        const text = textNode.textContent || "";
        mathRegex.lastIndex = 0;
        if (!mathRegex.test(text)) return;
        mathRegex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = mathRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }

          const isBlock = match[1] !== undefined;
          const formula = (match[1] ?? match[2] ?? "").trim();
          const el = document.createElement(isBlock ? "div" : "span");
          if (isBlock) {
            el.className = "my-6 overflow-x-auto";
          }

          try {
            katex.render(formula, el, {
              throwOnError: false,
              displayMode: isBlock,
            });
          } catch {
            el.textContent = match[0];
          }

          fragment.appendChild(el);
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
      });
    };

    import("katex").then(({ default: katex }) => renderMath(katex));

    return () => {
      cancelled = true;
    };
  }, [children]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
