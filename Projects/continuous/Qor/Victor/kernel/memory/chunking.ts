import type { SourceChunkRecord, SourceDocumentRecord } from './types';
import { createSpan, hashContent, lineOffsets, normalizeText } from './provenance';

const DEFAULT_MAX_CHARS = 900;

export function chunkDocument(
  document: SourceDocumentRecord,
  content: string,
  maxChars = DEFAULT_MAX_CHARS,
): SourceChunkRecord[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const offsets = lineOffsets(normalized);
  const chunks: SourceChunkRecord[] = [];

  let buffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    if (buffer.length === 0) {
      return;
    }

    const text = normalizeText(buffer.join('\n'));
    if (!text) {
      buffer = [];
      startLine = endLine + 1;
      return;
    }

    const span = createSpan(startLine, endLine, offsets, offsets[endLine] ?? normalized.length);
    const index = chunks.length;
    chunks.push({
      id: hashContent(document.id, String(startLine), String(endLine)),
      documentId: document.id,
      index,
      fingerprint: hashContent(document.id, text),
      text,
      tokenEstimate: Math.max(1, Math.ceil(text.length / 4)),
      span,
    });

    buffer = [];
    startLine = endLine + 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const nextLength = buffer.concat(line).join('\n').length;
    const breakOnBlank = line.trim() === '' && buffer.length > 0;

    if (nextLength > maxChars || breakOnBlank) {
      flush(lineNumber - 1);
    }

    if (line.trim() !== '' || buffer.length > 0) {
      buffer.push(line);
    } else {
      startLine = lineNumber + 1;
    }
  }

  flush(lines.length);

  return chunks;
}
