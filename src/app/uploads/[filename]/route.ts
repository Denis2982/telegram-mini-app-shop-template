import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const match = /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.(png|jpg|webp)$/i.exec(filename);
  if (!match) return new Response(null, { status: 404 });

  try {
    const image = await readFile(path.join(process.cwd(), "public", "uploads", filename));
    return new Response(new Uint8Array(image), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": IMAGE_TYPES[match[2].toLowerCase()],
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Response(null, { status: 404 });
    }
    console.error("Could not read uploaded product image", error);
    return new Response("Image unavailable", { status: 500 });
  }
}
