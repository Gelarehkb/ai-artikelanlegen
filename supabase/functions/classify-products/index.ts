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

    const body = await req.json();
    const { items, warengruppeOptions, farbeOptions, artOptions, groesseOptions } = body;
    // Normalize sizes: lowercase and remove spaces
    const sizes = body.sizes ? body.sizes.map((s: string) => s ? s.toLowerCase().replace(/\s+/g, '') : '') : [];
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required');
    }

    const prompt = `You are a product classifier for a children's clothing and accessories store.

For each item name below, choose the BEST matching value from each of these lists. You MUST only use values from these exact lists.

**Warengruppe** (product group): ${JSON.stringify(warengruppeOptions)}
**Farbe** (color): ${JSON.stringify(farbeOptions)}
**Art** (type): ${JSON.stringify(artOptions)}
**Größe** (size): ${JSON.stringify(groesseOptions)}

Rules:
- Extract color from the item name if present (e.g. "pink" → "rosa", "blue" → "blau", "red" → "rot", "green" → "grün", "white" → "weiß", "black" → "schwarz", "grey/gray" → "grau", "brown" → "braun", "yellow" → "gelb", "orange" → "orange", "purple" → "violett", "turquoise" → "türkis", "beige" → "beige", "multicolor/bunt" → "mehrfärbig")
- If no color is detectable, leave Farbe empty
- If no size is detectable from the name, leave Größe empty
- For Art, match the product type (e.g. "tshirt"/"t-shirt" → "T-Shirts", "jacket" → "Jacken", "pants/trousers" → "Hosen", "dress" → "Kleider", "shoes" → "Schuhe", "socks" → "Socken", "hat" → "Hüte", "body/bodysuit" → "Bodies", "overall" → "Overalls", "leggings" → "Leggings", "pullover/sweater" → "Pullover", "cardigan" → "Cardigans", "sweatshirt" → "Sweatshirts", "shorts" → "Kurze Hosen", "romper" → "Strampler", "pajama/pyjama" → "Pyjamas", "scarf" → "Schals", "gloves" → "Handschuhe", "bag" → "Taschen", "toy" → "Spielen", "blanket" → "Decken", "sleeping bag" → "Schlafsäcke")
- For Warengruppe, classify into the broader category

Items to classify (with their size values):
${items.map((item: string, i: number) => `${i + 1}. ${item}${sizes && sizes[i] ? ` [Size: ${sizes[i]}]` : ''}`).join("\n")}

IMPORTANT for Größe: When a size value is provided in brackets, match it to the closest option from the Größe list. For example: "62" → "62 cm (0-3 M)", "86" → "86 cm (12-18 M)", "98" → "98 cm (3 J)". Match by the numeric cm value.

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly these keys: "warengruppe", "farbe", "art", "groesse". Use empty string "" when no match is found.

Example response:
[{"warengruppe":"Kleidung Basics","farbe":"rosa","art":"T-Shirts","groesse":""},{"warengruppe":"Schuhe","farbe":"blau","art":"Schuhe","groesse":""}]`;

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

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let classifications;
    try {
      classifications = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("AI returned invalid JSON");
    }

    return new Response(JSON.stringify({ classifications }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Classification error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
