import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Item {
  artikelname: string;
  han: string;
  markenname: string;
  beschreibung: string;
  prompt?: string;
}

interface GeneratedTexts {
  html_de: string;
  google_title: string;
  meta_description: string;
  suchbegriffe: string;
  farbe: string;
  produktart: string;
}

const buildPrompt = (item: Item): string => {
  const A = item.artikelname || "";
  const C = item.markenname || "";
  const D = item.beschreibung || "";
  return `Antworte AUSSCHLIESSLICH mit JSON (keine Codeblöcke). Keys: "html_de","google_title","meta_description","suchbegriffe","farbe","produktart"
Marke:"${C}" | Artikel:"${A}" | Referenz:"${D}"
Quellpriorität: Herstellerwebsite > Input > Sonstige. Bei Widerspruch: Hersteller gewinnt.

[html_de]
HTML-Produkttext für herrundfrauklein.com. Kein head/body/div/H1. Sonderzeichen als HTML-Entities. <p class="bottom25"> | <ul class="bottom25">
Priorität: Verständlichkeit > Kauffakten > Scannbarkeit > Vertrauen > SEO > Atmosphäre
- Einstieg: Produkt + Zielgruppe + Hauptnutzen. Produktart im 1.Absatz mit <strong> hervorheben
- <strong> NUR für Kaufargumente: Alter · Material · Sicherheit · zentrale Vorteile · techn.Daten (1-2/Absatz)
- Max 3 Sätze/Absatz | mobile first | kein Fülltext | keine H-Tags im Fließtext
- Ton: warm, direkt, min. 1 humorvoller Moment | kein "einzigartig/revolutionär/das Beste" | duzen | Marke 3.Person | HERR UND FRAU KLEIN in Großbuchstaben
- Kleidung/Stoffe: Material + Pflegehinweis (wenn belegbar) | Baby-/Beißspielzeug: Sicherheit nur wenn belegbar
- Altersangaben: exakt, niemals schätzen
- PFLICHT am Ende: <p><strong>Die wichtigsten Details:</strong></p><ul class="bottom25"><li>…</li></ul>

[google_title]
50-60 Zeichen | Hauptkeyword vorne | Marke hinten nur wenn Platz | keine Maße/Zertifizierungen/Material | "| HERR UND FRAU KLEIN" weglassen wenn >60 Zeichen

[meta_description]
140-155 Zeichen | Hauptnutzen + Spec + Vertrauen [+ CTA] | echter Satz zum Klicken | Maße einmal | kein Wien-Bezug außer kaufentscheidend

[suchbegriffe]
Max 240 Zeichen | eine Zeile | Leerzeichen-getrennt | nur Substantive | Markenname zuerst | Zahlen+Einheiten zusammen (z.B. "100cm") | keine Zertifizierungen/Maße/Nachhaltigkeit/Sicherheit/Pflege/Ortsbegriffe | keine Duplikate

[farbe]
Exakt eines: beige|blau|braun|gelb|grau|grün|mehrfarbig|orange|rosa|rot|schwarz|türkis|violett|weiß
Grundfarbe > Musterfarbe > Designname | "mehrfarbig" nur ohne klare Grundfarbe | bei Bezug+Füllung: Bezugsfarbe

[produktart]
Exakt eines aus (oder null): Accessories, Aufbewahrung, Babyspielsachen, Babywippe, Baden, Beißen, Beleuchtung, Betten, Bettwäsche, Bewegung, Bodies, Cardigans, Care, Decken, Deko, Einzelkinderwagen, Essen, Fahren, Fußsäcke, Geschwisterkinderwagen, Große Spielsachen, Gutscheine, Handschuhe, Hauben, Hochstühle, Holzspielzeug, Hosen, Hüte, Jacken, Kinderautositze, Kinderwagen, Kinderwagen Einzelteil, Kissen, Kleider, Kniestrümpfe, Kommoden, Kurze Hosen, Kuscheltiere, Lätzchen, Leggings, Lernen, Matratzen, Modellbahn, Musik, Nestchen, Overalls, Pullover, Puppen, Pyjamas, Regale, Röcke, Schals, Schlafsäcke, Schnuller, Schränke, Schuhe, Schwimmbekleidung, Socken, Spiele, Spielen, Stillen, Stofftiere, Stoffwindeln, Strampler, Stühle, Sweatshirts, Taschen, Tattoos, Teppich, Teppiche, Tische, Tops, Tragen, Trinken, T-Shirts, Waschen, Wickeltaschen, Wickelunterlagen, Wiegen, Zubehör`;
};

async function generateForItem(item: Item, apiKey: string): Promise<GeneratedTexts> {
  const prompt = item.prompt && item.prompt.trim().length > 0 ? item.prompt : buildPrompt(item);
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error [${response.status}]: ${t}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  try {
    const parsed = JSON.parse(content);
    return {
      html_de: parsed.html_de || "",
      google_title: parsed.google_title || `${item.artikelname} von ${item.markenname} | HERR UND FRAU KLEIN`,
      meta_description: parsed.meta_description || "",
      suchbegriffe: parsed.suchbegriffe || "",
      farbe: parsed.farbe || "",
      produktart: parsed.produktart || "",
    };
  } catch {
    console.error("Failed to parse AI response:", content);
    throw new Error("AI returned invalid JSON");
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required');
    }

    // Batched parallel generation with concurrency limit
    const CONCURRENCY = 4;
    const results: (GeneratedTexts | { error: string })[] = new Array(items.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        try {
          results[idx] = await generateForItem(items[idx], LOVABLE_API_KEY);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Item ${idx} failed:`, msg);
          results[idx] = { error: msg } as any;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-online-texts error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
