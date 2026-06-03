import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required');
    }

    const prompt = `You restructure product names so the MAIN ITEM TYPE comes first, followed by the brand/model name, then descriptive attributes. Also extract any color word found in the name.

Rules:
- Move the main noun (item type like "Table", "Chair", "Lamp", "T-Shirt", "Jacket", "Bag", "Shoes", "Dress") to the FRONT.
- Keep the rest of the words in their original order after the item type.
- Use Title Case for each word.
- Extract any color word (English or German) from the name into a separate "color" field, lowercase. Remove it from the name.
  Colors include: red, blue, green, yellow, black, white, grey/gray, brown, pink, orange, purple, violet, turquoise, beige, navy, mint, sand, cream, ivory, rosa, blau, grün, gelb, schwarz, weiß, grau, braun, rot, türkis, violett.
- If no color, return empty string for color.
- If you cannot identify a clear item type, keep the name as-is (just Title Case) and still extract color.

Items:
${items.map((it: string, i: number) => `${i + 1}. ${it}`).join("\n")}

Respond ONLY with a JSON array (no markdown, no code fences). Each element MUST have exactly: {"name": "...", "color": "..."}.

Example input: "Nori Table stainless red"
Example output element: {"name": "Table Nori Stainless", "color": "red"}`;

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
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const txt = await response.text();
      throw new Error(`AI gateway error [${response.status}]: ${txt}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let results;
    try {
      results = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("AI returned invalid JSON");
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Restructure error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
