import { NextResponse } from "next/server";
import { readSchema, readTab, type FeatureRow } from "@/lib/iaDocRepo";
import { runIaDocumentationAgent } from "@/lib/iaDocumentationAgent";

const MAX_ROWS = 40;

function featurePath(row: FeatureRow): string {
  return [row.level2, row.level3, row.level4, row.level5, row.level6, row.level7]
    .filter(Boolean)
    .join(" > ");
}

function relevantRows(rows: FeatureRow[], query: string): FeatureRow[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows.slice(0, MAX_ROWS);

  const scored = rows
    .map((row) => {
      const text = featurePath(row).toLowerCase();
      const hits = terms.filter((t) => text.includes(t)).length;
      return { row, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const picked = scored.length > 0 ? scored.map((s) => s.row) : rows;
  return picked.slice(0, MAX_ROWS);
}

export async function POST(req: Request) {
  const { query, tab } = (await req.json()) as { query?: string; tab?: string };
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const schema = await readSchema();
  const tabData = tab ? await readTab(tab) : null;

  const rows = tabData ? relevantRows(tabData.rows, query) : [];
  const activeSchema = {
    availableTabs: schema.tabs.map((t) => t.name),
    activeTab: tab ?? null,
    models: tabData?.models.map((m) => ({
      key: m.key,
      family: m.family,
      segment: m.segment,
      engineClass: m.engineClass,
      status: m.status,
    })),
  };
  const matrixState = {
    rows: rows.map((row) => ({
      feature: featurePath(row),
      version: row.version,
      source: row.source,
      // Only send models that have a meaningful (non "n/a") value -- keeps
      // the payload small since most cells in this sheet are "n/a".
      supportedModels: row.models
        ? Object.entries(row.models).filter(([, v]) => v && v !== "n/a")
        : [],
    })),
  };

  const result = await runIaDocumentationAgent(query, { activeSchema, matrixState });
  return NextResponse.json({ ...result, rowsSent: rows.length });
}
