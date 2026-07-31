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
  /** True if reference images were provided but AAVA rejected them (file
   * type not allowed for this agent) and the job ran without them. */
  referenceImagesRejected?: boolean;
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

  return { semanticMatch, namedFeatureResearch, structuralApproaches };
}

export interface AgentIconRequestOptions {
  description?: string;
  size?: string;
  color?: string;
  states?: string[];
  /** Data URIs (e.g. "data:image/png;base64,...") from the browser's file
   * picker -- optional, never persisted, only ever forwarded to AAVA. */
  referenceImages?: string[];
}

interface SubmitResult {
  raw: unknown;
  jobId?: number;
  executionId?: string;
  /** True if reference images were provided but AAVA rejected them (see
   * dataUrlToBlob doc comment) and the job was submitted without them. */
  referenceImagesRejected?: boolean;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) return null;
  const [, mime, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const ext = mime.split("/")[1] ?? "bin";
  return { blob: new Blob([bytes], { type: mime }), ext };
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
  const buildForm = (withImages: boolean) => {
    const form = new FormData();
    form.append("agentId", String(AGENT_ID));
    form.append("userInputs", JSON.stringify(userInputs));
    if (withImages) {
      for (const dataUrl of options.referenceImages ?? []) {
        const converted = dataUrlToBlob(dataUrl);
        if (converted) form.append("files", converted.blob, `reference.${converted.ext}`);
      }
    }
    return form;
  };

  const submit = (form: FormData) =>
    fetch(`${BASE_URL}${EXECUTE_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: form,
    });

  const hasImages = (options.referenceImages?.length ?? 0) > 0;
  let res = await submit(buildForm(hasImages));
  let referenceImagesRejected = false;

  // Confirmed live against AAVA: this agent's file-upload config doesn't
  // currently allow image MIME types ("File type not allowed: <name>"),
  // even though the "files" field itself is recognized and works for other
  // file types (verified with .txt/.pdf). Rather than failing the whole
  // generation over an attachment AAVA won't accept yet, retry once without
  // images and tell the caller so the UI can say so honestly.
  if (!res.ok && hasImages) {
    const bodyText = await res.text().catch(() => "");
    if (res.status === 400 && /file type not allowed/i.test(bodyText)) {
      referenceImagesRejected = true;
      res = await submit(buildForm(false));
    } else {
      throw new Error(`Agent request failed (${res.status}): ${bodyText || res.statusText}`);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Agent request failed (${res.status}): ${body || res.statusText}`);
  }

  const raw = await res.json().catch(async () => await res.text());
  const data = (raw as { data?: { jobId?: number; agentExecutionId?: string } })?.data;
  return { raw, jobId: data?.jobId, executionId: data?.agentExecutionId, referenceImagesRejected };
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
    return {
      status: "SUCCESS",
      svgs: extractSvgs(history.raw),
      analysis: parseAgentAnalysis(history.raw),
      raw: history.raw,
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
    return {
      raw: submitted.raw,
      svgs: extractSvgs(submitted.raw),
      analysis: parseAgentAnalysis(submitted.raw),
      submitted: false,
      referenceImagesRejected: submitted.referenceImagesRejected,
    };
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
        analysis: parseAgentAnalysis(lastHistory.raw),
        submitted: true,
        jobId: submitted.jobId,
        executionId: submitted.executionId,
        referenceImagesRejected: submitted.referenceImagesRejected,
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
    referenceImagesRejected: submitted.referenceImagesRejected,
  };
}
