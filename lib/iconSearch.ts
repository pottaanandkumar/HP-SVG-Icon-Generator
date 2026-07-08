import iconData from "./generated/lucideIconData.json";

export interface IconSearchMatch {
  name: string;
  svg: string;
}

type IconNode = [string, Record<string, string>][];

/** "PaperclipIcon" -> "paperclip icon", "FileText" -> "file text" */
function humanize(pascalName: string): string {
  return pascalName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Serializes lucide's raw icon geometry (tag/attrs tuples, extracted ahead
 * of time by scripts/generate-icon-data.mjs) directly to an SVG string — no
 * React rendering involved, so this never touches react-dom/server (which
 * Next 16 Route Handlers block: they bundle under the "react-server"
 * condition, and lucide-react's Icon component is "use client"-only). */
function iconNodeToSvg(iconNode: IconNode, pxSize: number): string {
  const inner = iconNode
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${camelToKebab(key)}="${value}"`)
        .join(" ");
      return `<${tag} ${attrStr}/>`;
    })
    .join("");
  // stroke-width 1 (not lucide's default 1.75) to match HP's geometric
  // compliance spec (1px stroke weight) so market-analysis icons are
  // visually consistent with AI-generated ones.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pxSize}" height="${pxSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// De-aliasing note: unlike the lucide-react component barrel (which re-exports
// every icon under 2-6 names), the generated data file has exactly one entry
// per icon shape, so no dedup pass is needed here.
const ICON_ENTRIES = (iconData as { name: string; iconNode: IconNode }[]).map((entry) => ({
  ...entry,
  words: humanize(entry.name),
}));

// Small synonym groups for common everyday words that don't literally appear
// in lucide's (often more technical/specific) icon names. Every word in a
// group expands to every other word in the group — bidirectional, unlike a
// one-way map, so e.g. searching "settings" also surfaces icons named after
// "cog"/"slider"/"toggle" and not just the reverse.
const SYNONYM_GROUPS: string[][] = [
  ["bicycle", "bike"],
  ["cellphone", "mobile", "smartphone", "phone"],
  ["laptop", "pc", "computer"],
  ["photo", "picture", "image"],
  ["bin", "garbage", "trash"],
  ["settings", "gear", "cog", "configuration", "preferences", "option", "options", "slider", "sliders", "toggle"],
  ["crop", "trim", "scissors", "frame"],
  ["loading", "loader"],
  ["magnifier", "search"],
  ["envelope", "mail"],
  ["mic", "microphone"],
];

const SYNONYMS: Record<string, string[]> = {};
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    SYNONYMS[word] = group.filter((w) => w !== word);
  }
}

function expandTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const synonym of SYNONYMS[token] ?? []) expanded.add(synonym);
  }
  return Array.from(expanded);
}

function scoreIcon(words: string, queryTokens: string[]): number {
  const wordList = words.split(" ");
  const compact = words.replace(/\s+/g, "");
  let score = 0;
  for (const token of queryTokens) {
    if (compact === token) score += 5; // bare-name match, e.g. "Cog" for "cog" — outranks compound icons like "BrainCog"
    else if (wordList.includes(token)) score += 3;
    else if (words.includes(token)) score += 1;
    if (token.length > 2 && compact.includes(token)) score += 1;
  }
  return score;
}

/** Real keyword search over the bundled lucide icon set (1745 icons) — used
 * as "market research" when the AAVA agent is unavailable, so the fallback
 * reflects the actual query instead of a fixed unrelated set. Note: lucide
 * is a general UI icon library with no real printer-hardware icons, so for
 * printer-specific concepts (paper trays, feeders, duplex, etc.) this can
 * only ever surface "word-adjacent" matches — see searchPrinterIcons below
 * for a curated set that actually covers those concepts. */
export function searchLucideIcons(query: string, limit = 5): IconSearchMatch[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  if (rawTokens.length === 0) return [];
  const queryTokens = expandTokens(rawTokens);

  const scored = ICON_ENTRIES.map((entry) => ({ entry, score: scoreIcon(entry.words, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ entry }) => ({
    name: entry.name,
    svg: iconNodeToSvg(entry.iconNode, 24),
  }));
}

function findIconByName(name: string) {
  return ICON_ENTRIES.find((e) => e.name === name);
}

interface PrinterConcept {
  label: string;
  lucideName: string;
  keywords?: string[];
}

// Hand-curated mapping of actual HP printer control-panel concepts to the
// closest real lucide icon shape. This exists because lucide has no purpose-
// built printer-hardware icons (no "paper tray", "duplex unit", "paper jam",
// etc.) — keyword-matching against the general library alone surfaces
// nonsense like "PaperBag"/"Wallpaper" for a paper-tray query. Searching
// this list first gives "market research" fallback results that are
// actually relevant to a printer control panel, before widening to the
// general library.
const PRINTER_CONCEPTS: PrinterConcept[] = [
  { label: "Power", lucideName: "Power" },
  { label: "Wi-Fi Status", lucideName: "Wifi", keywords: ["wireless", "network"] },
  { label: "Control Panel Home", lucideName: "House", keywords: ["home", "dashboard"] },
  { label: "Ink Level", lucideName: "Droplet", keywords: ["toner", "cartridge"] },
  { label: "Paper Tray", lucideName: "FileText", keywords: ["tray"] },
  {
    label: "Paper Feeder",
    lucideName: "FileInput",
    keywords: ["feeder", "feed", "adf", "document feeder"],
  },
  { label: "Output Tray", lucideName: "Inbox", keywords: ["output", "collector"] },
  { label: "Paper Stack", lucideName: "FileStack", keywords: ["stack", "sheets", "pages"] },
  { label: "Print", lucideName: "Printer", keywords: ["print"] },
  { label: "Scan", lucideName: "ScanLine", keywords: ["scan", "scanner"] },
  { label: "Copy", lucideName: "Copy", keywords: ["copy", "duplicate"] },
  {
    label: "Duplex Printing",
    lucideName: "RefreshCw",
    keywords: ["duplex", "two-sided", "double-sided", "flip"],
  },
  { label: "Settings", lucideName: "Settings", keywords: ["settings", "configuration", "gear"] },
  { label: "Cancel", lucideName: "CircleX", keywords: ["cancel", "stop", "close"] },
  { label: "Help", lucideName: "CircleQuestionMark", keywords: ["help", "support", "info"] },
  { label: "USB Connection", lucideName: "Usb", keywords: ["usb"] },
  { label: "Bluetooth", lucideName: "Bluetooth", keywords: ["bluetooth"] },
  { label: "Cloud Print", lucideName: "Cloud", keywords: ["cloud"] },
  { label: "Mobile Print", lucideName: "Smartphone", keywords: ["mobile", "phone"] },
  { label: "Maintenance", lucideName: "Wrench", keywords: ["maintenance", "repair", "service"] },
  { label: "Wireless Direct", lucideName: "Radio", keywords: ["direct"] },
  { label: "Volume", lucideName: "Volume2", keywords: ["volume", "sound"] },
  { label: "Secure Print", lucideName: "Lock", keywords: ["lock", "secure", "security", "pin"] },
  {
    label: "Paper Jam Warning",
    lucideName: "TriangleAlert",
    keywords: ["jam", "warning", "alert", "error"],
  },
  { label: "Ready", lucideName: "CircleCheck", keywords: ["ready", "success", "done", "complete"] },
  { label: "Language", lucideName: "Languages", keywords: ["language"] },
  { label: "Multiple Pages", lucideName: "Layers", keywords: ["pages", "multiple", "collate"] },
  { label: "Security", lucideName: "ShieldCheck", keywords: ["security", "protected"] },
  { label: "Eco Mode", lucideName: "Recycle", keywords: ["eco", "recycle", "green"] },
  { label: "Fax", lucideName: "Send", keywords: ["fax", "send"] },
];

const PRINTER_CONCEPT_ENTRIES = PRINTER_CONCEPTS.map((concept) => ({
  ...concept,
  words: [humanize(concept.label), humanize(concept.lucideName), ...(concept.keywords ?? [])].join(
    " "
  ),
}));

/** Searches the curated printer-panel concept list first. */
export function searchPrinterIcons(query: string, limit = 5): IconSearchMatch[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  if (rawTokens.length === 0) return [];
  const queryTokens = expandTokens(rawTokens);

  const scored = PRINTER_CONCEPT_ENTRIES.map((entry) => ({
    entry,
    score: scoreIcon(entry.words, queryTokens),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const results: IconSearchMatch[] = [];
  const seen = new Set<string>();
  for (const { entry } of scored) {
    if (results.length >= limit) break;
    if (seen.has(entry.lucideName)) continue;
    const iconEntry = findIconByName(entry.lucideName);
    if (!iconEntry) continue;
    seen.add(entry.lucideName);
    results.push({ name: entry.label, svg: iconNodeToSvg(iconEntry.iconNode, 24) });
  }
  return results;
}

/** True when `query` is a strong, near-exact match against either a curated
 * HP control-panel concept (e.g. "Settings", "Paper Jam") OR an exact name
 * in the general lucide library (e.g. "Crop" for the "Crop" icon) — used to
 * skip the AI research agent entirely for names we already have a verified
 * answer for. The agent is an LLM and has been observed to drift
 * off-concept between variations even under strict prompting (e.g. asked
 * for "Crop" it can return an unrelated document icon); a fixed lookup
 * can't drift, so it's the more reliable answer whenever one exists.
 * - Curated-concept threshold of 3 requires at least one exact whole-word
 *   match (see scoreIcon) rather than a loose substring hit.
 * - General-library threshold of 5 requires the bare-name exact-identity
 *   match (the compact === token branch, worth +5) — a plain keyword hit
 *   against the 1745-icon general library is too noisy to trust blindly
 *   (e.g. "arm" loosely matching "AlarmClock"), but an exact name match is
 *   just as reliable as a curated concept. */
export function hasConfidentIconMatch(query: string): boolean {
  const rawTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (rawTokens.length === 0) return false;
  const queryTokens = expandTokens(rawTokens);

  const topConceptScore = PRINTER_CONCEPT_ENTRIES.reduce(
    (max, entry) => Math.max(max, scoreIcon(entry.words, queryTokens)),
    0
  );
  if (topConceptScore >= 3) return true;

  const topIconScore = ICON_ENTRIES.reduce(
    (max, entry) => Math.max(max, scoreIcon(entry.words, queryTokens)),
    0
  );
  return topIconScore >= 5;
}

/** Combined "market research" search: curated printer-panel concepts first
 * (actually relevant to a printer control panel), padded with general
 * lucide library matches only if the curated set doesn't have enough. */
export function searchIconsForFallback(query: string, limit = 5): IconSearchMatch[] {
  const printerMatches = searchPrinterIcons(query, limit);
  if (printerMatches.length >= limit) return printerMatches;

  const usedNames = new Set(printerMatches.map((m) => m.name));
  const generalMatches = searchLucideIcons(query, limit).filter((m) => !usedNames.has(m.name));

  return [...printerMatches, ...generalMatches].slice(0, limit);
}
