import { randomUUID } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import mammoth from "mammoth";
import PptxParser from "node-pptx-parser";
import type { MaterialType } from "@prisma/client";

export async function extractText(
  buffer: Buffer,
  fileType: MaterialType,
): Promise<string> {
  if (fileType === "TXT") {
    return buffer.toString("utf-8");
  }

  if (fileType === "DOCX") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // node-pptx-parser only accepts a file path, not a buffer — Vercel's
  // serverless functions have a writable /tmp, same as local os.tmpdir().
  const tmpPath = path.join(tmpdir(), `${randomUUID()}.pptx`);
  await writeFile(tmpPath, buffer);
  try {
    const parser = new PptxParser(tmpPath);
    const slides = await parser.extractText();
    return slides.map((slide) => slide.text.join("\n")).join("\n\n");
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

// Simple fixed-size sliding-window chunking — no sentence-boundary
// awareness. Good enough for lecture notes/slides at this scale.
export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}
