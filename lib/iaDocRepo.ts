import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "json", "data");
const SCHEMA_PATH = path.join(DATA_DIR, "_schema.json");
const AUDIT_DIR = path.join(DATA_DIR, "_audit");

export interface TabSchema {
  name: string;
  columns: string[];
}

export interface SchemaIndex {
  tabs: TabSchema[];
}

export interface ModelInfo {
  key: string;
  column: string;
  family: string | null;
  /** Original xlsx fill color for this model's family band. Per-model, not
   * tab-wide -- sheets like Scan color different family groups differently
   * (e.g. green "Esnl Enhanced" vs blue "Workflow UI"), unlike 2-Line IA
   * where every model shares one family/color. Null if uncaptured. */
  familyFill?: string | null;
  segment: string | null;
  /** Same per-model treatment as familyFill, for the segment band. */
  segmentFill?: string | null;
  engineClass: string | null;
  status: string | null;
}

export interface QuickSetColumn {
  key: string;
  /** Product-line label shown above the model row (e.g. "LFP"). */
  line?: string | null;
  lineFill?: string | null;
  model: string | null;
}

export interface CellStyle {
  fill: string | null;
  bold: boolean;
}

export interface FeatureRow {
  row: number;
  version: number | string | null;
  source: string | null;
  level2: string | null;
  level3: string | null;
  level4: string | null;
  level5: string | null;
  level6: string | null;
  level7: string | null;
  models?: Record<string, string>;
  componentSetting?: Record<string, string>;
  quickSets?: Record<string, string>;
  epicStory?: string;
  designNotes?: string;
  /** Original xlsx presentation (fill color, bold) per feature-tree field on
   * this row, keyed by field name ("version", "level2", etc). Only present
   * for tabs converted with style capture (currently 2-Line IA) -- lets the
   * frontend reproduce the source sheet's own tree/depth visual language
   * instead of flattening it. Absent for tabs without this (e.g. Scan). */
  cellStyle?: Record<string, CellStyle>;
}

export interface HeaderStyle {
  treeHeaderFill: string | null;
  /** Tab-wide fallback used only when a tab has no per-model familyFill
   * (e.g. 2-Line IA, where every model shares one family/color). Sheets
   * with per-model colors (e.g. Scan) leave this null and use
   * ModelInfo.familyFill/segmentFill instead. */
  modelHeaderFill?: string | null;
  modelSegmentFill?: string | null;
  statusRowFill: string | null;
  componentsBandFill: string | null;
  componentsBandLabel: string | null;
  quickSetsBandFill?: string | null;
  quickSetsBandLabel?: string | null;
  epicBandFill?: string | null;
  epicLabel?: string | null;
  notesLabel?: string | null;
}

export interface TabData {
  tab: string;
  sheetName: string;
  sourceFile: string;
  featureTreeColumns: string[];
  /** Human-readable header label per featureTreeColumns entry, taken
   * verbatim from the sheet (e.g. "Level 1" rather than "level2"). Optional
   * for backward compat with tabs converted before this existed. */
  featureTreeLabels?: string[];
  /** Ordered column labels for the "Components: Setting row" side-table
   * (e.g. "Level 1".."Level 6"), matching the keys inside each row's
   * componentSetting object. Optional -- only present for tabs that have
   * this side-table (currently 2-Line IA). */
  componentColumns?: string[];
  models: ModelInfo[];
  quickSetColumns: QuickSetColumn[];
  headerStyle?: HeaderStyle;
  rows: FeatureRow[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  type:
    | "row-added"
    | "row-removed"
    | "column-added"
    | "column-removed"
    | "cell-changed"
    | "field-changed";
  summary: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  /** Display name of whoever clicked Save. There's no auth in this app, so
   * this is self-reported by the browser (see AUTHOR_STORAGE_KEY in
   * IaDocumentationWorkspace.tsx), not a verified identity. */
  user?: string;
}

export async function readSchema(): Promise<SchemaIndex> {
  const raw = await fs.readFile(SCHEMA_PATH, "utf-8");
  return JSON.parse(raw) as SchemaIndex;
}

export async function readTab(name: string): Promise<TabData | null> {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as TabData;
  } catch {
    return null;
  }
}

export async function writeTab(name: string, data: TabData): Promise<void> {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  const schema = await readSchema();
  const columns = [...data.featureTreeColumns, ...data.models.map((m) => `models.${m.key}`)];
  const tabs = schema.tabs.filter((t) => t.name !== name);
  tabs.push({ name, columns });
  await fs.writeFile(SCHEMA_PATH, JSON.stringify({ tabs }, null, 2));
}

export async function readAuditLog(name: string): Promise<AuditEntry[]> {
  const filePath = path.join(AUDIT_DIR, `${name}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    return [];
  }
}

export async function appendAuditLog(name: string, entries: AuditEntry[]): Promise<AuditEntry[]> {
  if (entries.length === 0) return readAuditLog(name);
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  const existing = await readAuditLog(name);
  const updated = [...existing, ...entries];
  const filePath = path.join(AUDIT_DIR, `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
  return updated;
}
