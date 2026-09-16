import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { MIME_BY_EXT, resolveUpload } from "@/lib/uploads";

export async function GET(_request: NextRequest, ctx: RouteContext<"/files/[...path]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const segments = (await ctx.params).path;
  const full = resolveUpload(segments.join("/"));
  const type = full ? MIME_BY_EXT[path.extname(full).toLowerCase()] : undefined;
  if (!full || !type) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await readFile(/* turbopackIgnore: true */ full);
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
