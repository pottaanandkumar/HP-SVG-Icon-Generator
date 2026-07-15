import { NextResponse } from "next/server";
import { readTab, writeTab, type TabData } from "@/lib/iaDocRepo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const tab = await readTab(name);
  if (!tab) {
    return NextResponse.json({ error: `No data for tab "${name}"` }, { status: 404 });
  }
  return NextResponse.json(tab);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const data = (await req.json()) as TabData;
  await writeTab(name, data);
  return NextResponse.json({ ok: true });
}
