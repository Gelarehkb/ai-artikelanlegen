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
}

interface GeneratedTexts {
  produkttext: string;
  google_title: string;
  html_de: string;
  html_en: string;
  meta_description: string;
  meta_keywords: string;
  suchbegriffe: string;
}

const buildPrompt = (item: Item): string => {
  const A = item.artikelname || "";
  const C = item.markenname || "";
  const D = item.beschreibung || "";
  return `Du bist ein erfahrener Texter für den Onlineshop herrundfrauklein.com (Baby- und Kinderartikel). Generiere ein JSON-Objekt mit deutschen Online-Shop-Texten für folgenden Artikel.

EINGABE:
- A (Artikelname): "${A}"
- C (Markenname): "${C}"
- D (Beschreibung oder Link): "${D}"

Erstelle exakt die folgenden Felder. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown, keine Code-Fences) mit exakt diesen Keys: "produkttext", "google_title", "html_de", "html_en", "meta_description", "meta_keywords", "suchbegriffe". {{E}} bezeichnet den von dir erzeugten produkttext.

=== produkttext ===
Analysiere den Text aus D und schreibe einen neuen deutschen Produkttext für den Onlineshop herrundfrauklein.com. Wenn D ein Link ist, behandle den Link als Referenz und schreibe basierend auf dem Artikelnamen und Markennamen. Verwende eine ansprechende, warme Sprache, die Eltern als Käufer anspricht. Füge eine Liste mit dem Titel "Die wichtigsten Details:" hinzu, in der wichtige technische Details gelistet sind. Listeneinträge ohne Titel. Nicht alle Informationen, nur die wichtigsten. Keine anderen Farben oder Größen-Variationen erwähnen. Eventuell eine Liste "Pflegehinweise:" hinzufügen. Benutze als Artikelnamen den Wert aus A oder passe ihn sprachlich an (z.B. "Pullover Bio-Baumwolle" → "Pullover aus Bio-Baumwolle"). Der beschriebene Artikel ist für das Kind des Lesers. Dutze den Leser ("du", "dein"). Anstatt "uns"/"wir" nenne den Markennamen aus C in der dritten Person. WICHTIG: Markennamen aus C und Produktname aus A jeweils mit **fett** markieren. Beginne sofort ohne Überschrift und nicht mit "Hey Du", "Entdecke", "Verwöhne", "Tauche ein", "Lerne...". Keine Übertreibungen wie "perfekt". Erwähne in/nach der Einführung Produktnamen und Markennamen. Produktname mit Marke jeweils max. zweimal. Trenne Haupttext in 1-2 Absätze, die NICHT mit derselben Formulierung beginnen. Text soll wenn möglich nicht länger sein als D.

=== google_title ===
Format: "${A} von ${C} | herr und frau klein"

=== html_de ===
Konvertiere den produkttext in HTML (ohne header, body, div, meta). Sonderzeichen als HTML-Entities. <p> als <p class="bottom25"> öffnen, </p> normal. Kursiv als <em>. <ul> als <ul class="bottom25">, </ul> normal. Überschriften nicht als <h>, sondern als <p> und <strong>. "Die wichtigsten Details:" und "Pflegehinweise:" ohne <p class="bottom25">, nur als <p><strong>...</strong></p>. Erstes Wort nicht vergessen. Der/Die/Das nicht kursiv. Keine Code-Fences.

=== html_en ===
Übersetze produkttext ins Englische und konvertiere in HTML mit denselben Regeln wie html_de. **fett markierter** Text in <strong>. Erstes Wort/Anrede nicht kursiv. Keine Code-Fences.

=== meta_description ===
Fasse produkttext in 2-3 sehr kompakten Schlagsätzen zusammen (insgesamt max. 155 Zeichen inkl. Leerzeichen). Erster Satz beschreibt Produkt positiv. Alle Sätze ohne Artikel beginnen (statt "Ein schöner Ball" → "Schöner Ball"). Nicht immer "Schön". Nicht Artikelname/Markenname nennen. Keine Pflegehinweise oder genaue Größe. Jeder Satz endet mit "✔" ohne Punkt. Niemals mit "✔" beginnen. Keine Zeilenumbrüche. Keine HTML. MAX 155 Zeichen TOTAL.

=== meta_keywords ===
7 Meta-Keywords für herrundfrauklein.com, kommagetrennt, ohne Zeilenumbruch.

=== suchbegriffe ===
Bis zu 15 Suchbegriffe in Deutsch (nur Substantive, ohne Zahlen), durch Leerzeichen getrennt. Nur einzelne Wörter, keine zwei-Wort-Begriffe. Keine Zertifizierungen, Größen, Dimensionen, Nachhaltigkeit, Umwelt, Sicherheit, Pflege, Recyclebarkeit. Nicht mit "-" oder "–" trennen. MAX 240 Zeichen total. Erster Suchbegriff ist Markenname aus C (ggf. Fehler-Varianten). Keine exakten Wiederholungen.`;
};

function applyOverride(template: string, item: Item): string {
  const A = item.artikelname || "";
  const C = item.markenname || "";
  const D = item.beschreibung || "";
  return template
    .replace(/\{\{\s*A\s*\}\}/g, A)
    .replace(/\{\{\s*C\s*\}\}/g, C)
    .replace(/\{\{\s*D\s*\}\}/g, D);
}

async function generateForItem(item: Item, apiKey: string, promptOverride?: string): Promise<GeneratedTexts> {
  // Use override (session-only) if provided; otherwise fall back to the default backend prompt.
  const prompt = promptOverride && promptOverride.trim().length > 0
    ? applyOverride(promptOverride, item)
    : buildPrompt(item);
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
      produkttext: parsed.produkttext || "",
      google_title: parsed.google_title || `${item.artikelname} von ${item.markenname} | herr und frau klein`,
      html_de: parsed.html_de || "",
      html_en: parsed.html_en || "",
      meta_description: parsed.meta_description || "",
      meta_keywords: parsed.meta_keywords || "",
      suchbegriffe: parsed.suchbegriffe || "",
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

    const { items, promptOverride } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('items array is required');
    }
    const override: string | undefined = typeof promptOverride === 'string' ? promptOverride : undefined;

    // Batched parallel generation with concurrency limit
    const CONCURRENCY = 4;
    const results: (GeneratedTexts | { error: string })[] = new Array(items.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        try {
          results[idx] = await generateForItem(items[idx], LOVABLE_API_KEY, override);
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
