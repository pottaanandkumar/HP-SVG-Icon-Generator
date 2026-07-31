import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() ?? "";
const BASE_URL = get("AAVA_AGENT_BASE_URL") || "https://int-ai.aava.ai";
const EXECUTE_PATH = get("AAVA_AGENT_EXECUTE_PATH") || "/agents/execute/agent-executions";
const AGENT_ID = Number(get("AAVA_AGENT_ID") || 48295);
const TOKEN = get("AAVA_BEARER_TOKEN");

// A tiny valid 1x1 red PNG, base64-encoded.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const bytes = Buffer.from(PNG_B64, "base64");

async function tryFieldName(fieldName) {
  const form = new FormData();
  form.append("agentId", String(AGENT_ID));
  form.append("userInputs", JSON.stringify({ "{{icon_name}}": "reftest", "{{icon_description}}": "" }));
  form.append(fieldName, new Blob([bytes], { type: "image/png" }), "reference.png");

  const res = await fetch(`${BASE_URL}${EXECUTE_PATH}`, {
    method: "POST",
    headers: { Accept: "application/json, text/plain, */*", Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await res.text();
  console.log(`field="${fieldName}" -> HTTP ${res.status}:`, text.slice(0, 300));
}

await tryFieldName("files");

async function tryFieldNameAndType(fieldName, filename, mime, data) {
  const form = new FormData();
  form.append("agentId", String(AGENT_ID));
  form.append("userInputs", JSON.stringify({ "{{icon_name}}": "reftest", "{{icon_description}}": "" }));
  form.append(fieldName, new Blob([data], { type: mime }), filename);

  const res = await fetch(`${BASE_URL}${EXECUTE_PATH}`, {
    method: "POST",
    headers: { Accept: "application/json, text/plain, */*", Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await res.text();
  console.log(`file="${filename}" mime="${mime}" -> HTTP ${res.status}:`, text.slice(0, 300));
}

const jpegBytes = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=", "base64");
await tryFieldNameAndType("files", "reference.jpg", "image/jpeg", jpegBytes);

await tryFieldNameAndType("files", "reference.txt", "text/plain", Buffer.from("hello"));
await tryFieldNameAndType("files", "reference.webp", "image/webp", bytes);
await tryFieldNameAndType("files", "reference.pdf", "application/pdf", Buffer.from("%PDF-1.4"));
