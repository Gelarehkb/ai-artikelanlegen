import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Lang } from "@/lib/translations";

export type ImportTargetField =
  | "ItemName"
  | "color"
  | "Size"
  | "EAN"
  | "HAN"
  | "EK"
  | "VK"
  | "Menge"
  | "Collection"
  | "Measurement"
  | "InfoMaterial"
  | "Description";

export interface ImportedRow {
  [key: string]: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: Partial<Record<ImportTargetField, string>>[]) => void;
  lang: Lang;
}

const TARGET_FIELDS: { key: ImportTargetField; labelDE: string; labelEN: string }[] = [
  { key: "ItemName", labelDE: "Name", labelEN: "Name" },
  { key: "color", labelDE: "Farbe", labelEN: "Color" },
  { key: "Size", labelDE: "Größe", labelEN: "Sizes" },
  { key: "EAN", labelDE: "EAN", labelEN: "EAN" },
  { key: "HAN", labelDE: "HAN", labelEN: "HAN" },
  { key: "EK", labelDE: "EK", labelEN: "EK" },
  { key: "VK", labelDE: "VK", labelEN: "VK" },
  { key: "Menge", labelDE: "Menge", labelEN: "Quantity" },
  { key: "Collection", labelDE: "Kollektion", labelEN: "Collection" },
  { key: "Measurement", labelDE: "Maß", labelEN: "Measurement" },
  { key: "InfoMaterial", labelDE: "Info/Material/Beschreibung", labelEN: "Info/Material/Description" },
];

const NONE_VALUE = "__none__";

// ---- Quote-aware CSV parser ----
function parseCsvQuoteAware(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  let inQ = false;
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0, "|": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') {
      if (inQ && sample[i + 1] === '"') { i++; continue; }
      inQ = !inQ; continue;
    }
    if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : ",";
}

// Strip BOM
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// Auto-guess mapping from header name to target field
function autoGuessMapping(headers: string[]): Record<ImportTargetField, number> {
  const map: Record<string, number> = {};
  const lower = headers.map(h => (h ?? "").toString().toLowerCase().trim());
  const find = (...keywords: string[]): number => {
    for (let i = 0; i < lower.length; i++) {
      const h = lower[i];
      if (!h) continue;
      if (keywords.some(k => h === k || h.includes(k))) return i;
    }
    return -1;
  };
  map.ItemName = find("name", "artikelname", "bezeichnung", "title", "produkt");
  map.color = find("farbe", "color", "colour");
  map.Size = find("größe", "groesse", "size", "sizes");
  map.EAN = find("ean", "barcode", "gtin");
  map.HAN = find("han", "sku", "artikelnummer", "art.nr", "artnr");
  map.EK = find("ek", "einkauf", "cost");
  map.VK = find("vk", "verkauf", "price", "preis", "uvp");
  map.Menge = find("menge", "qty", "quantity", "anzahl", "stk");
  map.Collection = find("kollektion", "collection", "serie");
  map.Measurement = find("maß", "mass", "measurement", "dimension", "größe maß");
  map.InfoMaterial = find("material", "info", "beschreibung", "description", "details");
  return map as Record<ImportTargetField, number>;
}

export const ImportDialog = ({ open, onOpenChange, onImport, lang }: ImportDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [rawRows, setRawRows] = useState<string[][]>([]); // before header split
  const [mapping, setMapping] = useState<Record<ImportTargetField, number>>({} as Record<ImportTargetField, number>);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setRawRows([]);
    setMapping({} as Record<ImportTargetField, number>);
    setHasHeader(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyHeaderSplit = (rows: string[][], withHeader: boolean) => {
    if (rows.length === 0) {
      setHeaders([]); setDataRows([]); return;
    }
    if (withHeader) {
      const h = rows[0].map((c, i) => (c?.toString().trim() ? c.toString() : `Spalte ${i + 1}`));
      setHeaders(h);
      setDataRows(rows.slice(1));
      setMapping(autoGuessMapping(h));
    } else {
      const colCount = Math.max(...rows.map(r => r.length));
      const h = Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`);
      setHeaders(h);
      setDataRows(rows);
      setMapping({} as Record<ImportTargetField, number>);
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.includes("csv");
      let rows: string[][] = [];
      if (isCsv) {
        const buf = await file.arrayBuffer();
        // Try utf-8 first
        let text = new TextDecoder("utf-8").decode(buf);
        // If contains replacement char, retry latin-1
        if (text.includes("\uFFFD")) {
          text = new TextDecoder("windows-1252").decode(buf);
        }
        text = stripBom(text);
        const delimiter = detectDelimiter(text);
        rows = parseCsvQuoteAware(text, delimiter);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // raw=false preserves formatted strings; defval keeps empties; blankrows=false drops empty rows
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });
        rows = aoa.map(r => (r as unknown[]).map(c => (c === null || c === undefined ? "" : String(c))));
      }
      // Drop fully empty trailing rows
      while (rows.length && rows[rows.length - 1].every(c => (c ?? "").toString().trim() === "")) rows.pop();
      setRawRows(rows);
      applyHeaderSplit(rows, true);
    } catch (err) {
      console.error(err);
      toast({ title: lang === "DE" ? "Fehler beim Lesen" : "Read error", description: String(err), variant: "destructive" });
      reset();
    } finally {
      setLoading(false);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const toggleHeader = (checked: boolean) => {
    setHasHeader(checked);
    applyHeaderSplit(rawRows, checked);
  };

  const setFieldMapping = (field: ImportTargetField, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (value === NONE_VALUE) delete next[field];
      else next[field] = parseInt(value, 10);
      return next;
    });
  };

  const confirmImport = () => {
    const out: Partial<Record<ImportTargetField, string>>[] = dataRows.map(row => {
      const obj: Partial<Record<ImportTargetField, string>> = {};
      (Object.keys(mapping) as ImportTargetField[]).forEach(f => {
        const idx = mapping[f];
        if (idx !== undefined && idx >= 0) {
          obj[f] = row[idx] ?? "";
        }
      });
      return obj;
    });
    onImport(out);
    onOpenChange(false);
    reset();
  };

  const mappedCount = Object.keys(mapping).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === "DE" ? "Datei importieren" : "Import file"}</DialogTitle>
          <DialogDescription>
            {lang === "DE"
              ? "Excel (.xlsx, .xls) oder CSV/TSV hochladen und Spalten zuordnen."
              : "Upload Excel (.xlsx, .xls) or CSV/TSV and map columns."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={onFileInput}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2" disabled={loading}>
                <Upload className="h-4 w-4" />
                {lang === "DE" ? "Datei wählen" : "Choose file"}
              </Button>
              {fileName && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" /> {fileName} ({dataRows.length} {lang === "DE" ? "Zeilen" : "rows"})
                </span>
              )}
            </div>
          </div>

          {headers.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
                {lang === "DE" ? "Erste Zeile als Spaltenüberschriften" : "First row as column headers"}
              </label>

              <div className="border rounded-md overflow-x-auto max-h-48">
                <table className="text-xs w-full">
                  <thead className="bg-muted">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium border-r whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.slice(0, 5).map((row, r) => (
                      <tr key={r} className="border-t">
                        {headers.map((_, c) => (
                          <td key={c} className="px-2 py-1 border-r max-w-[200px] truncate" title={row[c] ?? ""}>{row[c] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">
                  {lang === "DE" ? "Spalten zuordnen" : "Map columns"} ({mappedCount}/{TARGET_FIELDS.length})
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {TARGET_FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">{lang === "DE" ? f.labelDE : f.labelEN}</Label>
                      <Select
                        value={mapping[f.key] !== undefined ? String(mapping[f.key]) : NONE_VALUE}
                        onValueChange={(v) => setFieldMapping(f.key, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>— {lang === "DE" ? "keine" : "none"} —</SelectItem>
                          {headers.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
            {lang === "DE" ? "Abbrechen" : "Cancel"}
          </Button>
          <Button onClick={confirmImport} disabled={dataRows.length === 0 || mappedCount === 0}>
            {lang === "DE" ? `${dataRows.length} Zeilen importieren` : `Import ${dataRows.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
