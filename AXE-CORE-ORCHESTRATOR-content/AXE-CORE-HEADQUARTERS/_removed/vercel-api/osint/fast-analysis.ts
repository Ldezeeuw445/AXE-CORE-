/**
 * Vercel Edge Function — fast threat triage
 * POST /api/osint/fast-analysis  { incidentText: string }
 *
 * Returns { analysis, isDemo }. With GEMINI_API_KEY configured, runs a quick
 * Gemini evaluation. Otherwise (or on live-call failure) falls back to a
 * clearly labeled simulated triage.
 */

import { isGeminiKeyConfigured, geminiGenerateContent, getSimulatedTriage, json, corsHeaders } from "./_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { incidentText?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { incidentText } = body;
  if (!incidentText) {
    return json({ error: "Incident details or alert text is required." }, 400);
  }

  if (!isGeminiKeyConfigured()) {
    return json({ analysis: getSimulatedTriage(incidentText), isDemo: true });
  }

  try {
    const data = await geminiGenerateContent(
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Quickly evaluate the potential infrastructure or public safety threat of this report in 2-3 concise bullet points. Be extremely direct and low-latency. Report: "${incidentText}"`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: "You are a high-speed triage system. Assess threat level (None/Low/Medium/High) and critical immediate impacts." }],
        },
      },
      "gemini-3.1-flash-lite"
    );

    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis could be completed.";
    return json({ analysis, isDemo: false });
  } catch (err: unknown) {
    console.warn("Fast analysis: live call failed, falling back to simulated triage:", err);
    return json({ analysis: getSimulatedTriage(incidentText), isDemo: true });
  }
}
