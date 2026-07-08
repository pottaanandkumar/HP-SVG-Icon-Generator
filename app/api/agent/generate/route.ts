import { NextRequest, NextResponse } from "next/server";
import { runIconGeneratorAgent } from "@/lib/aavaAgent";
import { hasConfidentIconMatch } from "@/lib/iconSearch";
import { searchIconRepo } from "@/lib/iconRepo";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const iconName = body?.iconName?.trim();
  const description = body?.description?.trim();

  if (!iconName) {
    return NextResponse.json({ error: "Missing 'iconName' in request body" }, { status: 400 });
  }

  // Icon options come exclusively from the AI agent's own response — per
  // explicit product direction, no library/keyword-search icons are mixed
  // in. libraryNote is informational only (surfaced alongside the agent's
  // icons, e.g. to point at the repo match already shown above it); it
  // never contributes icons of its own.
  const repoMatches = await searchIconRepo(iconName);
  const libraryNote = repoMatches.length
    ? `"${iconName}" is already in the HP icon repo above.`
    : hasConfidentIconMatch(iconName)
      ? `"${iconName}" also matches a verified icon in the general icon library.`
      : null;

  try {
    const result = await runIconGeneratorAgent(iconName, {
      description,
      size: body?.size,
      color: body?.color,
      states: body?.states,
    });
    if (result.svgs.length > 0) {
      return NextResponse.json({
        ok: true,
        svgs: result.svgs,
        executionId: result.executionId,
        jobId: result.jobId,
        libraryNote,
      });
    }
    const error = result.timedOut
      ? `The agent job (execution ${result.executionId ?? result.jobId}) is still running after the poll timeout — it may finish later, but this request gave up waiting.`
      : result.submitted
        ? `The agent finished (execution ${result.executionId ?? result.jobId}) but didn't return any icon markup.`
        : "The research agent responded but didn't return any icon markup.";
    return NextResponse.json({ ok: false, error, svgs: [], libraryNote });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent request failed";
    return NextResponse.json({ ok: false, error: message, svgs: [], libraryNote });
  }
}
