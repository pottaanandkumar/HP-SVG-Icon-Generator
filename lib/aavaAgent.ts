import { isValidSvgMarkup } from "./svgValidation";
import type { AgentAnalysis } from "./types";

const BASE_URL = process.env.AAVA_AGENT_BASE_URL ?? "https://int-ai.aava.ai";
const EXECUTE_PATH = process.env.AAVA_AGENT_EXECUTE_PATH ?? "/agents/execute/agent-executions";
const HISTORY_PATH = process.env.AAVA_AGENT_HISTORY_PATH ?? "/agents/execute/history/execution";
const AGENT_ID = Number(process.env.AAVA_AGENT_ID ?? 48295);
const TOKEN = process.env.AAVA_BEARER_TOKEN ?? "";

const POLL_INTERVAL_MS = 3000;
// Kept well under typical proxy/gateway request timeouts (Render, Vercel,
// etc. all cap how long a single HTTP request may stay open, regardless of
// what timeout we set here) -- runs that take longer than this hand off to
// checkIconGeneratorExecution() for the frontend to keep polling on its own
// short-lived requests instead of trying to hold one connection open for
// the whole thing. ~60-90s covers the common case in a single round trip.
const POLL_TIMEOUT_MS = 90_000;

export interface AgentIconResult {
  raw: unknown;
  svgs: string[];
  analysis: AgentAnalysis;
  submitted: boolean;
  jobId?: number;
  executionId?: string;
  /** True if we hit POLL_TIMEOUT_MS before the job reached a terminal status. */
  timedOut?: boolean;
  /** True when the agent's own response was cut off mid-generation (hit its
   * output length limit) before finishing every variant it said it would
   * produce -- see detectTruncation. When true, svgs still holds every
   * complete, valid icon that actually made it into the response; nothing
   * is fabricated to fill the gap, the frontend just gets told the count
   * came up short instead of silently showing fewer icons than promised. */
  truncated?: boolean;
  /** The variant count the agent's own preamble claimed (e.g. "All 20
   * variants explore..."), when the response states one. Undefined if the
   * response never stated a target count. */
  expectedVariantCount?: number;
}

const SVG_TAG_RE = /<svg[\s\S]*?<\/svg>/gi;

/** Collapses whitespace/quote-style differences so the same icon shown
 * twice — once in a ```svg fenced block, once again inside a data-URI <img>
 * preview with different quoting — collapses to a single entry. LLM output
 * formatting isn't consistent enough to rely on fence-detection alone. */
function normalizeSvgKey(svg: string): string {
  return svg.replace(/\s+/g, "").replace(/['"]/g, "'").toLowerCase();
}

function extractSvgsFromText(text: string): string[] {
  const found = text.match(SVG_TAG_RE) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const svg of found) {
    // The agent is an LLM and occasionally emits a path with a malformed
    // number (token-generation slip) — drop those rather than shipping a
    // visibly broken icon to the browser.
    if (!isValidSvgMarkup(svg)) continue;
    const key = normalizeSvgKey(svg);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(svg);
    }
  }
  return result;
}

/** The agent's response is either a plain string or an object with an
 * `output` string field (see fetchExecutionHistory below) — this pulls out
 * the actual free-text reasoning either way, falling back to a raw JSON dump
 * only if neither shape matches (extraction below then just finds nothing,
 * rather than throwing). */
function getOutputText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  const output = (payload as { output?: unknown })?.output;
  if (typeof output === "string") return output;
  return JSON.stringify(payload);
}

function extractSvgs(payload: unknown): string[] {
  return extractSvgsFromText(getOutputText(payload));
}

/** Detects when the agent's response was cut off mid-generation (hit its own
 * output length limit) before finishing every variant it said it would
 * produce -- confirmed live: a "System Health Apps" run whose preamble said
 * "All 20 variants explore..." actually delivered only 12 complete SVGs,
 * with the 13th cut off mid-<path>, no closing </svg>, and variants 14-20
 * never generated at all. Two signals, either one is enough:
 *   1. The preamble states a target count ("All N variants") higher than
 *      how many actually came through.
 *   2. The last "**Variant" header in the text has an unclosed <svg> (or no
 *      <svg> at all) after it -- the response stopped mid-variant.
 * Not a parsing bug: this data genuinely isn't in the response, so the only
 * honest fix is telling the user rather than silently showing fewer icons
 * than the agent promised. */
function detectTruncation(
  text: string,
  actualCount: number
): { truncated: boolean; expectedVariantCount?: number } {
  const claimedMatch = text.match(/All (\d+) variants/i);
  const expectedVariantCount = claimedMatch ? Number(claimedMatch[1]) : undefined;
  if (expectedVariantCount && actualCount < expectedVariantCount) {
    return { truncated: true, expectedVariantCount };
  }

  const trailing = text.slice(-4000);
  const lastVariantIdx = trailing.lastIndexOf("**Variant");
  if (lastVariantIdx !== -1) {
    const afterLastVariant = trailing.slice(lastVariantIdx);
    // The last variant header in the whole response has no closing </svg>
    // after it -- either its SVG never finished, or it never started at
    // all, either way the response ended mid-variant.
    if (!/<\/svg>/i.test(afterLastVariant)) {
      return { truncated: true, expectedVariantCount };
    }
  }

  return { truncated: false, expectedVariantCount };
}

/** Reads a top-level `"key": "value"` string field out of (possibly
 * truncated, possibly non-JSON) response text by key name rather than
 * requiring the whole payload to be valid JSON. Unescapes standard JSON
 * string escapes (\n, \", etc.) in the captured value. */
function extractJsonStringField(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

/** Pulls the agent's own stated reasoning out of its free-text response --
 * never fabricated. Every field is optional: if a given run's output
 * doesn't include that part (wording varies run to run), the field is just
 * left undefined so the frontend can skip that section instead of showing
 * a placeholder. Verified against a real "printer" run — see
 * scripts/inspect-raw-agent.mjs. */
function parseAgentAnalysis(payload: unknown): AgentAnalysis {
  const text = getOutputText(payload);
  const semanticMatch = text.match(/Semantic Match:\s*(.+)/)?.[1]?.trim();
  const namedFeatureResearch = text.match(/Named-Feature Research:\s*(.+)/)?.[1]?.trim();

  const approachesBlock = text.match(
    /Structural Approaches Used:\s*\n([\s\S]*?)(?:\n\s*\n|\n---|\nOption \d+:)/
  )?.[1];
  const structuralApproaches = approachesBlock
    ? Array.from(approachesBlock.matchAll(/^\s*\d+\.\s*(.+)$/gm)).map((m) => m[1].trim())
    : [];

  // Some agent runs open with an explicit framing block instead: "User
  // Goal: Generate 20 distinct HP-compliant SVG icon variants representing
  // a printer paper tray" / "Action: Construct 20 filled-path evenodd SVG
  // icons on 24×24 canvas..." / "Expected Interpretation: 'Printer tray
  // icon — a flat-bottomed rectangular tray form...'". Verified live against
  // a real "printer tray" run. Surrounding quotes on Expected Interpretation
  // are stripped for display -- they're just how the agent quotes its own
  // description, not part of the content.
  //
  // The current agent ("Enterprise SVG Icon Design System Guardian") instead
  // emits a JSON object with "user_goal"/"action"/"expected_interpretation"
  // keys -- verified live. These are pulled by key via regex rather than a
  // full JSON.parse of the whole response: the object's trailing "svgs"
  // array is what hits the agent's own output-length limit (see
  // detectTruncation above), so the response is very often truncated by the
  // time it reaches these three fields' closing brace -- a strict parse
  // would throw on that truncated tail and lose fields that are themselves
  // fully intact, since they sit earlier in the object.
  const userGoal =
    extractJsonStringField(text, "user_goal") ?? text.match(/User Goal:\s*(.+)/)?.[1]?.trim();
  const action =
    extractJsonStringField(text, "action") ?? text.match(/Action:\s*(.+)/)?.[1]?.trim();
  const expectedInterpretation =
    extractJsonStringField(text, "expected_interpretation") ??
    text
      .match(/Expected Interpretation:\s*(.+)/)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  const semanticAnalysis =
    userGoal || action || expectedInterpretation
      ? { userGoal, action, expectedInterpretation }
      : undefined;

  return { semanticMatch, namedFeatureResearch, structuralApproaches, semanticAnalysis };
}

export interface AgentIconRequestOptions {
  description?: string;
  size?: string;
  color?: string;
  states?: string[];
}

interface SubmitResult {
  raw: unknown;
  jobId?: number;
  executionId?: string;
}

async function submitJob(
  iconName: string,
  options: AgentIconRequestOptions
): Promise<SubmitResult> {
  // The input key format is a property of whichever agent AAVA_AGENT_ID
  // currently points at, not a fixed platform rule -- it has changed at
  // least once as the configured agent itself changed. An earlier agent's
  // prompt template specifically required braced "{{icon_name}}" /
  // "{{icon_description}}" keys (bare names bound unreliably for it). The
  // agent now configured ("Enterprise SVG Icon Design System Guardian")
  // instead reads a literal input.json file via FileReadTool and its own
  // written contract explicitly requires bare "icon_name" / "icon_description"
  // -- "do not substitute iconName/description or any other casing/naming
  // variant" (no braces mentioned at all). Confirmed live: submitting with
  // braced keys failed in ~22s (an immediate input-parsing rejection);
  // submitting with bare keys ran for a genuine ~5 minutes before failing on
  // an unrelated AI Gateway 500 (the same INTERNAL_001 infra error already
  // seen in this agent's own execution logs) -- i.e. bare keys are read
  // correctly and the pipeline actually runs. If AAVA_AGENT_ID changes again
  // to a differently-configured agent, re-verify this against that agent's
  // own documented input contract rather than assuming either format holds.
  const userInputs = {
    icon_name: iconName,
    icon_description: options.description ?? "",
  };

  // This endpoint only accepts multipart/form-data — application/json gets a
  // 415. Do not set a Content-Type header: fetch derives the correct
  // multipart boundary automatically from the FormData body.
  const form = new FormData();
  form.append("agentId", String(AGENT_ID));
  form.append("userInputs", JSON.stringify(userInputs));

  const res = await fetch(`${BASE_URL}${EXECUTE_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Agent request failed (${res.status}): ${body || res.statusText}`);
  }

  const raw = await res.json().catch(async () => await res.text());
  const data = (raw as { data?: { jobId?: number; agentExecutionId?: string } })?.data;
  return { raw, jobId: data?.jobId, executionId: data?.agentExecutionId };
}

interface HistoryResult {
  raw: unknown;
  status?: string;
  output?: string;
}

async function fetchExecutionHistory(executionId: string): Promise<HistoryResult> {
  const res = await fetch(
    `${BASE_URL}${HISTORY_PATH}?execution_id=${encodeURIComponent(executionId)}`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`History lookup failed (${res.status}): ${body || res.statusText}`);
  }

  const raw = await res.json().catch(async () => await res.text());
  const status = (raw as { status?: string })?.status;
  const output = (raw as { output?: string })?.output;
  return { raw, status, output };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface AgentExecutionCheck {
  status: "SUCCESS" | "RUNNING" | "FAILURE";
  svgs: string[];
  analysis: AgentAnalysis;
  raw: unknown;
  truncated?: boolean;
  expectedVariantCount?: number;
}

/**
 * A single, non-looping status check against an already-submitted
 * execution — one fast HTTP round trip, safe to call repeatedly (e.g. every
 * few seconds from the browser) without the connection-held-open risk that
 * runIconGeneratorAgent's internal poll loop has for long-running jobs.
 * This is what backs the resumable-polling path: when the initial request
 * times out before the job finishes, the frontend switches to calling this
 * (via /api/agent/status) on its own schedule instead of giving up.
 */
export async function checkIconGeneratorExecution(executionId: string): Promise<AgentExecutionCheck> {
  const history = await fetchExecutionHistory(executionId);
  const status = history.status?.toUpperCase();

  if (status === "SUCCESS") {
    const svgs = extractSvgs(history.raw);
    const { truncated, expectedVariantCount } = detectTruncation(getOutputText(history.raw), svgs.length);
    return {
      status: "SUCCESS",
      svgs,
      analysis: parseAgentAnalysis(history.raw),
      raw: history.raw,
      truncated,
      expectedVariantCount,
    };
  }
  if (status === "FAILURE" || status === "ERROR" || status === "FAILED") {
    return { status: "FAILURE", svgs: [], analysis: { structuralApproaches: [] }, raw: history.raw };
  }
  return { status: "RUNNING", svgs: [], analysis: { structuralApproaches: [] }, raw: history.raw };
}

// Kept as a general safety net for one-off agent flakiness (the "edit"
// binding bug above is deterministic and not something a retry fixes --
// agentSafeIconName() is the actual fix for that one).
const MAX_ATTEMPTS = 3;

export async function runIconGeneratorAgent(
  iconName: string,
  options: AgentIconRequestOptions = {}
): Promise<AgentIconResult> {
  let lastResult: AgentIconResult | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // runIconGeneratorAgentOnce throws when AAVA reports a genuine FAILURE/
    // ERROR status for this attempt (not just "no svgs") -- without this
    // try/catch, that throw would escape the loop on attempt 1 and MAX_ATTEMPTS
    // would never actually get a chance to retry, defeating its own purpose.
    try {
      lastResult = await runIconGeneratorAgentOnce(iconName, options);
      lastError = null;
      if (lastResult.svgs.length > 0 || lastResult.timedOut) return lastResult;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return lastResult!;
}

async function runIconGeneratorAgentOnce(
  iconName: string,
  options: AgentIconRequestOptions = {}
): Promise<AgentIconResult> {
  const submitted = await submitJob(iconName, options);

  if (!submitted.executionId) {
    // Submitted but no execution id to poll — return whatever we got.
    const svgs = extractSvgs(submitted.raw);
    const { truncated, expectedVariantCount } = detectTruncation(getOutputText(submitted.raw), svgs.length);
    return {
      raw: submitted.raw,
      svgs,
      analysis: parseAgentAnalysis(submitted.raw),
      submitted: false,
      truncated,
      expectedVariantCount,
    };
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastHistory: HistoryResult = { raw: null };

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lastHistory = await fetchExecutionHistory(submitted.executionId);

    const status = lastHistory.status?.toUpperCase();
    if (status === "SUCCESS") {
      const svgs = extractSvgs(lastHistory.raw);
      const { truncated, expectedVariantCount } = detectTruncation(getOutputText(lastHistory.raw), svgs.length);
      return {
        raw: lastHistory.raw,
        svgs,
        analysis: parseAgentAnalysis(lastHistory.raw),
        submitted: true,
        jobId: submitted.jobId,
        executionId: submitted.executionId,
        truncated,
        expectedVariantCount,
      };
    }
    if (status === "FAILURE" || status === "ERROR" || status === "FAILED") {
      throw new Error(
        `Agent execution ${submitted.executionId} failed: ${JSON.stringify(lastHistory.raw)}`
      );
    }
    // Otherwise still running (e.g. PENDING/RUNNING/IN_PROGRESS) — keep polling.
  }

  return {
    raw: lastHistory.raw,
    svgs: [],
    analysis: { structuralApproaches: [] },
    submitted: true,
    jobId: submitted.jobId,
    executionId: submitted.executionId,
    timedOut: true,
  };
}
