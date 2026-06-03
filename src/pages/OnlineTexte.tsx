import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { DEFAULT_ONLINE_TEXT_PROMPT, DEFAULT_ONLINE_TEXT_PROMPT_NAME } from "@/lib/onlineTextPrompt";

type Item = {
  artikelname: string;
  artikelnameExport: string;
  han: string;
  markenname: string;
  beschreibung: string;
};

type Result = Partial<{
  produkttext: string;
  google_title: string;
  html_de: string;
  html_en: string;
  meta_description: string;
  meta_keywords: string;
  suchbegriffe: string;
  error: string;
}>;

const truncate = (s: string, n = 10) => (s.length > n ? s.slice(0, n) + "..." : s);

const OnlineTexte = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [lang, setLang] = useState<"DE" | "EN">("DE");

  // Prompt (session-only). Original default is kept untouched in the backend
  // and in DEFAULT_ONLINE_TEXT_PROMPT (read-only baseline).
  const [promptContent, setPromptContent] = useState<string>(DEFAULT_ONLINE_TEXT_PROMPT);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("onlineTextsPayload");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items)) setItems(parsed.items);
      if (parsed?.lang === "EN") setLang("EN");
    } catch (e) {
      console.error("Failed to parse payload", e);
    }
  }, []);

  const isOverridden = useMemo(
    () => promptContent.trim() !== DEFAULT_ONLINE_TEXT_PROMPT.trim(),
    [promptContent],
  );

  const startEdit = () => {
    setDraft(promptContent);
    setIsEditing(true);
  };

  const saveEdit = () => {
    setPromptContent(draft);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setDraft("");
    setIsEditing(false);
  };

  const resetPrompt = () => {
    setPromptContent(DEFAULT_ONLINE_TEXT_PROMPT);
    setIsEditing(false);
  };

  const handleGenerate = async () => {
    if (items.length === 0) return;
    setIsGenerating(true);
    setResults([]);
    try {
      const body: Record<string, unknown> = { items };
      // Only send override if user actually edited it (otherwise backend default is used).
      if (isOverridden) body.promptOverride = promptContent;

      const { data, error } = await supabase.functions.invoke("generate-online-texts", { body });
      if (error) throw error;
      const r = data?.results;
      if (!Array.isArray(r)) throw new Error("Invalid response");
      setResults(r);
      toast({
        title: lang === "DE" ? "Texte generiert" : "Texts generated",
        description: `${items.length} ${lang === "DE" ? "Artikel" : "items"}`,
      });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: msg, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCsv = () => {
    if (results.length === 0) return;
    const headers = [
      "Artikelname", "HAN", "Markenname",
      "produkttext", "google_title", "html_de", "html_en",
      "meta_description", "meta_keywords", "suchbegriffe",
    ];
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(";")];
    items.forEach((it, i) => {
      const r = results[i] || {};
      lines.push([
        it.artikelnameExport || it.artikelname,
        it.han, it.markenname,
        r.produkttext || "", r.google_title || "", r.html_de || "", r.html_en || "",
        r.meta_description || "", r.meta_keywords || "", r.suchbegriffe || "",
      ].map(esc).join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "online-texte.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            {lang === "DE" ? "Online-Texte" : "Online texts"}
          </h1>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating || items.length === 0} className="gap-2">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isGenerating
                ? lang === "DE" ? "Generiere..." : "Generating..."
                : lang === "DE" ? "Texte generieren" : "Generate texts"}
            </Button>
            <Button onClick={handleDownloadCsv} variant="outline" disabled={results.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Prompt panel */}
        <div className="rounded-md border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {lang === "DE" ? "Prompt" : "Prompt"}
            </div>
            <div className="flex items-center gap-2">
              {isOverridden && !isEditing && (
                <Button size="sm" variant="ghost" onClick={resetPrompt} className="gap-1 h-7 text-xs">
                  <RotateCcw className="h-3 w-3" />
                  {lang === "DE" ? "Zurücksetzen" : "Reset"}
                </Button>
              )}
              {!isEditing && (
                <Button size="sm" variant="ghost" onClick={startEdit} className="gap-1 h-7 text-xs">
                  <Pencil className="h-3 w-3" />
                  {lang === "DE" ? "Bearbeiten" : "Edit"}
                </Button>
              )}
            </div>
          </div>

          <div className="text-sm font-semibold">
            {DEFAULT_ONLINE_TEXT_PROMPT_NAME}
            {isOverridden && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({lang === "DE" ? "nur diese Sitzung" : "this session only"})
              </span>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="font-mono text-xs min-h-[260px]"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  {lang === "DE" ? "Abbrechen" : "Cancel"}
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  {lang === "DE" ? "Speichern" : "Save"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "DE"
                  ? "Änderungen gelten nur für diese Sitzung. Der Original-Prompt im Backend bleibt unverändert."
                  : "Edits apply to this session only. The original backend prompt stays unchanged."}
              </p>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onDoubleClick={startEdit}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground text-left cursor-text select-text"
                  title={lang === "DE" ? "Doppelklick zum Bearbeiten" : "Double-click to edit"}
                >
                  {truncate(promptContent, 10)}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[640px] max-h-[400px] overflow-auto">
                <pre className="whitespace-pre-wrap text-xs font-mono">{promptContent}</pre>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Items table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{lang === "DE" ? "Artikel Name" : "Article Name"}</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {lang === "DE" ? "Keine Artikel geladen." : "No items loaded."}
                  </TableCell>
                </TableRow>
              )}
              {items.map((it, i) => {
                const r = results[i];
                const status = r?.error
                  ? { label: lang === "DE" ? "Fehler" : "Error", cls: "text-destructive" }
                  : r
                  ? { label: lang === "DE" ? "Fertig" : "Done", cls: "text-green-600" }
                  : isGenerating
                  ? { label: lang === "DE" ? "Läuft..." : "Running...", cls: "text-muted-foreground" }
                  : { label: lang === "DE" ? "Bereit" : "Ready", cls: "text-muted-foreground" };
                return (
                  <TableRow key={`${it.artikelname}-${i}`}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="text-sm">{it.artikelnameExport || it.artikelname}</TableCell>
                    <TableCell className={`text-xs ${status.cls}`}>{status.label}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default OnlineTexte;
