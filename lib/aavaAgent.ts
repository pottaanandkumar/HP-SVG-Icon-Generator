import { isValidSvgMarkup } from "./svgValidation";

const BASE_URL = process.env.AAVA_AGENT_BASE_URL ?? "https://int-ai.aava.ai";
const EXECUTE_PATH = process.env.AAVA_AGENT_EXECUTE_PATH ?? "/agents/execute/agent-executions";
const HISTORY_PATH = process.env.AAVA_AGENT_HISTORY_PATH ?? "/agents/execute/history/execution";
const AGENT_ID = Number(process.env.AAVA_AGENT_ID ?? 48295);
const TOKEN = process.env.AAVA_BEARER_TOKEN ?? "";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 150_000; // observed real runs take ~80s; give headroom

export interface AgentIconResult {
  raw: unknown;
  svgs: string[];
  submitted: boolean;
  jobId?: number;
  executionId?: string;
  /** True if we hit POLL_TIMEOUT_MS before the job reached a terminal status. */
  timedOut?: boolean;
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

function extractSvgs(payload: unknown): string[] {
  if (typeof payload === "string") return extractSvgsFromText(payload);
  const output = (payload as { output?: unknown })?.output;
  if (typeof output === "string") return extractSvgsFromText(output);
  return extractSvgsFromText(JSON.stringify(payload));
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
  // AAVA's input binding for this agent requires the userInputs keys to be
  // the literal "{{icon_name}}" / "{{icon_description}}" strings -- braces
  // included -- not the bare "icon_name" / "icon_description". Sending the
  // bare names appears to bind *sometimes* (probably via some fuzzy/fallback
  // matching on AAVA's side), which is what made this look like flaky,
  // input-dependent failures ("edit" reliably broken, then later "printer"
  // and even previously-100%-reliable words like "settings" failing too)
  // rather than a single reproducible cause. Confirmed by testing the exact
  // same payload shape both ways, repeatedly, directly against AAVA
  // (bypassing this app): bare keys intermittently collapse icon_name to a
  // stray "." regardless of word; the braced keys below bound correctly on
  // every retry, including for "edit" with no other workaround needed.
  const userInputs = {
    "{{icon_name}}": iconName,
    "{{icon_description}}": options.description ?? "",
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

// Kept as a general safety net for one-off agent flakiness (the "edit"
// binding bug above is deterministic and not something a retry fixes --
// agentSafeIconName() is the actual fix for that one).
const MAX_ATTEMPTS = 3;

export async function runIconGeneratorAgent(
  iconName: string,
  options: AgentIconRequestOptions = {}
): Promise<AgentIconResult> {
  let lastResult: AgentIconResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await runIconGeneratorAgentOnce(iconName, options);
    if (lastResult.svgs.length > 0 || lastResult.timedOut) return lastResult;
  }
  return lastResult!;
}

async function runIconGeneratorAgentOnce(
  iconName: string,
  options: AgentIconRequestOptions = {}
): Promise<AgentIconResult> {
  const submitted = await submitJob(iconName, options);

  if (!submitted.executionId) {
    // Submitted but no execution id to poll — return whatever we got.
    return { raw: submitted.raw, svgs: extractSvgs(submitted.raw), submitted: false };
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastHistory: HistoryResult = { raw: null };

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lastHistory = await fetchExecutionHistory(submitted.executionId);

    const status = lastHistory.status?.toUpperCase();
    if (status === "SUCCESS") {
      return {
        raw: lastHistory.raw,
        svgs: extractSvgs(lastHistory.raw),
        submitted: true,
        jobId: submitted.jobId,
        executionId: submitted.executionId,
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
    submitted: true,
    jobId: submitted.jobId,
    executionId: submitted.executionId,
    timedOut: true,
  };
}
