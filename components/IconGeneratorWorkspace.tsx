"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileImage, FileCode2, Loader2, Sparkles } from "lucide-react";
import { IconSwatch } from "@/components/IconSwatch";
import { CodeCard } from "@/components/CodeCard";
import {
  copyToClipboard,
  downloadAllAsZip,
  downloadSvg,
  svgToPngBlob,
  downloadBlob,
  slugify,
  applyIconStyle,
} from "@/lib/svgClientUtils";
import type { RepoIconMatch, IconSizeKey, IconStateKey } from "@/lib/types";
import { ICON_SIZE_PX, ICON_SIZE_LABEL, ICON_STATE_LABEL, COLOR_SWATCHES } from "@/lib/types";

type RepoStatus = "idle" | "searching" | "found" | "not-found";
type ResultsStatus = "idle" | "loading" | "ready" | "error";

const ALL_SIZES: IconSizeKey[] = ["xs", "s", "m", "l", "xl"];
const ALL_STATES: IconStateKey[] = ["default", "hover", "active", "disabled"];

export function IconGeneratorWorkspace() {
  const [query, setQuery] = useState("");
  const [repoStatus, setRepoStatus] = useState<RepoStatus>("idle");
  const [repoMatch, setRepoMatch] = useState<RepoIconMatch | null>(null);
  const [resultsStatus, setResultsStatus] = useState<ResultsStatus>("idle");
  const [resultsError, setResultsError] = useState("");
  const [resultIcons, setResultIcons] = useState<string[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [libraryNote, setLibraryNote] = useState("");

  const [description, setDescription] = useState("");
  const [size, setSize] = useState<IconSizeKey>("m");
  const [color, setColor] = useState<string | null>(null);
  const [states, setStates] = useState<IconStateKey[]>(["default", "active"]);

  function toggleState(key: IconStateKey) {
    setStates((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name) return;

    setRepoStatus("searching");
    setRepoMatch(null);
    setResultsStatus("loading");
    setResultsError("");
    setResultIcons([]);
    setLibraryNote("");

    // 1. Repo search — fast, shows immediately if found.
    try {
      const searchRes = await fetch(`/api/icons/search?name=${encodeURIComponent(name)}`);
      const searchData = await searchRes.json();
      if (searchData.matches?.length > 0) {
        setRepoMatch(searchData.matches[0]);
        setRepoStatus("found");
      } else {
        setRepoStatus("not-found");
      }
    } catch {
      setRepoStatus("not-found");
    }

    // 2. Icon options come exclusively from the AI research agent's own
    // response — icon_name and icon_description are both sent to it, and
    // whatever it returns (up to however many variants it generates) is
    // shown as-is, with no library/keyword-search icons mixed in.
    try {
      const res = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconName: name, description: description.trim(), size, color, states }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }

      setResultIcons(data.svgs ?? []);
      setActiveResultIndex(0);
      setLibraryNote(data.libraryNote ?? "");

      if (!data.ok) {
        // Agent responded but produced no usable icons -- a real content
        // failure, distinct from the network/exception path below. Route it
        // to the same "error" status so the message actually renders instead
        // of silently landing on "ready" with an empty icon list.
        setResultsError(data.error ?? "The research agent didn't return any icon markup.");
        setResultsStatus("error");
      } else {
        setResultsStatus("ready");
      }
    } catch (err) {
      setResultsStatus("error");
      setResultsError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const isLoading = repoStatus === "searching" || resultsStatus === "loading";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[560px_1fr]">
      {/* Config column */}
      <section className="h-fit rounded-2xl bg-surface p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-ink">Configuration</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink" htmlFor="icon-name">
              Icon name
            </label>
            <input
              id="icon-name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. printer, shopping-cart, calendar…"
              className="rounded-lg border border-black/10 bg-panel px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <p className="text-xs text-muted">
              We&apos;ll show a repo match immediately if found, and always run the AI research
              agent too — its results appear below once ready.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink" htmlFor="icon-description">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="icon-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. show paper sheets entering a tray from the side, minimal line style…"
              rows={3}
              className="resize-none rounded-lg border border-black/10 bg-panel px-4 py-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
            <p className="text-xs text-muted">
              Only used by the research agent — the repo search matches on name alone.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Size</p>
            <div className="flex gap-2">
              {ALL_SIZES.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSize(key)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                    size === key ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
                  }`}
                >
                  {ICON_SIZE_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Color</p>
              <p className="text-xs text-muted">
                {color === null
                  ? "Auto (ink in light, white in dark)"
                  : "Custom — click again or Auto to revert"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`flex h-7 items-center rounded-full border-2 px-3 text-xs font-medium ${
                  color === null
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-black/10 text-muted hover:bg-black/5"
                }`}
              >
                Auto
              </button>
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor((prev) => (prev === swatch ? null : swatch))}
                  aria-label={`Use color ${swatch}`}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    backgroundColor: swatch,
                    borderColor: color === swatch ? "#5b5bd6" : "rgba(0,0,0,0.1)",
                  }}
                />
              ))}
              <input
                type="color"
                value={color ?? "#1c1c1e"}
                onChange={(e) => setColor(e.target.value)}
                title="Custom color"
                className="h-7 w-7 cursor-pointer rounded-full border border-black/10 bg-transparent p-0"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Icon State</p>
            <div className="flex flex-col gap-1.5">
              {ALL_STATES.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-panel px-3 py-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={states.includes(key)}
                    onChange={() => toggleState(key)}
                    className="accent-brand"
                  />
                  {ICON_STATE_LABEL[key]}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isLoading ? "Working…" : "Generate Icon"}
          </button>
        </form>
      </section>

      {/* Output column */}
      <section className="flex min-w-0 flex-col gap-6">
        {repoStatus === "idle" && resultsStatus === "idle" && (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-surface text-sm text-muted shadow-sm">
            Enter an icon name to get started.
          </div>
        )}

        {repoStatus === "searching" && (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-surface text-sm text-muted shadow-sm">
            <Loader2 size={20} className="animate-spin text-brand" />
            Searching the icon repo…
          </div>
        )}

        {repoStatus === "found" && repoMatch && (
          <RepoIconPreview icon={repoMatch} size={size} color={color} states={states} />
        )}

        {libraryNote && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <p>{libraryNote}</p>
          </div>
        )}

        {resultsStatus === "loading" && (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-6 text-center text-sm text-muted shadow-sm">
            <Loader2 size={20} className="animate-spin text-brand" />
            <div>
              <p className="font-medium text-ink">Running market analysis and asking the research agent…</p>
              <p className="mt-1 text-xs text-muted">
                Market analysis is fast; the AI agent can take up to ~2 minutes.
              </p>
            </div>
          </div>
        )}

        {resultsStatus === "error" && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="text-amber-800">{resultsError}</p>
          </div>
        )}

        {resultsStatus === "ready" && resultIcons.length > 0 && (
          <AgentIconPreview
            icons={resultIcons}
            labels={[]}
            activeIndex={activeResultIndex}
            onSelect={setActiveResultIndex}
            queryName={query}
            size={size}
            color={color}
            states={states}
            heading="Icon options"
            subheading={`The AI research agent generated ${resultIcons.length} icon${resultIcons.length > 1 ? "s" : ""} for "${query}".`}
          />
        )}
      </section>
    </div>
  );
}

function RepoIconPreview({
  icon,
  size,
  color,
  states,
}: {
  icon: RepoIconMatch;
  size: IconSizeKey;
  color: string | null;
  states: IconStateKey[];
}) {
  const fileBase = slugify(icon.name);
  const pxSize = ICON_SIZE_PX[size];
  const exportSvg = applyIconStyle(icon.svg, color, pxSize);
  const visibleStates = states.length > 0 ? states : (["default"] as IconStateKey[]);

  async function exportPng() {
    const blob = await svgToPngBlob(exportSvg);
    downloadBlob(blob, `${fileBase}.png`);
  }

  return (
    <>
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Output Preview — {icon.name}</h3>
          <div className="flex gap-2">
            <button
              onClick={exportPng}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <FileImage size={14} /> Export PNG
            </button>
            <button
              onClick={() => downloadSvg(exportSvg, `${fileBase}.svg`)}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <FileCode2 size={14} /> Export SVG
            </button>
            <button
              onClick={() => copyToClipboard(exportSvg)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              Copy SVG
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {visibleStates.map((state) => (
            <div key={state} className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {ICON_STATE_LABEL[state]}
              </p>
              <div className="flex items-center justify-center gap-6 rounded-xl bg-[#f5f5f7] py-8">
                <div className="flex flex-col items-center gap-2">
                  <IconSwatch
                    svg={icon.svg}
                    mode="light"
                    color={color}
                    state={state}
                    size={140}
                    iconSize={pxSize}
                  />
                  <span className="text-xs text-muted">Light mode</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <IconSwatch
                    svg={icon.svg}
                    mode="dark"
                    color={color}
                    state={state}
                    size={140}
                    iconSize={pxSize}
                  />
                  <span className="text-xs text-muted">Dark mode</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          {pxSize} × {pxSize}px · SVG · from icon repo
        </p>
      </div>
      <CodeCard title="SVG Code" code={exportSvg} />
    </>
  );
}

function AgentIconPreview({
  icons,
  labels,
  activeIndex,
  onSelect,
  queryName,
  size,
  color,
  states,
  heading,
  subheading,
}: {
  icons: string[];
  labels: string[];
  activeIndex: number;
  onSelect: (i: number) => void;
  queryName: string;
  size: IconSizeKey;
  color: string | null;
  states: IconStateKey[];
  heading: string;
  subheading: string;
}) {
  const pxSize = ICON_SIZE_PX[size];
  const visibleStates = states.length > 0 ? states : (["default"] as IconStateKey[]);
  const activeExportSvg = applyIconStyle(icons[activeIndex], color, pxSize);

  async function downloadAll(format: "svg" | "png") {
    const payload = icons.map((svg, i) => ({
      name: labels[i] ?? `${queryName}-${i + 1}`,
      svg: applyIconStyle(svg, color, pxSize),
    }));
    await downloadAllAsZip(payload, format, `${slugify(queryName)}-icons-${format}.zip`);
  }

  return (
    <>
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-ink">{heading}</h3>
            <p className="text-xs text-muted">{subheading}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => downloadAll("svg")}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <Download size={14} /> Download all (SVG)
            </button>
            <button
              onClick={() => downloadAll("png")}
              className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-2 text-sm font-medium text-brand hover:bg-black/5"
            >
              <Download size={14} /> Download all (PNG)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {icons.map((svg, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              aria-label={labels[i] ?? `Option ${i + 1}`}
              className={`flex items-center justify-center rounded-xl border p-3 ${
                i === activeIndex ? "border-brand bg-panel" : "border-transparent bg-[#f5f5f7]"
              }`}
            >
              <IconSwatch svg={svg} mode="light" color={color} size={72} iconSize={32} />
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-6 border-t border-black/5 pt-6">
          {visibleStates.map((state) => (
            <div key={state} className="flex flex-col items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {ICON_STATE_LABEL[state]}
              </p>
              <div className="flex items-center justify-center gap-6 rounded-xl bg-[#f5f5f7] py-8">
                <div className="flex flex-col items-center gap-2">
                  <IconSwatch
                    svg={icons[activeIndex]}
                    mode="light"
                    color={color}
                    state={state}
                    size={120}
                    iconSize={pxSize}
                  />
                  <span className="text-xs text-muted">Light mode</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <IconSwatch
                    svg={icons[activeIndex]}
                    mode="dark"
                    color={color}
                    state={state}
                    size={120}
                    iconSize={pxSize}
                  />
                  <span className="text-xs text-muted">Dark mode</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <CodeCard
        title={`SVG Code — ${labels[activeIndex] ?? `Option ${activeIndex + 1}`}`}
        code={activeExportSvg}
      />
    </>
  );
}
