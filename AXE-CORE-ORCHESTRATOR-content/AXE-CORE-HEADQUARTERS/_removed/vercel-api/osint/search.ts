/**
 * Vercel Edge Function — OSINT analyst search
 * POST /api/osint/search  { query: string, city?: string }
 *
 * Returns { analysis, sources, isDemo }. With GEMINI_API_KEY configured,
 * queries Gemini with Google Search grounding for a real, cited answer.
 * Otherwise (or on live-call failure) falls back to a clearly labeled
 * simulated report.
 */

import { isGeminiKeyConfigured, geminiGenerateContent, getSimulatedAnalysis, json, corsHeaders } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { query?: string; city?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { query, city } = body;
  if (!query) {
    return json({ error: "Search query is required." }, 400);
  }

  const currentCity = city || "Global Tracker";

  if (!isGeminiKeyConfigured()) {
    const simulated = getSimulatedAnalysis(query, currentCity);
    return json({ analysis: simulated.analysis, sources: simulated.sources, isDemo: true });
  }

  try {
    const currentTime = new Date().toISOString();
    const systemPrompt = `You are an elite Open Source Intelligence (OSINT) Analyst in a Command Center.
Your task is to analyze real-time open-source intelligence on infrastructure status, events, geopolitics, traffic disasters, or safety incidents.
The user is focusing on the city: ${currentCity}.
Current simulated live date: ${currentTime}.
Utilize Google Search grounding to gather accurate, current real-world status.
Keep your analysis objective, factual, concise, and structured. Do not hype or speculate. Provide direct evidence.`;

    const data = await geminiGenerateContent(
      {
        contents: [{ role: "user", parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ googleSearch: {} }],
      },
      "gemini-3.5-flash"
    );

    const candidate = data?.candidates?.[0];
    const analysis = candidate?.content?.parts?.[0]?.text || "No analysis generated.";

    const sources: { title: string; url: string }[] = [];
    const chunks = candidate?.groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk.web?.uri && chunk.web?.title) {
          sources.push({ title: chunk.web.title, url: chunk.web.uri });
        }
      }
    }
    const uniqueSources = sources.filter((source, index, self) => self.findIndex((s) => s.url === source.url) === index);

    return json({ analysis, sources: uniqueSources, isDemo: false });
  } catch (err: unknown) {
    console.warn("OSINT search: live call failed, falling back to simulated analysis:", err);
    const simulated = getSimulatedAnalysis(query, currentCity);
    return json({ analysis: simulated.analysis, sources: simulated.sources, isDemo: true });
  }
}
