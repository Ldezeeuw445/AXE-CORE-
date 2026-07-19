// Supabase Edge Function: AI Proxy
// Routes AI provider requests securely without exposing API keys in the browser

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIRequest {
  provider: string;
  key: string;
  model: string;
  format: string;
  baseUrl?: string;
  messages: Array<{ role: string; content: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: AIRequest = await req.json();
    const { provider, key, model, format, baseUrl, messages } = body;

    if (!key || !model || !messages) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: key, model, messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let response: Response;
    const signal = AbortSignal.timeout(30000);

    if (format === 'anthropic') {
      const sys = messages.find(m => m.role === 'system')?.content ?? '';
      response = await fetch(`${baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          system: sys,
          messages: messages.filter(m => m.role !== 'system'),
        }),
        signal,
      });
    } else if (format === 'google') {
      const sys = messages.find(m => m.role === 'system')?.content ?? '';
      response = await fetch(
        `${baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: messages
              .filter(m => m.role !== 'system')
              .map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
              })),
            ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
            generationConfig: { maxOutputTokens: 600 },
          }),
          signal,
        }
      );
    } else {
      // OpenAI-compatible (OpenRouter, OpenAI, Groq, xAI)
      const chatPath = provider === 'groq'
        ? `${baseUrl || 'https://api.groq.com/openai'}/chat/completions`
        : `${baseUrl || 'https://openrouter.ai/api'}/v1/chat/completions`;
      
      response = await fetch(chatPath, {
        method: 'POST',
        headers: {
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          'Content-Type': 'application/json',
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://axeheadquarters.com', 'X-Title': 'AXE-CORE-' } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 600,
          temperature: 0.7,
        }),
        signal,
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: error.error?.message || `HTTP ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let text = '';

    if (format === 'anthropic') {
      text = data.content?.[0]?.text ?? '';
    } else if (format === 'google') {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else {
      text = data.choices?.[0]?.message?.content ?? '';
    }

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
