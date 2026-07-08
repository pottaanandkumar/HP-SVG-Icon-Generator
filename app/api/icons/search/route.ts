import { NextRequest, NextResponse } from "next/server";
import { searchIconRepo } from "@/lib/iconRepo";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Missing 'name' query param" }, { status: 400 });
  }

  const matches = await searchIconRepo(query);
  return NextResponse.json({ query, matches });
}
