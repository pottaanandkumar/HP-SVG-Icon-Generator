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
    ? `"${iconName}" is already in the HP Echo icon library.`
    : hasConfidentIconMatch(iconName)
      ? `"${iconName}" icon is generated and ready to update or customize for the library.`
      : null;

  try {
    const result = await runIconGeneratorAgent(iconName, {
      description,
      size: body?.size,
      color: body?.color,
      states: body?.states,
      referenceImages: Array.isArray(body?.referenceImages) ? body.referenceImages : undefined,
    });
    if (result.svgs.length > 0) {
      // Show every icon the agent actually returned — its own prompt says
      // "exactly 4 or 5, never more" but it's been observed ignoring that
      // and returning more; per explicit product direction, all of them
      // should reach the frontend rather than being silently truncated.
      return NextResponse.json({
        ok: true,
        svgs: result.svgs,
        analysis: result.analysis,
        executionId: result.executionId,
        jobId: result.jobId,
        libraryNote,
        referenceImagesRejected: result.referenceImagesRejected ?? false,
      });
    }
    const error = result.timedOut
      ? `The agent job (execution ${result.executionId ?? result.jobId}) is taking longer than usual — still checking in the background.`
      : result.submitted
        ? `The agent finished (execution ${result.executionId ?? result.jobId}) but didn't return any icon markup.`
        : "The research agent responded but didn't return any icon markup.";
    return NextResponse.json({
      ok: false,
      error,
      svgs: [],
      libraryNote,
      // timedOut + executionId let the frontend keep polling /api/agent/status
      // for this same job instead of treating "still running" as a dead end.
      timedOut: result.timedOut ?? false,
      executionId: result.executionId,
      jobId: result.jobId,
      referenceImagesRejected: result.referenceImagesRejected ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent request failed";
    return NextResponse.json({ ok: false, error: message, svgs: [], libraryNote });
  }
}
