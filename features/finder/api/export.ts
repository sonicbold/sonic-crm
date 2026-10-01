import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/shared/route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file") ?? "";
  if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) {
    return jsonError("finder.export", "Invalid file", 400);
  }

  const full = path.join(process.cwd(), "data", "exports", file);
  try {
    const csv = await readFile(full, "utf8");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
      },
    });
  } catch {
    return jsonError("finder.export", "File not found", 404);
  }
}
