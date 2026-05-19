import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RowQuery {
  id: string;
  han?: string;
  ean?: string;
  expectedName?: string;
  hersteller?: string;
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

    // Only rows with a HAN or EAN are valid lookups
    const valid = rows.filter(r => (r.han && r.han.trim()) || (r.ean && r.ean.trim()));
    if (valid.length === 0) {
      return new Response(JSON.stringify({ results: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are populating a "Bild URL" (product page URL) column for a product catalog.

STRICT RULES:
- Use ONLY the HAN (manufacturer article number) or EAN/barcode as the PRIMARY search identifier. NEVER infer a URL from the product name alone.
- For each product, attempt to identify the official product page (manufacturer's site preferred, then a known retailer) that matches the given HAN or EAN exactly.
- After identifying a candidate page, you MUST compare the product name on that page with the provided "expectedName". Only return the URL if the two names refer to the same product (same article, same model). Minor formatting/word-order differences are fine; a different model, variant family, or unrelated product is NOT a match.
- If you cannot confidently match by HAN/EAN AND verify the name matches, return an empty string "" for that product.
- Never invent URLs, never guess from the name, never return placeholders like "example.com".
- Return well-formed https URLs only.

Products:
${valid.map((r, i) => {
  const ids = [
    r.han ? `HAN=${r.han}` : "",
    r.ean ? `EAN=${r.ean}` : "",
  ].filter(Boolean).join(", ");
  return `${i + 1}. id="${r.id}" | ${ids} | expectedName="${r.expectedName || ""}" | brand="${r.hersteller || ""}"`;
}).join("\n")}

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly: {"id": "...", "url": "..."}. Use "" when no verified match exists.`;

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
