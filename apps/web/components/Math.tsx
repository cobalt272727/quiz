"use client";

import katex from "katex";
import { useMemo } from "react";

/** KaTeX は trust: false / maxSize / maxExpand を必ず設定する(§9) */
export function MathSpan({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        trust: false,
        displayMode: display,
        maxSize: 50,
        maxExpand: 1000,
        strict: "ignore",
        output: "html",
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (html === null) return <code>{tex}</code>;
  if (display) {
    return <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
