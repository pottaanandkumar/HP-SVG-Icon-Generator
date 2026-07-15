import { NextResponse } from "next/server";
import { appendAuditLog, readAuditLog, type AuditEntry } from "@/lib/iaDocRepo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const entries = await readAuditLog(name);
  return NextResponse.json(entries);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const { entries } = (await req.json()) as { entries: AuditEntry[] };
  const all = await appendAuditLog(name, entries ?? []);
  return NextResponse.json(all);
}
