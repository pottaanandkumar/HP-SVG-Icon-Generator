"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/svgClientUtils";

export function CodeCard({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-w-0 rounded-2xl bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-1.5 text-sm font-medium text-brand hover:bg-black/5"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[220px] overflow-auto rounded-lg bg-code-bg p-4 text-xs leading-relaxed text-code-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}
