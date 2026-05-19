import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RowQuery {
  id: string;
  query: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const { rows } = await req.json() as { rows: RowQuery[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ results: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are helping populate a "Bild URL" (image URL) column for a product catalog.

For each product below, return the single best-guess URL where a product image or product page is most likely to exist online. Prefer:
1. The manufacturer's / brand's own official website product page URL pattern
2. A well-known retailer (Zalando, Amazon, etc.) product page URL pattern
3. If no reliable guess is possible, return an empty string ""

Rules:
- Return ONLY plausible, well-formed https URLs that follow the brand's real URL structure.
- Do NOT invent random product IDs. If you cannot construct a sensible URL based on brand patterns, return "".
- Never return placeholders like "example.com", "url-here", or "TBD".
- One URL per product, no commentary.

Products:
${rows.map((r, i) => `${i + 1}. id="${r.id}" — ${r.query}`).join("\n")}

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly: {"id": "...", "url": "..."}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI gateway error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "[]";
    const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();

    let parsed: { id: string; url: string }[] = [];
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const results: Record<string, string> = {};
    for (const item of parsed) {
      if (item && typeof item.id === "string" && typeof item.url === "string") {
        const url = item.url.trim();
        results[item.id] = /^https?:\/\//i.test(url) ? url : "";
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("find-product-images error:", msg);
    return new Response(JSON.stringify({ error: msg, results: {} }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
