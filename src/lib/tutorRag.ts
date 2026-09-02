import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { embedText, embedTexts } from "@/lib/embeddings";

// Ports an instructor's existing Maizey-style prompt (which uses literal
// {context}/{question} placeholders) unchanged. If the prompt doesn't
// use those placeholders, the retrieved material is just appended.
export function renderSystemPrompt(
  template: string,
  vars: { context: string; question: string },
): string {
  if (template.includes("{context}") || template.includes("{question}")) {
    return template
      .replaceAll("{context}", vars.context)
      .replaceAll("{question}", vars.question);
  }
  return `${template}\n\nReference material:\n${vars.context}`;
}

const TOP_K = 5;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// Only ever pulls chunks belonging to this specific tutor's own
// materials — a tutor can't see another tutor's documents.
export async function retrieveContext(
  tutorTopicId: string,
  question: string,
): Promise<string> {
  const embedding = await embedText(question);
  const vectorLiteral = toVectorLiteral(embedding);

  const rows = await prisma.$queryRaw<{ content: string; fileName: string }[]>`
    SELECT mc.content, tm."fileName"
    FROM "MaterialChunk" mc
    JOIN "TutorMaterial" tm ON tm.id = mc."materialId"
    WHERE tm."tutorTopicId" = ${tutorTopicId} AND tm.status = 'READY'
    ORDER BY mc.embedding <=> ${vectorLiteral}::vector
    LIMIT ${TOP_K}
  `;

  if (rows.length === 0) return "";

  return rows
    .map((r) => `[From ${r.fileName}]\n${r.content}`)
    .join("\n\n---\n\n");
}

// Prisma's query builder has no vector column support (see the
// Unsupported("vector(1536)") field) — chunks are inserted via raw SQL.
export async function embedAndStoreChunks(
  materialId: string,
  chunks: string[],
): Promise<void> {
  if (chunks.length === 0) return;

  const embeddings = await embedTexts(chunks);

  for (let i = 0; i < chunks.length; i++) {
    const vectorLiteral = toVectorLiteral(embeddings[i]);
    await prisma.$executeRaw`
      INSERT INTO "MaterialChunk" (id, "materialId", "chunkIndex", content, embedding)
      VALUES (${randomUUID()}, ${materialId}, ${i}, ${chunks[i]}, ${vectorLiteral}::vector)
    `;
  }
}
