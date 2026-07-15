import { NextResponse } from "next/server";
import { readSchema } from "@/lib/iaDocRepo";

export async function GET() {
  const schema = await readSchema();
  return NextResponse.json(schema);
}
