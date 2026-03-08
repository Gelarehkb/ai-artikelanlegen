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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const { items, warengruppeOptions, farbeOptions, artOptions, groesseOptions } = await req.json();
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

Items to classify:
${items.map((item: string, i: number) => `${i + 1}. ${item}`).join("\n")}

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly these keys: "warengruppe", "farbe", "art", "groesse". Use empty string "" when no match is found.

Example response:
[{"warengruppe":"Kleidung Basics","farbe":"rosa","art":"T-Shirts","groesse":""},{"warengruppe":"Schuhe","farbe":"blau","art":"Schuhe","groesse":""}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      throw new Error(`AI gateway error [${response.status}]: ${t}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    
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
