import { NextRequest, NextResponse } from "next/server";
import { checkIconGeneratorExecution } from "@/lib/aavaAgent";

/**
 * Cheap, single-shot poll for a job already submitted via /api/agent/generate.
 * The frontend calls this on its own schedule when the initial request times
 * out before the agent finishes, instead of the server trying to hold one
 * HTTP connection open for the entire run (see POLL_TIMEOUT_MS comment in
 * lib/aavaAgent.ts for why that's the wrong place to fix this).
 */
export async function GET(req: NextRequest) {
  const executionId = req.nextUrl.searchParams.get("executionId");
  if (!executionId) {
    return NextResponse.json({ error: "Missing 'executionId' query param" }, { status: 400 });
  }

  try {
    const result = await checkIconGeneratorExecution(executionId);

    if (result.status === "SUCCESS") {
      return NextResponse.json({
        ok: true,
        done: true,
        svgs: result.svgs,
        analysis: result.analysis,
        truncated: result.truncated ?? false,
        expectedVariantCount: result.expectedVariantCount,
      });
    }
    if (result.status === "FAILURE") {
      return NextResponse.json({
        ok: false,
        done: true,
        error: `Agent execution ${executionId} failed.`,
        svgs: [],
      });
    }
    return NextResponse.json({ ok: true, done: false, svgs: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    // Not done=true -- a transient network hiccup checking status shouldn't
    // permanently fail a job that may otherwise still be running fine.
    return NextResponse.json({ ok: false, done: false, error: message }, { status: 502 });
  }
}
