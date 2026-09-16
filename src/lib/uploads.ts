import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const UPLOAD_ACCEPT = Object.keys(ALLOWED).join(",");

export function uploadRoot() {
  // Configurable via env; not a static path Turbopack should trace into the build.
  return path.resolve(process.cwd(), /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "storage/uploads");
}

/** Signature bytes, so a renamed .exe is not accepted just because the browser says "image/png". */
function sniff(bytes: Uint8Array): string | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (starts([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

export type UploadResult = { ok: true; path: string | null } | { ok: false; error: string };

/**
 * Saves an optional file field. Returns the stored relative path (served from /files/…),
 * or null when no file was chosen.
 */
export async function saveUpload(value: FormDataEntryValue | null, folder: string): Promise<UploadResult> {
  if (!value || typeof value === "string" || value.size === 0) return { ok: true, path: null };
  if (value.size > MAX_BYTES) return { ok: false, error: "Files must be 5 MB or smaller." };

  const bytes = new Uint8Array(await value.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return { ok: false, error: "Only JPG, PNG, WebP or PDF files can be uploaded." };

  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
  const name = `${randomUUID()}${ALLOWED[type]}`;
  const dir = path.join(/* turbopackIgnore: true */ uploadRoot(), safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ dir, name), bytes);

  return { ok: true, path: `${safeFolder}/${name}` };
}

export async function deleteUpload(relativePath: string | null | undefined) {
  if (!relativePath) return;
  const full = resolveUpload(relativePath);
  if (!full) return;
  await unlink(full).catch(() => undefined);
}

/** Maps a stored relative path to an absolute one, refusing anything outside the upload root. */
export function resolveUpload(relativePath: string) {
  const root = uploadRoot();
  const full = path.resolve(/* turbopackIgnore: true */ root, relativePath);
  if (!full.startsWith(root + path.sep)) return null;
  return full;
}

export function fileUrl(relativePath: string | null | undefined) {
  return relativePath ? `/files/${relativePath}` : null;
}

export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};
