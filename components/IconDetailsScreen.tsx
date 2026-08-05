"use client";

import { ArrowLeft, FileCode2, FileImage, Check, X } from "lucide-react";
import { IconSwatch } from "@/components/IconSwatch";
import { CodeCard } from "@/components/CodeCard";
import { copyToClipboard, downloadSvg, svgToPngBlob, downloadBlob, slugify, applyIconStyle } from "@/lib/svgClientUtils";
import { parseSvgFacts } from "@/lib/iconReport";
import { computeDesignScore, computeSizeValidation } from "@/lib/iconScoring";
import type { AgentAnalysis, IconSizeKey } from "@/lib/types";
import { ICON_SIZE_LABEL, ICON_SIZE_PX } from "@/lib/types";

const PREVIEW_SIZES = [16, 20, 24, 32, 48, 64];

/**
 * A full in-app screen (not a popped-out document) so it shares state with
 * the generator directly -- the icons it shows are the exact same
 * resultIcons array from IconGeneratorWorkspace, not a re-fetched or
 * serialized copy. Navigating here and back via onBack never re-runs
 * generation or loses anything the agent produced.
 */
export function IconDetailsScreen({
  icons,
  activeIndex,
  onSelectIndex,
  queryName,
  description,
  size,
  color,
  libraryNote,
  analysis,
  onBack,
}: {
  icons: string[];
  activeIndex: number;
  onSelectIndex: (i: number) => void;
  queryName: string;
  description: string;
  size: IconSizeKey;
  color: string | null;
  libraryNote: string;
  analysis: AgentAnalysis | null;
  onBack: () => void;
}) {
  const active = icons[activeIndex] ?? icons[0] ?? "";
  const facts = parseSvgFacts(active);
  const pxSize = ICON_SIZE_PX[size];
  const exportSvg = applyIconStyle(active, color, pxSize);
  const fileBase = `${slugify(queryName)}-option-${activeIndex + 1}`;

  // Computed, rule-based comparison -- not the agent's own output. See
  // lib/iconScoring.ts for exactly what's checked and why; every section
  // built from this is labeled "computed" in the UI so it's never read as
  // an AI judgment.
  const allScores = icons.map((svg) => computeDesignScore(svg));
  const activeScore = allScores[activeIndex];
  const topScore = Math.max(...allScores.map((s) => s.total));
  const topIndex = allScores.findIndex((s) => s.total === topScore);
  const sizeValidation = computeSizeValidation(active, PREVIEW_SIZES);

  const semanticRows = [
    analysis?.semanticMatch ? { label: "Semantic Match", body: analysis.semanticMatch } : null,
    analysis?.namedFeatureResearch
      ? { label: "Named-Feature Research", body: analysis.namedFeatureResearch }
      : null,
  ].filter((r): r is { label: string; body: string } => r !== null);

  const dnaCells = [
    { l: "Grid", v: `viewBox ${facts.viewBox}` },
    { l: "Stroke width", v: facts.strokeWidth },
    { l: "Line cap", v: facts.strokeLinecap },
    { l: "Line join", v: facts.strokeLinejoin },
    { l: "Fill", v: facts.fill },
    {
      l: "Elements",
      v: `${facts.totalElements} total (${facts.elementCounts.map((e) => `${e.count} ${e.tag}`).join(", ") || "none"})`,
    },
    { l: "Color", v: color ?? "Auto (currentColor)" },
    { l: "Requested size", v: `${ICON_SIZE_LABEL[size]} (${pxSize}px)` },
  ];

  async function exportPng() {
    const blob = await svgToPngBlob(exportSvg);
    downloadBlob(blob, `${fileBase}.png`);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-ink hover:bg-black/5"
        >
          <ArrowLeft size={14} /> Back to Icon Generator
        </button>
        <p className="text-xs text-muted">
          Your {icons.length} generated icon{icons.length === 1 ? "" : "s"} stay right here — go
          back any time to download or copy them.
        </p>
      </div>

      {/* Header */}
      <div className="rounded-2xl bg-[#1c1c1e] p-6 text-white shadow-sm">
        <p className="mb-2 inline-block rounded bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
          HP Echo — Icon Report
        </p>
        <h2 className="text-2xl font-semibold capitalize">{queryName}</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/70">
          {description || analysis?.semanticMatch || "AI-generated icon options for review."}
        </p>
        <div className="mt-5 flex flex-wrap gap-8 border-t border-white/10 pt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Mode</p>
            <p className="mt-1 text-xs font-semibold text-white/85">AI Research Agent</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Options generated
            </p>
            <p className="mt-1 text-xs font-semibold text-white/85">{icons.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Grid</p>
            <p className="mt-1 text-xs font-semibold text-white/85">{facts.viewBox}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Viewing
            </p>
            <p className="mt-1 text-xs font-semibold text-white/85">
              Option {activeIndex + 1} of {icons.length}
            </p>
          </div>
        </div>
      </div>

      {libraryNote && (
        <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-900">
          {libraryNote}
        </div>
      )}

      {semanticRows.length > 0 && (
        <div className="rounded-2xl bg-surface p-6 shadow-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            Agent Reasoning
          </p>
          <h3 className="mb-4 text-lg font-semibold text-ink">Semantic Analysis</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {semanticRows.map((r) => (
              <div key={r.label} className="rounded-xl border border-black/5 bg-panel p-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand">
                  {r.label}
                </p>
                <p className="text-sm leading-relaxed text-ink/80">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis && analysis.structuralApproaches.length > 0 && (
        <div className="rounded-2xl bg-surface p-6 shadow-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            Agent Reasoning
          </p>
          <h3 className="mb-1 text-lg font-semibold text-ink">Design Space Explored</h3>
          <p className="mb-4 text-xs text-muted">
            The agent explored {analysis.structuralApproaches.length} distinct structural
            approaches before producing the {icons.length} option{icons.length === 1 ? "" : "s"}{" "}
            below.
          </p>
          <ol className="flex flex-col gap-2">
            {analysis.structuralApproaches.map((approach, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-black/5 bg-panel p-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand/10 text-[10px] font-semibold text-brand">
                  {i + 1}
                </span>
                <span className="text-sm text-ink/80">{approach}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Preview + Design Facts */}
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
              Selected Option {activeIndex + 1}
            </p>
            <h3 className="text-lg font-semibold text-ink">Preview &amp; Design Facts</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportPng}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <FileImage size={14} /> PNG
            </button>
            <button
              onClick={() => downloadSvg(exportSvg, `${fileBase}.svg`)}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <FileCode2 size={14} /> SVG
            </button>
            <button
              onClick={() => copyToClipboard(exportSvg)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Copy SVG
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 rounded-xl bg-[#f5f5f7] py-10">
          <div className="flex flex-col items-center gap-2">
            <IconSwatch svg={active} mode="light" color={color} size={140} iconSize={pxSize} />
            <span className="text-xs text-muted">Light mode</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <IconSwatch svg={active} mode="dark" color={color} size={140} iconSize={pxSize} />
            <span className="text-xs text-muted">Dark mode</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dnaCells.map((c) => (
            <div key={c.l} className="rounded-lg border border-black/5 bg-panel p-3">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                {c.l}
              </p>
              <p className="break-words text-sm font-medium text-ink">{c.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Design-system fit score -- computed, not agent-provided */}
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
              Computed · Not from the agent
            </p>
            <h3 className="text-lg font-semibold text-ink">
              Design-System Fit Score — Option {activeIndex + 1}
            </h3>
            <p className="mt-1 max-w-xl text-xs text-muted">
              A rule-based check against Echo&apos;s grid/stroke/complexity conventions and real
              small-size legibility math — run on this icon&apos;s actual SVG, not an AI opinion.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-black/5 bg-panel px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-ink">{activeScore.total}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted">out of 100</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {activeScore.checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center gap-3 rounded-lg border border-black/5 bg-panel p-3"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  check.pass ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {check.pass ? <Check size={12} /> : <X size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{check.label}</p>
                <p className="truncate text-xs text-muted">{check.detail}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted">
                {check.points}/{check.maxPoints}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Size preview */}
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
          Selected Option {activeIndex + 1}
        </p>
        <h3 className="mb-4 text-lg font-semibold text-ink">Size Preview</h3>
        <div className="flex flex-wrap items-end gap-6 rounded-xl border border-black/5 bg-panel p-5">
          {PREVIEW_SIZES.map((px) => (
            <div key={px} className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-medium text-muted">{px}px</span>
              <div className="flex min-h-16 items-center justify-center">
                <IconSwatch svg={active} mode="light" color={color} size={px} iconSize={px} />
              </div>
            </div>
          ))}
        </div>

        <p className="mb-1 mt-6 text-[10px] font-semibold uppercase tracking-widest text-brand">
          Computed · Not from the agent
        </p>
        <h4 className="mb-1 text-sm font-semibold text-ink">Accessibility Size Validation</h4>
        <p className="mb-3 text-xs text-muted">
          Real math, not a guess: stroke-width scaled to each render size, checked against a
          ≥0.75px minimum-legibility threshold.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {sizeValidation.map((v) => (
            <div
              key={v.px}
              className={`rounded-lg border p-3 text-center ${
                v.pass ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <p className="text-[10px] font-medium text-muted">{v.px}px</p>
              <p className="mt-1 text-xs font-semibold text-ink">
                {v.effectiveStrokePx.toFixed(2)}px stroke
              </p>
              <p
                className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                  v.pass ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {v.pass ? "Pass" : "Caution"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Compare all options */}
      {icons.length > 1 && (
        <div className="rounded-2xl bg-surface p-6 shadow-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            Compare
          </p>
          <h3 className="mb-1 text-lg font-semibold text-ink">
            All {icons.length} Options — click to inspect
          </h3>
          <p className="mb-4 text-xs text-muted">
            Score badges are a computed rule-based check (grid, fill, stroke, complexity,
            legibility) — not an AI ranking.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {icons.map((svg, i) => {
              const f = parseSvgFacts(svg);
              const isActive = i === activeIndex;
              const isTop = i === topIndex;
              return (
                <button
                  key={i}
                  onClick={() => onSelectIndex(i)}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 ${
                    isActive ? "border-brand bg-brand/5" : "border-transparent bg-[#f5f5f7] hover:bg-black/5"
                  }`}
                >
                  {isTop && (
                    <span className="absolute -top-2 -right-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                      Top score
                    </span>
                  )}
                  <IconSwatch svg={svg} mode="light" color={color} size={56} iconSize={28} />
                  <span className="text-xs font-medium text-ink">Option {i + 1}</span>
                  <span className="text-[10px] text-muted">
                    {f.totalElements} element{f.totalElements === 1 ? "" : "s"} ·{" "}
                    {allScores[i].total}/100
                  </span>
                  {isActive && (
                    <span className="rounded bg-brand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggested pick -- computed, explicitly not the agent's own verdict */}
      {icons.length > 1 && (
        <div className="rounded-2xl border-2 border-brand/30 bg-surface p-6 shadow-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            Computed Suggestion · Not the agent&apos;s recommendation
          </p>
          <h3 className="mb-1 text-lg font-semibold text-ink">
            Option {topIndex + 1} scores highest — {topScore}/100
          </h3>
          <p className="mb-4 max-w-2xl text-sm text-ink/70">
            Based on the rule-based checks above (grid conformance, outlined fill, stroke
            definition, complexity, and 16px legibility) — not an AI judgment call. Review the
            actual previews above before deciding; this is a starting point, not a verdict.
          </p>
          <div className="flex items-center gap-4 rounded-xl border border-black/5 bg-panel p-4">
            <IconSwatch svg={icons[topIndex]} mode="light" color={color} size={64} iconSize={32} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Option {topIndex + 1}</p>
              <p className="text-xs text-muted">
                {allScores[topIndex].checks.filter((c) => c.pass).length} of{" "}
                {allScores[topIndex].checks.length} checks passed
              </p>
            </div>
            {topIndex !== activeIndex && (
              <button
                onClick={() => onSelectIndex(topIndex)}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
              >
                View Option {topIndex + 1}
              </button>
            )}
          </div>
        </div>
      )}

      <CodeCard title={`SVG Code — Option ${activeIndex + 1}`} code={exportSvg} />
    </div>
  );
}
