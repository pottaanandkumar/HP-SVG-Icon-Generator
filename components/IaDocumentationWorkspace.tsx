"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import {
  Pencil,
  Trash2,
  Save,
  Download,
  History,
  Bot,
  ZoomIn,
  ZoomOut,
  PaintBucket,
  Ban,
} from "lucide-react";
import type { AuditEntry, FeatureRow, ModelInfo, SchemaIndex, TabData } from "@/lib/iaDocRepo";

const STATUS_STYLE: Record<string, string> = {
  Y: "text-emerald-600 font-medium",
  want: "text-blue-600",
  WIP: "text-amber-600",
};

/** Same mapping as STATUS_STYLE but as real hex values -- needed for the
 * xls export, which writes inline CSS into an HTML table rather than
 * Tailwind classes. */
const STATUS_HEX: Record<string, string> = {
  Y: "#059669",
  want: "#2563eb",
  WIP: "#d97706",
};

const STATUS_OPTIONS = ["", "Y", "n/a", "want", "WIP", "Ready"];

/** Sentinel value for paintColor meaning "clear this cell's custom fill"
 * rather than "paint it fresh" -- kept distinct from null (paint tool off)
 * and from any real color string. */
const ERASE_FILL = "__erase__";

const FILL_PALETTE = [
  "#FEF3C7",
  "#FDE68A",
  "#FED7AA",
  "#FECACA",
  "#FBCFE8",
  "#E9D5FF",
  "#C7D2FE",
  "#BFDBFE",
  "#A7F3D0",
  "#D9F99D",
  "#E5E7EB",
  "#FFFFFF",
];

const ZOOM_MIN = 60;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <p className="mb-1 mt-2 font-semibold text-ink first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mb-1 mt-2 font-semibold text-ink first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mb-1 mt-2 font-medium text-ink first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-4">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-panel px-1 py-0.5 font-mono text-[11px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-panel p-2 font-mono text-[11px]">
      {children}
    </pre>
  ),
};

function statusClass(value: string | undefined): string {
  if (!value) return "text-muted";
  return STATUS_STYLE[value] ?? "text-muted";
}

function featurePath(row: FeatureRow): string {
  return [row.level2, row.level3, row.level4, row.level5, row.level6, row.level7]
    .filter(Boolean)
    .join(" › ");
}

function matchesSearch(row: FeatureRow, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const text = featurePath(row).toLowerCase();
  return terms.some((t) => text.includes(t));
}

interface ChatMessage {
  role: "user" | "agent" | "error" | "system";
  text: string;
}

let nextTempRowId = -1;

/** Partitions an ordered list into runs of consecutive items sharing the
 * same key, so a header band can render one spanning cell per run (e.g.
 * one colored cell per family group) instead of one cell per column --
 * matching how the source xlsx itself merges adjacent same-value cells. */
function groupConsecutive<T>(items: T[], keyFn: (item: T) => string): { key: string; items: T[] }[] {
  const groups: { key: string; items: T[] }[] = [];
  for (const item of items) {
    const key = keyFn(item);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** Drag handle pinned to a header cell's right edge for column resize.
 * The parent <th> must already be positioned (sticky/relative) -- true for
 * every header cell in this file -- so this anchors to that column only. */
function ColResizeHandle({
  colId,
  onResize,
}: {
  colId: string;
  onResize: (e: React.MouseEvent, colId: string) => void;
}) {
  return (
    <span
      onMouseDown={(e) => onResize(e, colId)}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize"
      className="absolute right-0 top-0 z-30 h-full w-1.5 cursor-col-resize select-none hover:bg-brand/50"
    />
  );
}

function findModelByRef(models: ModelInfo[], ref: string): ModelInfo | undefined {
  const target = ref.trim().toLowerCase();
  return (
    models.find((m) => m.key.toLowerCase() === target) ??
    models.find((m) => m.key.toLowerCase().includes(target) || target.includes(m.key.toLowerCase()))
  );
}

function findRowByRef(rows: FeatureRow[], ref: string): FeatureRow | undefined {
  const target = ref.trim().toLowerCase();
  return rows.find((r) => featurePath(r).toLowerCase().includes(target));
}

const POSITION_RE =
  /\b(after|before|beside|next to|near|following)\s+(?:the\s+)?["']?([A-Za-z0-9][\w .\-/'"]*?)["']?\s*(?:column\b|model\b|row\b|feature\b|tab\b|$)/i;
const NAME_RE = /(?:named|called)\s+["']?([^"'.,]+?)["']?(?=\s+(?:after|before|beside|next to|near|following)\b|$|[.,])/i;

interface ParsedInsert {
  name?: string;
  afterRef?: string;
}

function parseInsertRequest(query: string, keyword: RegExp): ParsedInsert | null {
  if (!/\badd\b/i.test(query) || !keyword.test(query)) return null;
  const posMatch = query.match(POSITION_RE);
  const afterRef = posMatch?.[2]?.trim();
  const nameMatch = query.match(NAME_RE);
  return { name: nameMatch?.[1]?.trim(), afterRef };
}

function extractPendingName(query: string): string {
  return query
    .replace(/^(call it|name it|it should be called|let'?s call it|named)\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

const CANCEL_RE = /^(cancel|never ?mind|forget it|stop)\b/i;

const ROW_FIELDS = ["level2", "version", "source"] as const;

const AUTHOR_STORAGE_KEY = "ia-documentation-author";

/**
 * Diffs the grid against the last-saved snapshot to build audit entries.
 * Run at Save time (not per keystroke) so the log records committed changes
 * with real before/after values, not every intermediate edit.
 */
function computeAuditDiff(before: TabData, after: TabData): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const now = new Date().toISOString();
  const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const beforeModelKeys = new Set(before.models.map((m) => m.key));
  const afterModelKeys = new Set(after.models.map((m) => m.key));
  const newColumnKeys = new Set<string>();
  for (const m of after.models) {
    if (!beforeModelKeys.has(m.key)) {
      newColumnKeys.add(m.key);
      entries.push({
        id: makeId(),
        timestamp: now,
        type: "column-added",
        summary: `Added column "${m.key}"`,
      });
    }
  }
  for (const m of before.models) {
    if (!afterModelKeys.has(m.key)) {
      entries.push({
        id: makeId(),
        timestamp: now,
        type: "column-removed",
        summary: `Removed column "${m.key}"`,
      });
    }
  }

  const afterRowIds = new Set(after.rows.map((r) => r.row));
  for (const row of before.rows) {
    if (!afterRowIds.has(row.row)) {
      const label = featurePath(row) || row.level2 || `row ${row.row}`;
      entries.push({
        id: makeId(),
        timestamp: now,
        type: "row-removed",
        summary: `Removed row "${label}"`,
      });
    }
  }

  const beforeRowsById = new Map(before.rows.map((r) => [r.row, r]));
  for (const row of after.rows) {
    const prevRow = beforeRowsById.get(row.row);
    const label = featurePath(row) || row.level2 || `row ${row.row}`;

    if (!prevRow) {
      entries.push({
        id: makeId(),
        timestamp: now,
        type: "row-added",
        summary: `Added row "${label}"`,
      });
      continue;
    }

    for (const field of ROW_FIELDS) {
      const oldValue = prevRow[field] ?? null;
      const newValue = row[field] ?? null;
      if (String(oldValue ?? "") !== String(newValue ?? "")) {
        entries.push({
          id: makeId(),
          timestamp: now,
          type: "field-changed",
          summary: `"${label}" — ${field}: "${oldValue ?? ""}" → "${newValue ?? ""}"`,
          field,
          oldValue: oldValue as string | null,
          newValue: newValue as string | null,
        });
      }
    }

    const prevModels = prevRow.models ?? {};
    const curModels = row.models ?? {};
    const keys = new Set([...Object.keys(prevModels), ...Object.keys(curModels)]);
    for (const key of keys) {
      // Newly-added columns default every existing row's cell to "n/a" --
      // that's not a real edit, only log it if the user actually changed it.
      if (newColumnKeys.has(key) && (curModels[key] ?? "n/a") === "n/a") continue;
      // Removed columns are already reported once above as "column-removed" --
      // don't also report every row's cell for that key going to "".
      if (beforeModelKeys.has(key) && !afterModelKeys.has(key)) continue;
      const oldValue = prevModels[key] ?? null;
      const newValue = curModels[key] ?? null;
      if ((oldValue ?? "") !== (newValue ?? "")) {
        entries.push({
          id: makeId(),
          timestamp: now,
          type: "cell-changed",
          summary: `"${label}" × "${key}": "${oldValue ?? ""}" → "${newValue ?? ""}"`,
          field: key,
          oldValue,
          newValue,
        });
      }
    }
  }

  return entries;
}

export function IaDocumentationWorkspace() {
  const [schema, setSchema] = useState<SchemaIndex | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabData, setTabData] = useState<TabData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [rowSearch, setRowSearch] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const [zoom, setZoom] = useState(100);
  const [showFillPalette, setShowFillPalette] = useState(false);
  const [paintColor, setPaintColor] = useState<string | null>(null);
  /** Manually-resized column widths (px), keyed by the same colId scheme as
   * customBg ("level2", "models.<key>", "componentSetting.<label>",
   * "quickSets.<key>", "epicStory", "designNotes"). Absent entries keep
   * their natural content-driven width. */
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowName, setNewRowName] = useState("");
  const [newRowAfter, setNewRowAfter] = useState<number | "start">("start");

  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColAfter, setNewColAfter] = useState<string | "start">("start");
  const [cloneFromModel, setCloneFromModel] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<
    { kind: "column"; after: string | "start" } | { kind: "row"; after: number | "start" } | null
  >(null);

  const [savedSnapshot, setSavedSnapshot] = useState<TabData | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [editingAuthor, setEditingAuthor] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(AUTHOR_STORAGE_KEY);
    if (stored) setAuthorName(stored);
    else setEditingAuthor(true);
  }, []);

  function saveAuthorName(name: string) {
    const trimmed = name.trim();
    setAuthorName(trimmed);
    window.localStorage.setItem(AUTHOR_STORAGE_KEY, trimmed);
    setEditingAuthor(false);
  }

  useEffect(() => {
    fetch("/api/ia-documentation/schema")
      .then((res) => res.json())
      .then((data: SchemaIndex) => {
        setSchema(data);
        if (data.tabs.length > 0) setActiveTab(data.tabs[0].name);
      });
  }, []);

  useEffect(() => {
    if (!activeTab) {
      setTabData(null);
      setSavedSnapshot(null);
      setAuditLog([]);
      return;
    }
    fetch(`/api/ia-documentation/tab/${encodeURIComponent(activeTab)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setTabData(data);
        setSavedSnapshot(data);
        setDirty(false);
        setSelectedModels(new Set());
        setSelectedRows(new Set());
        setCompareMode(false);
        setEditMode(false);
        setRowSearch("");
        setModelFilter("");
      });
    fetch(`/api/ia-documentation/tab/${encodeURIComponent(activeTab)}/audit`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setAuditLog);
  }, [activeTab]);

  const visibleModels = useMemo(() => {
    if (!tabData) return [];
    if (compareMode) return tabData.models.filter((m) => selectedModels.has(m.key));
    const q = modelFilter.trim().toLowerCase();
    if (!q) return tabData.models;
    return tabData.models.filter((m) => m.key.toLowerCase().includes(q));
  }, [tabData, modelFilter, compareMode, selectedModels]);

  const visibleRows = useMemo(() => {
    if (!tabData) return [];
    const terms = rowSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return tabData.rows;
    return tabData.rows.filter((r) => matchesSearch(r, terms));
  }, [tabData, rowSearch]);

  // Tabs converted with original-sheet style capture (currently 2-Line IA)
  // render as a faithful reproduction of the source xlsx -- separate Level
  // columns, multi-row family/segment/status header bands, and the sheet's
  // own colors, instead of the flattened generic grid. Editing (Edit mode,
  // +Row/+Column, delete, save) still works the same as the generic grid --
  // this only changes the *display*, not what can be changed.
  const hasOriginalStyle = Boolean(tabData?.headerStyle);
  const treeLabels = tabData?.featureTreeLabels ?? tabData?.featureTreeColumns ?? [];

  // Which optional header bands actually apply to this tab's real data --
  // computed from the data itself rather than hardcoded per tab, so the
  // same rendering works for both Scan (rich: per-model family/segment
  // colors, engine class, Quick Sets, Epic, Notes) and 2-Line IA (plain:
  // one uniform family/segment shared by every model, nothing else).
  // Segment only gets its own header row when it's actually grouping
  // models differently -- if every model shares one segment value (like
  // 2-Line IA's "POLESTAR"), showing it as a row is redundant, not
  // informative, which is why that row was removed there earlier.
  const hasEngineClassRow = visibleModels.some((m) => m.engineClass);
  const distinctSegments = new Set(visibleModels.map((m) => m.segment).filter(Boolean));
  const hasSegmentRow = distinctSegments.size > 1;
  const hasQuickSets = (tabData?.quickSetColumns?.length ?? 0) > 0;
  const hasComponents = (tabData?.componentColumns?.length ?? 0) > 0;
  const hasEpicColumn = Boolean(tabData?.headerStyle?.epicBandFill || tabData?.headerStyle?.epicLabel);
  const hasNotesColumn = Boolean(tabData?.headerStyle?.notesLabel);

  const headerRowKeys = [
    "family",
    ...(hasQuickSets ? (["quickKey"] as const) : []),
    ...(hasSegmentRow ? (["segment"] as const) : []),
    "name",
    ...(hasEngineClassRow ? (["engine"] as const) : []),
    "status",
  ] as const;
  const nameRowIndex = headerRowKeys.indexOf("name");
  const ROW_HEIGHT_PX = 26;

  const filtersActive = modelFilter.trim() !== "" || rowSearch.trim() !== "" || compareMode;

  function resetFilters() {
    setModelFilter("");
    setRowSearch("");
    setCompareMode(false);
    setSelectedModels(new Set());
  }

  function updateTabData(fn: (prev: TabData) => TabData) {
    setTabData((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }

  function setCell(rowId: number, modelKey: string, value: string) {
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.row === rowId ? { ...r, models: { ...r.models, [modelKey]: value } } : r
      ),
    }));
  }

  function setRowField(rowId: number, field: string, value: string) {
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.row === rowId ? { ...r, [field]: value } : r)),
    }));
  }

  function setComponentCell(rowId: number, label: string, value: string) {
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.row === rowId ? { ...r, componentSetting: { ...r.componentSetting, [label]: value } } : r
      ),
    }));
  }

  /** Applies (or clears, when paintColor is the ERASE sentinel) the active
   * fill-color tool to one cell. Cell-agnostic by design -- cellId is just
   * whatever key that cell's value is stored under (see FeatureRow.customBg
   * doc comment), so the same handler covers tree/model/component/quickset/
   * epic/notes cells without each needing its own paint logic. */
  function paintCell(rowId: number, cellId: string) {
    if (!editMode || !paintColor) return;
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        if (r.row !== rowId) return r;
        const nextBg = { ...r.customBg };
        if (paintColor === ERASE_FILL) delete nextBg[cellId];
        else nextBg[cellId] = paintColor;
        return { ...r, customBg: nextBg };
      }),
    }));
  }

  /** Drag-to-resize for a column header. Reads the header cell's own
   * current rendered width as the drag start point (rather than tracking
   * it separately) so it works whether or not the column already has a
   * stored width -- first drag captures its natural content-driven size. */
  function startColumnResize(e: React.MouseEvent, colId: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startWidth = th?.getBoundingClientRect().width ?? 120;
    const startX = e.clientX;

    function onMove(ev: MouseEvent) {
      const next = Math.max(32, Math.round(startWidth + (ev.clientX - startX)));
      setColWidths((prev) => ({ ...prev, [colId]: next }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function colWidthStyle(colId: string): React.CSSProperties {
    const w = colWidths[colId];
    if (!w) return {};
    return { width: w, minWidth: w, maxWidth: w };
  }

  function setQuickSetCell(rowId: number, key: string, value: string) {
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.map((r) =>
        r.row === rowId ? { ...r, quickSets: { ...r.quickSets, [key]: value } } : r
      ),
    }));
  }

  function insertRowAt(name: string, after: number | "start") {
    updateTabData((prev) => {
      const row: FeatureRow = {
        row: nextTempRowId--,
        version: null,
        source: null,
        level2: name,
        level3: null,
        level4: null,
        level5: null,
        level6: null,
        level7: null,
        models: Object.fromEntries(prev.models.map((m) => [m.key, "n/a"])),
      };
      const idx = after === "start" ? 0 : prev.rows.findIndex((r) => r.row === after) + 1;
      const rows = [...prev.rows];
      rows.splice(idx, 0, row);
      return { ...prev, rows };
    });
  }

  function insertColumnAt(name: string, after: string | "start", cloneFrom?: string) {
    updateTabData((prev) => {
      const source = cloneFrom ? prev.models.find((m) => m.key === cloneFrom) : undefined;
      const model: ModelInfo = {
        key: name,
        column: "",
        family: source?.family ?? null,
        segment: source?.segment ?? null,
        engineClass: source?.engineClass ?? null,
        status: source?.status ?? null,
      };
      const idx = after === "start" ? 0 : prev.models.findIndex((m) => m.key === after) + 1;
      const models = [...prev.models];
      models.splice(idx, 0, model);
      return {
        ...prev,
        models,
        rows: prev.rows.map((r) => ({
          ...r,
          models: { ...r.models, [model.key]: source ? (r.models?.[source.key] ?? "n/a") : "n/a" },
        })),
      };
    });
  }

  function insertRow() {
    if (!newRowName.trim()) return;
    insertRowAt(newRowName.trim(), newRowAfter);
    setNewRowName("");
    setShowAddRow(false);
  }

  function insertColumn() {
    if (!newColName.trim()) return;
    insertColumnAt(newColName.trim(), newColAfter, cloneFromModel || undefined);
    setNewColName("");
    setShowAddCol(false);
    setCloneFromModel("");
  }

  async function saveChanges() {
    if (!activeTab || !tabData) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ia-documentation/tab/${encodeURIComponent(activeTab)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tabData),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);

      const rawEntries = savedSnapshot ? computeAuditDiff(savedSnapshot, tabData) : [];
      const entries = rawEntries.map((e) => ({ ...e, user: authorName || "Unknown" }));
      if (entries.length > 0) {
        const auditRes = await fetch(
          `/api/ia-documentation/tab/${encodeURIComponent(activeTab)}/audit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
          }
        );
        if (auditRes.ok) setAuditLog(await auditRes.json());
      }

      setSavedSnapshot(tabData);
      setDirty(false);
      setEditMode(false);
      setShowAddRow(false);
      setShowAddCol(false);
      setCloneFromModel("");
      setSelectedRows(new Set());
      setSelectedModels(new Set());
    } finally {
      setSaving(false);
    }
  }

  /**
   * Exports the currently-visible grid as an .xls file that mirrors what's
   * on screen -- same tree/model/component/quickset/epic/notes columns,
   * same merged header bands, same fill colors (including user-painted
   * cells) -- not just a flat data dump. The community `xlsx` package can't
   * write cell styles/merges, so this builds a real HTML <table> (with the
   * standard Microsoft Office HTML markers) and downloads it as .xls,
   * which Excel opens natively with full color/merge fidelity -- the same
   * technique Excel's own "Save as Web Page" used.
   */
  function exportToXlsx() {
    if (!tabData) return;

    const esc = (v: unknown) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const styleAttr = (props: Record<string, string | number | null | undefined>) => {
      const parts = Object.entries(props)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}:${v}`);
      return parts.length ? ` style="${parts.join(";")}"` : "";
    };

    const th = (
      content: string,
      opts: {
        rowSpan?: number;
        colSpan?: number;
        bg?: string | null;
        color?: string;
        align?: string;
      } = {}
    ) => {
      const attrs = [
        opts.rowSpan && opts.rowSpan > 1 ? ` rowspan="${opts.rowSpan}"` : "",
        opts.colSpan && opts.colSpan > 1 ? ` colspan="${opts.colSpan}"` : "",
        styleAttr({
          "background-color": opts.bg ?? undefined,
          color: opts.color,
          "font-weight": "bold",
          "text-align": opts.align ?? "center",
          border: "1px solid #9ca3af",
          padding: "4px 8px",
          "white-space": "nowrap",
        }),
      ].join("");
      return `<th${attrs}>${esc(content)}</th>`;
    };

    const td = (
      content: string,
      opts: { bg?: string | null; color?: string; bold?: boolean; align?: string } = {}
    ) => {
      const attrs = styleAttr({
        "background-color": opts.bg ?? undefined,
        color: opts.color,
        "font-weight": opts.bold ? "bold" : undefined,
        "text-align": opts.align ?? "left",
        border: "1px solid #d1d5db",
        padding: "3px 8px",
        "white-space": "nowrap",
      });
      return `<td${attrs}>${esc(content)}</td>`;
    };

    let theadHtml = "";
    let tbodyHtml = "";

    if (hasOriginalStyle) {
      const headerRowsHtml = headerRowKeys.map((rowKey, rowIndex) => {
        const remainingRows = headerRowKeys.length - rowIndex;
        const cells: string[] = [];

        if (rowIndex === 0 && nameRowIndex > 0) {
          treeLabels.forEach(() =>
            cells.push(th("", { rowSpan: nameRowIndex, bg: tabData.headerStyle?.treeHeaderFill }))
          );
        }
        if (rowKey === "name") {
          treeLabels.forEach((label) =>
            cells.push(
              th(label, {
                rowSpan: headerRowKeys.length - nameRowIndex,
                bg: tabData.headerStyle?.treeHeaderFill,
                color: tabData.headerStyle?.treeHeaderFill ? "#fff" : undefined,
                align: "left",
              })
            )
          );
        }
        if (rowKey === "family") {
          groupConsecutive(visibleModels, (m) => `${m.family ?? ""}|${m.familyFill ?? ""}`).forEach((group) =>
            cells.push(
              th(group.items[0].family ?? "", {
                colSpan: group.items.length,
                bg: group.items[0].familyFill ?? tabData.headerStyle?.modelHeaderFill,
                color: "#fff",
              })
            )
          );
        }
        if (rowKey === "quickKey") {
          groupConsecutive(visibleModels, (m) => `${m.family ?? ""}|${m.familyFill ?? ""}`).forEach((group) =>
            cells.push(
              th("", {
                colSpan: group.items.length,
                bg: group.items[0].familyFill ?? tabData.headerStyle?.modelHeaderFill,
              })
            )
          );
          tabData.quickSetColumns.forEach((qs) =>
            cells.push(th(qs.key, { bg: tabData.headerStyle?.quickSetsBandFill, color: "#fff" }))
          );
        }
        if (rowKey === "segment") {
          groupConsecutive(visibleModels, (m) => `${m.segment ?? ""}|${m.segmentFill ?? ""}`).forEach((group) =>
            cells.push(
              th(group.items[0].segment ?? "", {
                colSpan: group.items.length,
                bg: group.items[0].segmentFill ?? tabData.headerStyle?.modelSegmentFill,
                color: "#fff",
              })
            )
          );
          tabData.quickSetColumns.forEach((qs) =>
            cells.push(th(qs.line ?? "", { bg: qs.lineFill, color: "#fff" }))
          );
        }
        if (rowKey === "name") {
          visibleModels.forEach((m) =>
            cells.push(
              th(m.key, { bg: m.familyFill ?? tabData.headerStyle?.modelHeaderFill, color: "#fff" })
            )
          );
          tabData.componentColumns?.forEach((label) =>
            cells.push(
              th(label, {
                rowSpan: remainingRows,
                bg: tabData.headerStyle?.treeHeaderFill,
                color: tabData.headerStyle?.treeHeaderFill ? "#fff" : undefined,
              })
            )
          );
          tabData.quickSetColumns.forEach((qs) =>
            cells.push(
              th(qs.model ?? "", { rowSpan: remainingRows, bg: tabData.headerStyle?.quickSetsBandFill, color: "#fff" })
            )
          );
        }
        if (rowKey === "engine") {
          visibleModels.forEach((m) =>
            cells.push(th(m.engineClass ?? "", { bg: tabData.headerStyle?.statusRowFill }))
          );
        }
        if (rowKey === "status") {
          visibleModels.forEach((m) =>
            cells.push(th(m.status ?? "", { bg: tabData.headerStyle?.statusRowFill }))
          );
        }
        if (rowIndex === 0 && hasComponents) {
          cells.push(
            th(tabData.headerStyle?.componentsBandLabel ?? "Components", {
              colSpan: tabData.componentColumns!.length,
              rowSpan: nameRowIndex,
              bg: tabData.headerStyle?.componentsBandFill,
              color: "#fff",
            })
          );
        }
        if (rowIndex === 0 && hasQuickSets) {
          cells.push(
            th(tabData.headerStyle?.quickSetsBandLabel ?? "Quick Sets", {
              colSpan: tabData.quickSetColumns.length,
              bg: tabData.headerStyle?.quickSetsBandFill,
              color: "#fff",
            })
          );
        }
        if (rowIndex === 0 && hasEpicColumn) {
          cells.push(
            th(tabData.headerStyle?.epicLabel ?? "Epic", {
              rowSpan: headerRowKeys.length,
              bg: tabData.headerStyle?.epicBandFill,
              color: "#fff",
            })
          );
        }
        if (rowIndex === 0 && hasNotesColumn) {
          cells.push(th(tabData.headerStyle?.notesLabel ?? "Notes", { rowSpan: headerRowKeys.length }));
        }

        return `<tr>${cells.join("")}</tr>`;
      });
      theadHtml = `<thead>${headerRowsHtml.join("")}</thead>`;

      const bodyRowsHtml = visibleRows.map((row) => {
        const rowRecord = row as unknown as Record<string, string | number | null | undefined>;
        const cells: string[] = [];

        tabData.featureTreeColumns.forEach((field) => {
          const cellStyleInfo = row.cellStyle?.[field];
          cells.push(
            td(String(rowRecord[field] ?? ""), {
              bg: row.customBg?.[field] ?? cellStyleInfo?.fill ?? undefined,
              bold: cellStyleInfo?.bold,
            })
          );
        });
        visibleModels.forEach((m) => {
          const value = row.models?.[m.key];
          const cellId = `models.${m.key}`;
          cells.push(
            td(value ?? "", {
              bg: row.customBg?.[cellId],
              color: value ? STATUS_HEX[value] : undefined,
              align: "center",
            })
          );
        });
        tabData.componentColumns?.forEach((label) => {
          const cellId = `componentSetting.${label}`;
          cells.push(td(row.componentSetting?.[label] ?? "", { bg: row.customBg?.[cellId] }));
        });
        tabData.quickSetColumns.forEach((qs) => {
          const cellId = `quickSets.${qs.key}`;
          cells.push(td(row.quickSets?.[qs.key] ?? "", { bg: row.customBg?.[cellId] }));
        });
        if (hasEpicColumn) cells.push(td(row.epicStory ?? "", { bg: row.customBg?.epicStory }));
        if (hasNotesColumn) cells.push(td(row.designNotes ?? "", { bg: row.customBg?.designNotes }));

        return `<tr>${cells.join("")}</tr>`;
      });
      tbodyHtml = `<tbody>${bodyRowsHtml.join("")}</tbody>`;
    } else {
      const headerCells = [
        th("Feature", { align: "left" }),
        th("Ver", { align: "left" }),
        ...visibleModels.map((m) => th(m.key)),
      ];
      theadHtml = `<thead><tr>${headerCells.join("")}</tr></thead>`;

      const bodyRowsHtml = visibleRows.map((row) => {
        const cells = [
          td(featurePath(row), { bg: row.customBg?.level2 }),
          td(row.version != null ? String(row.version) : "", { bg: row.customBg?.version }),
          ...visibleModels.map((m) => {
            const value = row.models?.[m.key];
            const cellId = `models.${m.key}`;
            return td(value ?? "", {
              bg: row.customBg?.[cellId],
              color: value ? STATUS_HEX[value] : undefined,
              align: "center",
            });
          }),
        ];
        return `<tr>${cells.join("")}</tr>`;
      });
      tbodyHtml = `<tbody>${bodyRowsHtml.join("")}</tbody>`;
    }

    const sheetName = esc(tabData.tab.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Sheet1");
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${sheetName}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }</style>
</head>
<body><table>${theadHtml}${tbodyHtml}</table></body>
</html>`;

    const blob = new Blob(["﻿" + doc], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tabData.tab}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleModelSelected(key: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRowSelected(rowId: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleSelectAllVisibleRows() {
    setSelectedRows((prev) => {
      const allSelected = visibleRows.length > 0 && visibleRows.every((r) => prev.has(r.row));
      if (allSelected) return new Set();
      return new Set(visibleRows.map((r) => r.row));
    });
  }

  function deleteSelectedRows() {
    if (selectedRows.size === 0) return;
    updateTabData((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => !selectedRows.has(r.row)),
    }));
    setSelectedRows(new Set());
  }

  function deleteSelectedColumns() {
    if (selectedModels.size === 0) return;
    updateTabData((prev) => ({
      ...prev,
      models: prev.models.filter((m) => !selectedModels.has(m.key)),
      rows: prev.rows.map((r) => {
        if (!r.models) return r;
        const models = { ...r.models };
        for (const key of selectedModels) delete models[key];
        return { ...r, models };
      }),
    }));
    setSelectedModels(new Set());
    setCompareMode(false);
  }

  async function sendChat() {
    const query = chatInput.trim();
    if (!query || chatLoading || !tabData) return;
    setChatInput("");
    setChatLog((log) => [...log, { role: "user", text: query }]);

    // Finishing an earlier "what should it be called?" round-trip.
    if (pendingInsert) {
      if (CANCEL_RE.test(query)) {
        setPendingInsert(null);
        setChatLog((log) => [...log, { role: "system", text: "Cancelled." }]);
        return;
      }
      const name = extractPendingName(query);
      if (pendingInsert.kind === "column") {
        insertColumnAt(name, pendingInsert.after);
        setChatLog((log) => [
          ...log,
          {
            role: "system",
            text: `Added column "${name}"${pendingInsert.after !== "start" ? ` after ${pendingInsert.after}` : ""}. Switch to Edit mode to fill in values, then Save changes.`,
          },
        ]);
      } else {
        insertRowAt(name, pendingInsert.after);
        setChatLog((log) => [...log, { role: "system", text: `Added row "${name}".` }]);
      }
      setPendingInsert(null);
      return;
    }

    // "add a column ... [beside/after/before X]" -- handled locally rather
    // than by the remote agent: the agent has no reliable way to know our
    // exact data paths, and its free-text output isn't a contract we can
    // parse safely (see the alias hedging in lib/aavaAgent.ts / iaDocumentationAgent.ts
    // for why we don't trust this agent's output format to be consistent).
    const colReq = parseInsertRequest(query, /\bcolumn\b/i);
    if (colReq) {
      const model = colReq.afterRef ? findModelByRef(tabData.models, colReq.afterRef) : undefined;
      const after = model?.key ?? "start";
      if (!colReq.name) {
        setPendingInsert({ kind: "column", after });
        setChatLog((log) => [
          ...log,
          {
            role: "system",
            text: `What should the new column be called${model ? ` (placed after ${model.key})` : ""}?`,
          },
        ]);
      } else {
        insertColumnAt(colReq.name, after);
        setChatLog((log) => [
          ...log,
          {
            role: "system",
            text: `Added column "${colReq.name}"${model ? ` after ${model.key}` : ""}. Switch to Edit mode to fill in values, then Save changes.`,
          },
        ]);
      }
      return;
    }

    // "add a row/feature ... [after/before X]"
    const rowReq = parseInsertRequest(query, /\b(row|feature)\b/i);
    if (rowReq) {
      const refRow = rowReq.afterRef ? findRowByRef(tabData.rows, rowReq.afterRef) : undefined;
      const after = refRow?.row ?? "start";
      if (!rowReq.name) {
        setPendingInsert({ kind: "row", after });
        setChatLog((log) => [
          ...log,
          {
            role: "system",
            text: `What should the new row be called${refRow ? ` (placed after "${featurePath(refRow)}")` : ""}?`,
          },
        ]);
      } else {
        insertRowAt(rowReq.name, after);
        setChatLog((log) => [...log, { role: "system", text: `Added row "${rowReq.name}".` }]);
      }
      return;
    }

    setChatLoading(true);
    try {
      const res = await fetch("/api/ia-documentation/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, tab: activeTab }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setChatLog((log) => [
        ...log,
        { role: "agent", text: data.timedOut ? "Agent timed out." : data.answer || "(no answer)" },
      ]);
    } catch (err) {
      setChatLog((log) => [
        ...log,
        { role: "error", text: err instanceof Error ? err.message : "Request failed" },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!schema) {
    return <p className="text-sm text-muted">Loading matrix…</p>;
  }

  if (schema.tabs.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-8 text-center shadow-sm">
        <p className="font-semibold text-ink">No tabs loaded yet</p>
        <p className="mt-1 text-sm text-muted">
          Sheets from the MUI Architecture workbook will appear here as they&apos;re added
          to <code className="rounded bg-panel px-1 py-0.5">json/data/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Toolbar -- grouped into clusters (view / edit / zoom / actions),
          separated by hairline dividers so it reads like a proper app
          toolbar instead of one long undifferentiated row. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-surface p-2.5 shadow-sm">
        {/* View / filter group */}
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={activeTab ?? ""}
            onChange={(e) => setActiveTab(e.target.value)}
            className="rounded-lg border border-black/10 bg-panel px-3 py-1.5 text-sm font-medium text-ink"
          >
            {schema.tabs.map((tab) => (
              <option key={tab.name} value={tab.name}>
                {tab.name}
              </option>
            ))}
          </select>

          <input
            value={rowSearch}
            onChange={(e) => setRowSearch(e.target.value)}
            placeholder="Search rows / features…"
            className="min-w-[180px] rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          />

          <input
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            placeholder="Filter models…"
            disabled={compareMode}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50"
          />

          <button
            onClick={() => setCompareMode((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              compareMode ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
            }`}
          >
            Compare {selectedModels.size > 0 ? `(${selectedModels.size})` : ""}
          </button>

          {filtersActive && (
            <button
              onClick={resetFilters}
              className="rounded-lg bg-panel px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
            >
              Reset
            </button>
          )}
        </div>

        <div className="mx-1 h-6 w-px shrink-0 bg-black/10" />

        {/* Edit group -- +Row/+Column/Delete/Fill/Save only appear once
            Editing is on, so the toolbar stays uncluttered until you
            actually need those actions. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() =>
              setEditMode((v) => {
                if (v) {
                  setPaintColor(null);
                  setShowFillPalette(false);
                }
                return !v;
              })
            }
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              editMode ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
            }`}
          >
            <Pencil size={14} />
            {editMode ? "Editing" : "Edit"}
          </button>

          {editMode && (
            <>
              <button
                onClick={() => setShowAddRow((v) => !v)}
                className="rounded-lg bg-panel px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
              >
                + Row
              </button>
              <button
                onClick={() => setShowAddCol((v) => !v)}
                className="rounded-lg bg-panel px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
              >
                + Column
              </button>
              <button
                onClick={deleteSelectedRows}
                disabled={selectedRows.size === 0}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 dark:bg-red-950/40 dark:text-red-400"
              >
                <Trash2 size={14} />
                Rows {selectedRows.size > 0 ? `(${selectedRows.size})` : ""}
              </button>
              <button
                onClick={deleteSelectedColumns}
                disabled={selectedModels.size === 0}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 dark:bg-red-950/40 dark:text-red-400"
              >
                <Trash2 size={14} />
                Columns {selectedModels.size > 0 ? `(${selectedModels.size})` : ""}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowFillPalette((v) => !v)}
                  title="Fill color"
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                    paintColor ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
                  }`}
                >
                  <PaintBucket size={14} />
                  <span
                    className="h-3 w-3 rounded-sm border border-black/20"
                    style={{
                      backgroundColor:
                        paintColor && paintColor !== ERASE_FILL ? paintColor : "transparent",
                    }}
                  />
                </button>
                {showFillPalette && (
                  <div className="absolute left-0 top-full z-40 mt-1 grid w-40 grid-cols-6 gap-1 rounded-lg border border-black/10 bg-surface p-2 shadow-lg">
                    {FILL_PALETTE.map((color) => (
                      <button
                        key={color}
                        title={color}
                        onClick={() => {
                          setPaintColor(color);
                          setShowFillPalette(false);
                        }}
                        className="h-5 w-5 rounded border border-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      title="Custom color"
                      onChange={(e) => {
                        setPaintColor(e.target.value);
                        setShowFillPalette(false);
                      }}
                      className="h-5 w-5 cursor-pointer rounded border border-black/10 p-0"
                    />
                    <button
                      title="No fill (click cells to clear their color)"
                      onClick={() => {
                        setPaintColor(ERASE_FILL);
                        setShowFillPalette(false);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded border border-black/10"
                    >
                      <Ban size={12} className="text-muted" />
                    </button>
                    {paintColor && (
                      <button
                        onClick={() => {
                          setPaintColor(null);
                          setShowFillPalette(false);
                        }}
                        className="col-span-6 mt-1 rounded bg-panel py-1 text-[11px] font-medium text-ink hover:bg-black/5"
                      >
                        Stop painting
                      </button>
                    )}
                  </div>
                )}
              </div>
              {paintColor && (
                <span className="text-xs text-muted">
                  {paintColor === ERASE_FILL ? "Click cells to clear fill" : "Click cells to fill"}
                </span>
              )}

              <button
                onClick={saveChanges}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                <Save size={14} />
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
            </>
          )}
        </div>

        <div className="mx-1 h-6 w-px shrink-0 bg-black/10" />

        {/* Zoom group */}
        <div className="flex items-center gap-1 rounded-lg bg-panel px-1 py-1">
          <button
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
            disabled={zoom <= ZOOM_MIN}
            title="Zoom out"
            className="rounded-md p-1.5 text-ink hover:bg-black/5 disabled:opacity-40"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => setZoom(100)}
            title="Reset zoom"
            className="w-11 text-center text-xs font-medium text-ink hover:underline"
          >
            {zoom}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
            title="Zoom in"
            className="rounded-md p-1.5 text-ink hover:bg-black/5 disabled:opacity-40"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        {Object.keys(colWidths).length > 0 && (
          <button
            onClick={() => setColWidths({})}
            title="Reset all manually-resized column widths"
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-black/5 hover:text-ink"
          >
            Reset widths
          </button>
        )}

        <div className="mx-1 h-6 w-px shrink-0 bg-black/10" />

        {/* Export / panels group */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={exportToXlsx}
            className="flex items-center gap-1.5 rounded-lg bg-panel px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
          >
            <Download size={14} />
            Excel
          </button>

          <button
            onClick={() => setShowAudit((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              showAudit ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
            }`}
          >
            <History size={14} />
            Audit Log {auditLog.length > 0 ? `(${auditLog.length})` : ""}
          </button>

          <button
            onClick={() => setCopilotOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              copilotOpen ? "bg-brand text-white" : "bg-panel text-ink hover:bg-black/5"
            }`}
          >
            <Bot size={14} />
            Co-pilot
          </button>
        </div>

        {tabData && (
          <span className="ml-auto whitespace-nowrap text-xs text-muted">
            {filtersActive
              ? `${visibleRows.length} of ${tabData.rows.length} rows`
              : `${tabData.rows.length} rows`}{" "}
            · {visibleModels.length} of {tabData.models.length} models
          </span>
        )}
      </div>

      {editMode && showAddRow && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-sm">
          <input
            value={newRowName}
            onChange={(e) => setNewRowName(e.target.value)}
            placeholder="New feature name"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-muted">after</span>
          <select
            value={newRowAfter}
            onChange={(e) =>
              setNewRowAfter(e.target.value === "start" ? "start" : Number(e.target.value))
            }
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          >
            <option value="start">(start of table)</option>
            {tabData?.rows.map((r) => (
              <option key={r.row} value={r.row}>
                {featurePath(r) || `row ${r.row}`}
              </option>
            ))}
          </select>
          <button
            onClick={insertRow}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
          >
            Insert
          </button>
        </div>
      )}

      {editMode && showAddCol && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-sm">
          <input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="New model/column name"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-muted">after</span>
          <select
            value={newColAfter}
            onChange={(e) => setNewColAfter(e.target.value)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          >
            <option value="start">(start of table)</option>
            {tabData?.models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">cloning</span>
          <select
            value={cloneFromModel}
            onChange={(e) => setCloneFromModel(e.target.value)}
            title="Copy every row's value from this column into the new one, instead of starting blank"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
          >
            <option value="">(blank column)</option>
            {tabData?.models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key}
              </option>
            ))}
          </select>
          <button
            onClick={insertColumn}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white"
          >
            {cloneFromModel ? "Clone" : "Insert"}
          </button>
        </div>
      )}

      {showAudit && (
        <div className="rounded-2xl bg-surface p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Log</p>
            <div className="flex items-center gap-2">
              {editingAuthor ? (
                <>
                  <input
                    autoFocus
                    defaultValue={authorName}
                    placeholder="Your name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveAuthorName((e.target as HTMLInputElement).value);
                    }}
                    onBlur={(e) => saveAuthorName(e.target.value)}
                    className="rounded-lg border border-black/10 px-2 py-1 text-xs"
                  />
                </>
              ) : (
                <button
                  onClick={() => setEditingAuthor(true)}
                  className="text-xs text-muted hover:text-ink"
                  title="This isn't verified -- there's no login system, it's just what gets attached to entries you save"
                >
                  Logged as <span className="font-medium text-ink">{authorName || "Unknown"}</span>{" "}
                  (change)
                </button>
              )}
            </div>
          </div>
          <p className="mb-2 text-xs text-muted">
            Recorded on &quot;Save changes&quot; — captures the before/after values for every
            addition, edit, and update.
          </p>
          {auditLog.length === 0 ? (
            <p className="p-3 text-sm text-muted">
              No changes saved yet. Edits are captured here when you click &quot;Save
              changes&quot;.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="sticky top-0 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink">
                      Time
                    </th>
                    <th className="sticky top-0 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink">
                      User
                    </th>
                    <th className="sticky top-0 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink">
                      Type
                    </th>
                    <th className="sticky top-0 border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...auditLog].reverse().map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap border-b border-black/5 px-2 py-1.5 text-muted">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap border-b border-black/5 px-2 py-1.5 text-ink">
                        {entry.user ?? "Unknown"}
                      </td>
                      <td className="whitespace-nowrap border-b border-black/5 px-2 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            entry.type === "row-added" || entry.type === "column-added"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="border-b border-black/5 px-2 py-1.5 text-ink">
                        {entry.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grid -- full width; Co-pilot floats as a toggleable panel, see below */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="min-w-0 w-full rounded-2xl bg-surface p-2 shadow-sm">
          {!tabData ? (
            <p className="p-3 text-sm text-muted">Select a tab to view its data.</p>
          ) : visibleRows.length === 0 ? (
            <p className="p-3 text-sm text-muted">No rows match &quot;{rowSearch}&quot;.</p>
          ) : hasOriginalStyle ? (
            <div
              className="h-[70vh] w-full overflow-auto rounded-xl"
              style={{ zoom: `${zoom}%` }}
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  {headerRowKeys.map((rowKey, rowIndex) => {
                    const top = rowIndex * ROW_HEIGHT_PX;
                    const remainingRows = headerRowKeys.length - rowIndex;
                    return (
                      <tr key={rowKey}>
                        {rowIndex === 0 &&
                          nameRowIndex > 0 &&
                          treeLabels.map((_, i) => (
                            <th
                              key={`tree-filler-${i}`}
                              rowSpan={nameRowIndex}
                              className="whitespace-nowrap px-1.5 py-1 font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.treeHeaderFill ?? undefined,
                                position: "sticky",
                                top: 0,
                                left: i === 0 ? 0 : undefined,
                                zIndex: i === 0 ? 30 : 20,
                              }}
                            />
                          ))}

                        {rowKey === "name" &&
                          treeLabels.map((label, i) => {
                            const colId = tabData.featureTreeColumns[i];
                            return (
                              <th
                                key={`tree-${i}`}
                                rowSpan={headerRowKeys.length - nameRowIndex}
                                className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 align-top font-semibold"
                                style={{
                                  backgroundColor: tabData.headerStyle?.treeHeaderFill ?? undefined,
                                  color: tabData.headerStyle?.treeHeaderFill ? "#fff" : undefined,
                                  position: "sticky",
                                  top,
                                  left: i === 0 ? 0 : undefined,
                                  zIndex: i === 0 ? 30 : 20,
                                  ...colWidthStyle(colId),
                                }}
                              >
                                {i === 0 ? (
                                  <div className="flex items-center gap-1">
                                    {editMode && (
                                      <input
                                        type="checkbox"
                                        checked={
                                          visibleRows.length > 0 &&
                                          visibleRows.every((r) => selectedRows.has(r.row))
                                        }
                                        onChange={toggleSelectAllVisibleRows}
                                        title="Select all visible rows"
                                      />
                                    )}
                                    {label}
                                  </div>
                                ) : (
                                  label
                                )}
                                <ColResizeHandle colId={colId} onResize={startColumnResize} />
                              </th>
                            );
                          })}

                        {rowKey === "family" &&
                          groupConsecutive(visibleModels, (m) => `${m.family ?? ""}|${m.familyFill ?? ""}`).map(
                            (group, gi) => (
                              <th
                                key={`fam-${gi}`}
                                colSpan={group.items.length}
                                className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                                style={{
                                  backgroundColor:
                                    group.items[0].familyFill ?? tabData.headerStyle?.modelHeaderFill ?? undefined,
                                  color: "#fff",
                                  position: "sticky",
                                  top,
                                  zIndex: 20,
                                }}
                              >
                                {group.items[0].family ?? ""}
                              </th>
                            )
                          )}

                        {rowKey === "quickKey" &&
                          groupConsecutive(visibleModels, (m) => `${m.family ?? ""}|${m.familyFill ?? ""}`).map(
                            (group, gi) => (
                              <th
                                key={`famcont-${gi}`}
                                colSpan={group.items.length}
                                className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                                style={{
                                  backgroundColor:
                                    group.items[0].familyFill ?? tabData.headerStyle?.modelHeaderFill ?? undefined,
                                  position: "sticky",
                                  top,
                                  zIndex: 20,
                                }}
                              />
                            )
                          )}
                        {rowKey === "quickKey" &&
                          tabData.quickSetColumns.map((qs) => (
                            <th
                              key={`qk-${qs.key}`}
                              className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.quickSetsBandFill ?? undefined,
                                color: "#fff",
                                position: "sticky",
                                top,
                                zIndex: 20,
                              }}
                            >
                              {qs.key}
                            </th>
                          ))}

                        {rowKey === "segment" &&
                          groupConsecutive(visibleModels, (m) => `${m.segment ?? ""}|${m.segmentFill ?? ""}`).map(
                            (group, gi) => (
                              <th
                                key={`seg-${gi}`}
                                colSpan={group.items.length}
                                className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                                style={{
                                  backgroundColor:
                                    group.items[0].segmentFill ?? tabData.headerStyle?.modelSegmentFill ?? undefined,
                                  color: "#fff",
                                  position: "sticky",
                                  top,
                                  zIndex: 20,
                                }}
                              >
                                {group.items[0].segment ?? ""}
                              </th>
                            )
                          )}
                        {rowKey === "segment" &&
                          tabData.quickSetColumns.map((qs) => (
                            <th
                              key={`line-${qs.key}`}
                              className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                              style={{
                                backgroundColor: qs.lineFill ?? undefined,
                                color: "#fff",
                                position: "sticky",
                                top,
                                zIndex: 20,
                              }}
                            >
                              {qs.line ?? ""}
                            </th>
                          ))}

                        {rowKey === "name" &&
                          visibleModels.map((m) => (
                            <th
                              key={`name-${m.key}`}
                              title={`${m.family ?? ""} / ${m.segment ?? ""} / ${m.engineClass ?? ""} (${m.status ?? ""})`}
                              className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 font-semibold"
                              style={{
                                backgroundColor:
                                  m.familyFill ?? tabData.headerStyle?.modelHeaderFill ?? undefined,
                                color: "#fff",
                                position: "sticky",
                                top,
                                zIndex: 20,
                                ...colWidthStyle(`models.${m.key}`),
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={selectedModels.has(m.key)}
                                  onChange={() => toggleModelSelected(m.key)}
                                  title="Select for compare"
                                />
                                {m.key}
                              </div>
                              <ColResizeHandle colId={`models.${m.key}`} onResize={startColumnResize} />
                            </th>
                          ))}
                        {rowKey === "name" &&
                          tabData.componentColumns?.map((label) => (
                            <th
                              key={`complabel-${label}`}
                              rowSpan={remainingRows}
                              className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 align-top font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.treeHeaderFill ?? undefined,
                                color: tabData.headerStyle?.treeHeaderFill ? "#fff" : undefined,
                                position: "sticky",
                                top,
                                zIndex: 20,
                                ...colWidthStyle(`componentSetting.${label}`),
                              }}
                            >
                              {label}
                              <ColResizeHandle
                                colId={`componentSetting.${label}`}
                                onResize={startColumnResize}
                              />
                            </th>
                          ))}
                        {rowKey === "name" &&
                          tabData.quickSetColumns.map((qs) => (
                            <th
                              key={`qm-${qs.key}`}
                              rowSpan={remainingRows}
                              className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 align-top font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.quickSetsBandFill ?? undefined,
                                color: "#fff",
                                position: "sticky",
                                top,
                                zIndex: 20,
                                ...colWidthStyle(`quickSets.${qs.key}`),
                              }}
                            >
                              {qs.model ?? ""}
                              <ColResizeHandle colId={`quickSets.${qs.key}`} onResize={startColumnResize} />
                            </th>
                          ))}

                        {rowKey === "engine" &&
                          visibleModels.map((m) => (
                            <th
                              key={`eng-${m.key}`}
                              className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.statusRowFill ?? undefined,
                                position: "sticky",
                                top,
                                zIndex: 20,
                              }}
                            >
                              {m.engineClass ?? ""}
                            </th>
                          ))}

                        {rowKey === "status" &&
                          visibleModels.map((m) => (
                            <th
                              key={`stat-${m.key}`}
                              className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                              style={{
                                backgroundColor: tabData.headerStyle?.statusRowFill ?? undefined,
                                position: "sticky",
                                top,
                                zIndex: 20,
                              }}
                            >
                              {m.status ?? ""}
                            </th>
                          ))}

                        {rowIndex === 0 && hasComponents && (
                          <th
                            colSpan={tabData.componentColumns!.length}
                            rowSpan={nameRowIndex}
                            className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                            style={{
                              backgroundColor: tabData.headerStyle?.componentsBandFill ?? undefined,
                              color: "#fff",
                              position: "sticky",
                              top: 0,
                              zIndex: 20,
                            }}
                          >
                            {tabData.headerStyle?.componentsBandLabel ?? "Components"}
                          </th>
                        )}

                        {rowIndex === 0 && hasQuickSets && (
                          <th
                            colSpan={tabData.quickSetColumns.length}
                            className="whitespace-nowrap border-b border-black/10 px-1.5 py-1 text-center font-semibold"
                            style={{
                              backgroundColor: tabData.headerStyle?.quickSetsBandFill ?? undefined,
                              color: "#fff",
                              position: "sticky",
                              top: 0,
                              zIndex: 20,
                            }}
                          >
                            {tabData.headerStyle?.quickSetsBandLabel ?? "Quick Sets"}
                          </th>
                        )}

                        {rowIndex === 0 && hasEpicColumn && (
                          <th
                            rowSpan={headerRowKeys.length}
                            className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 align-bottom font-semibold"
                            style={{
                              backgroundColor: tabData.headerStyle?.epicBandFill ?? undefined,
                              color: "#fff",
                              position: "sticky",
                              top: 0,
                              zIndex: 20,
                              ...colWidthStyle("epicStory"),
                            }}
                          >
                            {tabData.headerStyle?.epicLabel ?? "Epic"}
                            <ColResizeHandle colId="epicStory" onResize={startColumnResize} />
                          </th>
                        )}

                        {rowIndex === 0 && hasNotesColumn && (
                          <th
                            rowSpan={headerRowKeys.length}
                            className="relative whitespace-nowrap border-b border-black/10 px-1.5 py-1 align-bottom font-semibold"
                            style={{
                              position: "sticky",
                              top: 0,
                              zIndex: 20,
                              ...colWidthStyle("designNotes"),
                            }}
                          >
                            {tabData.headerStyle?.notesLabel ?? "Notes"}
                            <ColResizeHandle colId="designNotes" onResize={startColumnResize} />
                          </th>
                        )}
                      </tr>
                    );
                  })}
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const rowRecord = row as unknown as Record<string, string | number | null | undefined>;
                    const compareValues = compareMode
                      ? visibleModels.map((m) => row.models?.[m.key] ?? "")
                      : [];
                    const compareMismatch =
                      compareMode && compareValues.length > 1 && new Set(compareValues).size > 1;

                    return (
                      <tr key={row.row}>
                        {tabData.featureTreeColumns.map((field, i) => {
                          const style = row.cellStyle?.[field];
                          const value = rowRecord[field];
                          return (
                            <td
                              key={field}
                              onClick={() => paintCell(row.row, field)}
                              className={`whitespace-nowrap border-b border-black/5 px-1.5 py-1 text-ink ${
                                paintColor ? "cursor-crosshair" : ""
                              }`}
                              style={{
                                backgroundColor: row.customBg?.[field] ?? style?.fill ?? undefined,
                                fontWeight: style?.bold ? 600 : undefined,
                                position: i === 0 ? "sticky" : undefined,
                                left: i === 0 ? 0 : undefined,
                                zIndex: i === 0 ? 10 : undefined,
                                ...colWidthStyle(field),
                              }}
                            >
                              {editMode ? (
                                <div className="flex items-center gap-1">
                                  {i === 0 && (
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.has(row.row)}
                                      onChange={() => toggleRowSelected(row.row)}
                                      title="Select for delete"
                                    />
                                  )}
                                  <input
                                    value={(value as string) ?? ""}
                                    onChange={(e) => setRowField(row.row, field, e.target.value)}
                                    className="w-full min-w-[6rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                                  />
                                </div>
                              ) : (
                                (value ?? "")
                              )}
                            </td>
                          );
                        })}
                        {visibleModels.map((m) => {
                          const value = row.models?.[m.key];
                          const cellId = `models.${m.key}`;
                          return (
                            <td
                              key={m.key}
                              onClick={() => paintCell(row.row, cellId)}
                              className={`border-b border-black/5 px-1.5 py-1 ${statusClass(value)} ${
                                compareMismatch ? "bg-amber-100 dark:bg-amber-900/30" : ""
                              } ${paintColor ? "cursor-crosshair" : ""}`}
                              style={{ backgroundColor: row.customBg?.[cellId] ?? undefined, ...colWidthStyle(cellId) }}
                            >
                              {editMode ? (
                                <select
                                  value={value ?? ""}
                                  onChange={(e) => setCell(row.row, m.key, e.target.value)}
                                  className="w-full bg-transparent"
                                >
                                  {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt || "—"}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                (value ?? "")
                              )}
                            </td>
                          );
                        })}
                        {tabData.componentColumns?.map((label) => {
                          const cellId = `componentSetting.${label}`;
                          return (
                            <td
                              key={label}
                              onClick={() => paintCell(row.row, cellId)}
                              className={`whitespace-nowrap border-b border-black/5 px-1.5 py-1 text-ink ${
                                paintColor ? "cursor-crosshair" : ""
                              }`}
                              style={{ backgroundColor: row.customBg?.[cellId] ?? undefined, ...colWidthStyle(cellId) }}
                            >
                              {editMode ? (
                                <input
                                  value={row.componentSetting?.[label] ?? ""}
                                  onChange={(e) => setComponentCell(row.row, label, e.target.value)}
                                  className="w-full min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                                />
                              ) : (
                                row.componentSetting?.[label] ?? ""
                              )}
                            </td>
                          );
                        })}
                        {tabData.quickSetColumns.map((qs) => {
                          const cellId = `quickSets.${qs.key}`;
                          return (
                            <td
                              key={qs.key}
                              onClick={() => paintCell(row.row, cellId)}
                              className={`whitespace-nowrap border-b border-black/5 px-1.5 py-1 text-ink ${
                                paintColor ? "cursor-crosshair" : ""
                              }`}
                              style={{ backgroundColor: row.customBg?.[cellId] ?? undefined, ...colWidthStyle(cellId) }}
                            >
                              {editMode ? (
                                <input
                                  value={row.quickSets?.[qs.key] ?? ""}
                                  onChange={(e) => setQuickSetCell(row.row, qs.key, e.target.value)}
                                  className="w-full min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                                />
                              ) : (
                                row.quickSets?.[qs.key] ?? ""
                              )}
                            </td>
                          );
                        })}
                        {hasEpicColumn && (
                          <td
                            onClick={() => paintCell(row.row, "epicStory")}
                            className={`whitespace-nowrap border-b border-black/5 px-1.5 py-1 text-ink ${
                              paintColor ? "cursor-crosshair" : ""
                            }`}
                            style={{ backgroundColor: row.customBg?.epicStory ?? undefined, ...colWidthStyle("epicStory") }}
                          >
                            {editMode ? (
                              <input
                                value={row.epicStory ?? ""}
                                onChange={(e) => setRowField(row.row, "epicStory", e.target.value)}
                                className="w-full min-w-[5rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                              />
                            ) : (
                              row.epicStory ?? ""
                            )}
                          </td>
                        )}
                        {hasNotesColumn && (
                          <td
                            onClick={() => paintCell(row.row, "designNotes")}
                            className={`whitespace-nowrap border-b border-black/5 px-1.5 py-1 text-ink ${
                              paintColor ? "cursor-crosshair" : ""
                            }`}
                            style={{
                              backgroundColor: row.customBg?.designNotes ?? undefined,
                              ...colWidthStyle("designNotes"),
                            }}
                          >
                            {editMode ? (
                              <input
                                value={row.designNotes ?? ""}
                                onChange={(e) => setRowField(row.row, "designNotes", e.target.value)}
                                className="w-full min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                              />
                            ) : (
                              row.designNotes ?? ""
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="h-[70vh] w-full overflow-auto rounded-xl"
              style={{ zoom: `${zoom}%` }}
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th
                      className="sticky left-0 top-0 z-30 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink"
                      style={colWidthStyle("level2")}
                    >
                      <div className="flex items-center gap-1">
                        {editMode && (
                          <input
                            type="checkbox"
                            checked={visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.row))}
                            onChange={toggleSelectAllVisibleRows}
                            title="Select all visible rows"
                          />
                        )}
                        Feature
                      </div>
                      <ColResizeHandle colId="level2" onResize={startColumnResize} />
                    </th>
                    <th
                      className="sticky top-0 z-20 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink"
                      style={colWidthStyle("version")}
                    >
                      Ver
                      <ColResizeHandle colId="version" onResize={startColumnResize} />
                    </th>
                    {visibleModels.map((m) => (
                      <th
                        key={m.key}
                        title={`${m.family ?? ""} / ${m.segment ?? ""} / ${m.engineClass ?? ""} (${m.status ?? ""})`}
                        className="sticky top-0 z-20 whitespace-nowrap border-b border-black/10 bg-surface px-1.5 py-1 font-semibold text-ink"
                        style={colWidthStyle(`models.${m.key}`)}
                      >
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedModels.has(m.key)}
                            onChange={() => toggleModelSelected(m.key)}
                            title="Select for compare / delete"
                          />
                          {m.key}
                        </div>
                        <ColResizeHandle colId={`models.${m.key}`} onResize={startColumnResize} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const compareValues = compareMode
                      ? visibleModels.map((m) => row.models?.[m.key] ?? "")
                      : [];
                    const compareMismatch =
                      compareMode &&
                      compareValues.length > 1 &&
                      new Set(compareValues).size > 1;

                    return (
                      <tr key={row.row}>
                        <td
                          onClick={() => paintCell(row.row, "level2")}
                          className={`sticky left-0 z-10 max-w-xs border-b border-black/5 bg-surface px-1.5 py-1 text-ink ${
                            paintColor ? "cursor-crosshair" : ""
                          }`}
                          style={{ backgroundColor: row.customBg?.level2 ?? undefined, ...colWidthStyle("level2") }}
                        >
                          <div className="flex items-center gap-1">
                            {editMode && (
                              <input
                                type="checkbox"
                                checked={selectedRows.has(row.row)}
                                onChange={() => toggleRowSelected(row.row)}
                                title="Select for delete"
                              />
                            )}
                            {editMode ? (
                              <input
                                value={row.level2 ?? ""}
                                onChange={(e) => setRowField(row.row, "level2", e.target.value)}
                                className="w-full min-w-[12rem] rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                              />
                            ) : (
                              <span>{featurePath(row) || "—"}</span>
                            )}
                          </div>
                        </td>
                        <td
                          onClick={() => paintCell(row.row, "version")}
                          className={`border-b border-black/5 px-1.5 py-1 text-muted ${
                            paintColor ? "cursor-crosshair" : ""
                          }`}
                          style={{ backgroundColor: row.customBg?.version ?? undefined, ...colWidthStyle("version") }}
                        >
                          {editMode ? (
                            <input
                              value={row.version ?? ""}
                              onChange={(e) => setRowField(row.row, "version", e.target.value)}
                              className="w-14 rounded border border-transparent bg-transparent px-1 py-0 hover:border-black/10 focus:border-black/20"
                            />
                          ) : (
                            (row.version ?? "")
                          )}
                        </td>
                        {visibleModels.map((m) => {
                          const value = row.models?.[m.key];
                          const cellId = `models.${m.key}`;
                          return (
                            <td
                              key={m.key}
                              onClick={() => paintCell(row.row, cellId)}
                              className={`border-b border-black/5 px-1.5 py-1 ${statusClass(value)} ${
                                compareMismatch ? "bg-amber-100 dark:bg-amber-900/30" : ""
                              } ${paintColor ? "cursor-crosshair" : ""}`}
                              style={{ backgroundColor: row.customBg?.[cellId] ?? undefined, ...colWidthStyle(cellId) }}
                            >
                              {editMode ? (
                                <select
                                  value={value ?? ""}
                                  onChange={(e) => setCell(row.row, m.key, e.target.value)}
                                  className="w-full bg-transparent"
                                >
                                  {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt || "—"}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                (value ?? "")
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Co-pilot -- floats over the top-right of the page instead of taking
          a permanent layout column, so the grid above gets full width. */}
      {copilotOpen && (
        <div className="fixed right-6 top-24 z-40 flex h-[60vh] w-96 flex-col overflow-hidden rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-black/10">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <p className="text-sm font-semibold text-ink">Co-pilot</p>
            <button
              onClick={() => setCopilotOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-panel hover:text-ink"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
            {chatLog.length === 0 && (
              <p className="text-muted">
                Ask about the {activeTab ?? "active"}
                {" "}
                tab, e.g. &quot;which models support Scan to Email&quot;, or tell it to change
                the grid, e.g. &quot;add a column beside LYNX&quot;.
              </p>
            )}
            {chatLog.map((msg, i) => (
              <div
                key={i}
                className={
                  msg.role === "user"
                    ? "text-ink"
                    : msg.role === "error"
                      ? "text-red-600"
                      : msg.role === "system"
                        ? "text-brand"
                        : "text-muted"
                }
              >
                <span className="font-medium">
                  {msg.role === "user"
                    ? "You: "
                    : msg.role === "error"
                      ? "Error: "
                      : msg.role === "system"
                        ? "Grid: "
                        : "Agent: "}
                </span>
                {msg.role === "agent" ? (
                  <ReactMarkdown components={MARKDOWN_COMPONENTS}>{msg.text}</ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {chatLoading && <p className="text-muted">Thinking…</p>}
          </div>
          <div className="mt-3 flex shrink-0 gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-1.5 text-sm"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
