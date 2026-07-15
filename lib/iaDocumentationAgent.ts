const BASE_URL = process.env.AAVA_AGENT_BASE_URL ?? "https://int-ai.aava.ai";
const EXECUTE_PATH = process.env.AAVA_AGENT_EXECUTE_PATH ?? "/agents/execute/agent-executions";
const HISTORY_PATH = process.env.AAVA_AGENT_HISTORY_PATH ?? "/agents/execute/history/execution";
const AGENT_ID = Number(process.env.AAVA_IA_DOC_AGENT_ID ?? 49331);
const TOKEN = process.env.AAVA_BEARER_TOKEN ?? "";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 150_000;

export interface IaDocAgentResult {
  raw: unknown;
  answer: string;
  submitted: boolean;
  jobId?: number;
  executionId?: string;
  timedOut?: boolean;
}

interface SubmitResult {
  raw: unknown;
  jobId?: number;
  executionId?: string;
}

export interface IaDocContext {
  activeSchema: unknown;
  matrixState: unknown;
}

async function submitJob(query: string, context: IaDocContext): Promise<SubmitResult> {
  // A first live call to this agent (before these aliases existed) came back
  // asking by name for "Current Matrix State" and "Active Schema" -- its
  // system prompt uses that exact vocabulary (matches the architecture spec
  // this agent was built from). Variable-name aliasing otherwise mirrors the
  // sibling icon-generator agent (lib/aavaAgent.ts), whose template variable
  // name is inconsistent run to run.
  const matrixState = JSON.stringify(context.matrixState);
  const activeSchema = JSON.stringify(context.activeSchema);
  const userInputs = {
    query,
    prompt: query,
    question: query,
    message: query,
    matrix_state: matrixState,
    matrixState,
    current_matrix_state: matrixState,
    currentMatrixState: matrixState,
    current_state: matrixState,
    matrix: matrixState,
    feature_matrix: matrixState,
    featureMatrix: matrixState,
    tab_data: matrixState,
    tabData: matrixState,
    active_context: matrixState,
    activeContext: matrixState,
    rows: matrixState,
    state: matrixState,
    data: matrixState,
    active_schema: activeSchema,
    activeSchema,
    schema: activeSchema,
  };

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

function extractAnswer(payload: unknown): string {
  if (typeof payload === "string") return payload;
  const output = (payload as { output?: unknown })?.output;
  if (typeof output === "string") return output;
  return JSON.stringify(payload);
}

export async function runIaDocumentationAgent(
  query: string,
  context: IaDocContext
): Promise<IaDocAgentResult> {
  const submitted = await submitJob(query, context);

  if (!submitted.executionId) {
    return { raw: submitted.raw, answer: extractAnswer(submitted.raw), submitted: false };
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
        answer: extractAnswer(lastHistory.raw),
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
  }

  return {
    raw: lastHistory.raw,
    answer: "",
    submitted: true,
    jobId: submitted.jobId,
    executionId: submitted.executionId,
    timedOut: true,
  };
}
