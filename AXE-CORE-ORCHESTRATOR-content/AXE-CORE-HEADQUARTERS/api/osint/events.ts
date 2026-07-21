/**
 * Vercel Edge Function — OSINT city events
 * POST /api/osint/events  { city: string }
 *
 * Returns { events, isDemo }. With GEMINI_API_KEY configured, queries Gemini
 * with Google Search grounding for real, structured current events. Without
 * a key (or if the live call fails/quota-limits), falls back to a clearly
 * labeled simulated dataset — isDemo is always accurate to what was returned.
 */

import { isGeminiKeyConfigured, geminiGenerateContent, SIMULATED_EVENTS, json, corsHeaders } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { city?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { city } = body;
  if (!city) {
    return json({ error: "City name is required." }, 400);
  }

  if (!isGeminiKeyConfigured()) {
    const simulated = SIMULATED_EVENTS[city] || SIMULATED_EVENTS["New York"] || [];
    return json({ events: simulated, isDemo: true });
  }

  try {
    const today = new Date().toLocaleDateString();
    const prompt = `Perform an OSINT scan for active or very recent events, public safety issues, infrastructure changes, major traffic disruptions, or weather hazards in ${city} as of today (${today}).
Provide 3-4 real, grounded active issues or events. Fill out all properties truthfully according to current search data.`;

    const data = await geminiGenerateContent(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: "You are a professional web intelligence tool that retrieves and structures real-time occurrences." }] },
        tools: [{ googleSearch: {} }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                category: { type: "STRING", description: "Must be exactly one of: incident, infrastructure, weather, traffic, general" },
                severity: { type: "STRING", description: "Must be exactly one of: critical, warning, info" },
                description: { type: "STRING" },
                source: { type: "STRING" },
                timestamp: { type: "STRING" },
                location: { type: "STRING" },
              },
              required: ["title", "category", "severity", "description", "source", "timestamp"],
            },
          },
        },
      },
      "gemini-3.5-flash"
    );

    const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const parsedEvents = JSON.parse(jsonText.trim());
    return json({ events: parsedEvents, isDemo: false });
  } catch (err: unknown) {
    console.warn("OSINT events: live call failed, falling back to simulated data:", err);
    const simulated = SIMULATED_EVENTS[city] || SIMULATED_EVENTS["New York"] || [];
    return json({ events: simulated, isDemo: true });
  }
}
