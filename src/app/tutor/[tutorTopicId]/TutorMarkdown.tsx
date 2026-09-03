"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// remark-math only recognizes $...$ / $$...$$ — Maizey (and some of our
// own gateway's replies) use the \(...\) / \[...\] LaTeX delimiters
// instead, which would otherwise render as literal backslash-brackets.
// Convert before handing off to remark-math rather than trying to teach
// it a second delimiter syntax.
function normalizeLatexDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, expr: string) => `$$${expr}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, expr: string) => `$${expr}$`);
}

// Tutor replies (both our own gateway and Maizey) come back as GFM
// markdown — bold, lists, code fences — and, for anything quantitative,
// LaTeX math. Rendered raw as plain text (the original behavior) that
// showed up as literal asterisks and backslash brackets. `prose`
// (Tailwind Typography) gives sane default spacing/type for all of it
// without hand-styling every element; `prose-invert` mirrors that in
// dark mode.
export function TutorMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2 prose-ul:my-2 prose-ol:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeLatexDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}
