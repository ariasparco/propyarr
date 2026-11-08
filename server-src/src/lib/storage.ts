import 'server-only';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Identity documents are written outside the public directory and served only
// through an authorised route, so nothing is reachable by guessing a URL. The
// database keeps a relative path instead of megabytes of base64.

const ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(process.cwd(), 'storage');

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type StoredFile = { relativePath: string; mime: string };

/** Decode a `data:image/...;base64,...` URI and write it to disk. */
export async function saveDataUri(
  dataUri: string,
  folder: string,
): Promise<StoredFile | null> {
  const match = /^data:([\w/+-]+);base64,(.+)$/s.exec(dataUri);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return null;

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) return null;

  const dir = path.join(ROOT, folder);
  await mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await writeFile(path.join(dir, name), buffer);
  return { relativePath: `${folder}/${name}`, mime };
}

function resolveSafe(relativePath: string): string | null {
  const full = path.resolve(ROOT, relativePath);
  // Reject anything that escapes the storage root.
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

export async function readStored(
  relativePath: string,
): Promise<{ body: Buffer; mime: string } | null> {
  const full = resolveSafe(relativePath);
  if (!full) return null;
  try {
    const body = await readFile(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime =
      Object.entries(EXT).find(([, e]) => e === ext)?.[0] ??
      'application/octet-stream';
    return { body, mime };
  } catch {
    return null;
  }
}

export async function deleteStored(relativePath: string): Promise<void> {
  const full = resolveSafe(relativePath);
  if (!full) return;
  try {
    await unlink(full);
  } catch {
    /* already gone */
  }
}
