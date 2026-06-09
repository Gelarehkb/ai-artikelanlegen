import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');

    const { articleNames } = await req.json();
    if (!articleNames || !Array.isArray(articleNames) || articleNames.length === 0) {
      throw new Error('articleNames array is required');
    }

    const prompt = `You are a translator for a children's product store. You translate product names between German and English.

For each article name below, provide:
1. "de" — the German version of the full article name. If the input is already German, return it as-is. If it contains English product type words, translate ONLY the product type word to German (e.g. "Jacket" → "Jacke", "Trousers" → "Hose") while keeping brand names, model names, and descriptive words unchanged.
2. "en" — the English version of the full article name. Translate ONLY the German product type word to English (e.g. "Jacke" → "Jacket", "Hose" → "Trousers") while keeping brand names, model names, color names, and other descriptive words unchanged. If you cannot determine a meaningful English translation, return an empty string "".

IMPORTANT RULES:
- Only translate the product type word (the first word that describes what the item IS, e.g. Jacke, Hose, Kleid, Schuh, etc.)
- Keep brand names, model identifiers, color names, size indicators EXACTLY as they are
- German words "mit", "zum", "aus" must always be lowercase
- If the name has no recognizable product type, return the original for "de" and empty string for "en"
- Never return "NAN" or "nan" — use empty string "" instead

Article names to translate:
${articleNames.map((name: string, i: number) => `${i + 1}. "${name}"`).join("\n")}

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly these keys: "de", "en".

Example:
Input: ["Jacke Geo3/5 hazel brown", "Stroller Organizer mint"]
Output: [{"de":"Jacke Geo3/5 hazel brown","en":"Jacket Geo3/5 hazel brown"},{"de":"Stroller Organizer mint","en":"Stroller Organizer mint"}]`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      throw new Error(`Anthropic API error [${response.status}]: ${t}`);
    }

    const data = await response.json();
    let content = data.content?.[0]?.text || "";
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let translations;
    try {
      translations = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("AI returned invalid JSON");
    }

    // Sanitize: ensure no "NAN" or "nan" values
    translations = translations.map((t: any) => ({
      de: (t.de && t.de.toLowerCase() !== "nan") ? t.de : "",
      en: (t.en && t.en.toLowerCase() !== "nan") ? t.en : "",
    }));

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Translation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
