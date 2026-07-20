export interface OllamaResponse {
  response: string;
  done: boolean;
}

const OLLAMA_BASE_URL = "https://api.axecompanion.com";

export async function queryOllama(
  prompt: string,
  model: string = "llama3.2",
  system?: string
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system: system || "You are an OSINT intelligence analyst. Provide concise, factual analysis. Always cite sources when possible. Use military/intel formatting.",
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 800,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.response || "";
}

export async function queryOllamaStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  model: string = "llama3.2",
  system?: string
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      system: system || "You are an OSINT intelligence analyst. Provide concise, factual analysis. Always cite sources when possible. Use military/intel formatting.",
      stream: true,
      options: {
        temperature: 0.7,
        num_predict: 800,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.response) {
          onChunk(json.response);
        }
      } catch {
        // skip invalid JSON
      }
    }
  }
}

export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: any) => m.name);
  } catch {
    return [];
  }
}

export function isOllamaAvailable(): Promise<boolean> {
  return fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: "GET", signal: AbortSignal.timeout(3000) })
    .then((r) => r.ok)
    .catch(() => false);
}
