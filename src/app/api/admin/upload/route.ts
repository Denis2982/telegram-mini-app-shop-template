import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { fail, json, withAdmin } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/png": { extension: "png", matches: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  "image/webp": { extension: "webp", matches: (data: Buffer) => data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
} as const;

export const POST = withAdmin(async (req) => {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return fail("File is required");
  if (!file.size) return fail("File is empty");
  if (file.size > MAX_FILE_SIZE) return fail("File exceeds the 10 MB limit", 413);

  const type = IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES];
  if (!type) return fail("Only PNG, JPG, and WebP images are allowed");

  const data = Buffer.from(await file.arrayBuffer());
  if (!type.matches(data)) return fail("File content does not match its image type");

  const filename = `${randomUUID()}.${type.extension}`;
  if (process.env.VERCEL === "1") {
    if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
      return fail("Image storage is not configured. Connect a Vercel Blob store.", 503);
    }
    try {
      const blob = await put(filename, data, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type,
      });
      return json({ url: blob.url });
    } catch (error) {
      console.error("Could not upload product image to Vercel Blob", error);
      return fail("Could not upload image to Vercel Blob", 502);
    }
  }

  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  try {
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), data, { flag: "wx" });
  } catch (error) {
    console.error("Could not save uploaded product image", error);
    return fail("Image storage is unavailable; the server cannot write to its uploads directory", 503);
  }

  return json({ url: `/uploads/${filename}` });
});
