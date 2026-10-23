import "server-only";

export async function boundedText(message: Request | Response, maximum: number): Promise<string | null> {
  if (Number(message.headers.get("content-length")) > maximum) return null;
  if (!message.body) return "";
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
