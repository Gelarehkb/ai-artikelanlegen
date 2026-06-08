import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, Trash2 } from "lucide-react";

interface ClothRow {
  id: string;
  ClothName: string;
  ClothCode: string;
  color: string;
  Size: string;
  EAN: string;
  HAN: string;
  EK: string;
  VK: string;
  Menge: string;
}

const createEmptyRow = (): ClothRow => ({
  id: crypto.randomUUID(),
  ClothName: "",
  ClothCode: "",
  color: "",
  Size: "",
  EAN: "",
  HAN: "",
  EK: "",
  VK: "",
  Menge: "",
});

const safe = (val: string | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const v = String(val).trim();
  return v.toLowerCase() === "nan" ? "" : v;
};

const artikelnummerBuilder = (KRZL: string, name: string, code: string, color: string, size: string): string => {
  const parts = [KRZL, name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '), code.toLowerCase(), color.toLowerCase()];
  if (size !== "") {
    parts.push(size.toUpperCase());
  }
  return parts.join(" ");
};

const buildRow = (
  artikelnummer: string, vaterartikel: string, name: string,
  size: string, color: string, EAN: string, HAN: string, EK: string, VK: string, Hersteller: string,
  AufAB: number, AufAuf: number, AufSe: string, Lieferstatus: string, Lieferzeit: number, Menge: string
): Record<string, string | number> => {
  let check = "";
  try {
    const ek = parseFloat(EK.replace(",", "."));
    const vk = parseFloat(VK.replace(",", "."));
    check = ek < vk ? "OK" : "ERROR";
  } catch {
    check = "";
  }

  return {
    "für Kassa aktivieren": "Y",
    "Artikelnummer": artikelnummer,
    "VaterArtikel ID-Feld": vaterartikel,
    "EAN": EAN,
    "HAN": HAN,
    "Artikelname/Etikettenname": name,
    "VarName 1 (Größe)": "Größe",
    "Wert Name 1": size,
    "VarName 2 (Farbe)": "Farbe",
    "Wert Name 2": color,
    "EK Netto": EK,
    "VK Brutto": VK,
    "EK < VK": check,
    "Hersteller": Hersteller.toUpperCase(),
    "Lieferant": Hersteller.split(' ').map(w => ['mit','zum','aus'].includes(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    "Lieferstatus": Lieferstatus,
    "Lieferzeit ohne Bestand mit ÜV": Lieferzeit,
    "Versandklasse": "standard",
    "Warengruppe": "",
    "Liefer. EK": EK,
    "Lieferanten ArtikelNR": HAN,
    "Bestell Menge": Menge,
    "Auffüllen AB": "KG Store Auffüllen AB",
    "KG Store Auffüllen AB": AufAB,
    "Auffüllen AUF": "KG Store Auffüllen AUF",
    "KG Store Auffüllen AUF": AufAuf,
    "Saison": "Auffüllen Saison",
    "Auffüllen Saison": AufSe,
    "Beschaffungszeit (manuell in Tage)": Lieferzeit
  };
};

const ArtikelAnlegen = () => {
  const [kurzl, setKurzl] = useState("");
  const [hersteller, setHersteller] = useState("");
  const [auf, setAuf] = useState("2");
  const [ab, setAb] = useState("1");
  const [lieferzeit, setLieferzeit] = useState("14");
  const [rows, setRows] = useState<ClothRow[]>([createEmptyRow()]);

  const handleCellChange = (id: string, field: keyof ClothRow, value: string) => {
    setRows(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  const deleteRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const processAndDownload = () => {
    const AufAB = parseInt(ab) || 1;
    const AufAuf = parseInt(auf) || 2;
    const AufSe = "";
    const Lieferstatus = "3 - 5 Werktage";
    const LieferzeitVal = parseInt(lieferzeit) || 14;

    // Group by ClothName, ClothCode, color
    const groups: Record<string, ClothRow[]> = {};
    rows.forEach(row => {
      const key = `${safe(row.ClothName)}|${safe(row.ClothCode)}|${safe(row.color)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    const outputRows: Record<string, string | number>[] = [];

    Object.entries(groups).forEach(([key, groupRows]) => {
      const [name, code, color] = key.split("|");
      if (!name && !code && !color) return; // Skip empty groups

      const sizes = [...new Set(groupRows.map(r => safe(r.Size)))];
      const hasParent = sizes.length > 1;

      if (hasParent) {
        const vaterArtikelnummer = artikelnummerBuilder(kurzl, name, code, color, "");
        outputRows.push(buildRow(
          vaterArtikelnummer, "", name, "", color, "", "", "", "", hersteller,
          AufAB, AufAuf, AufSe, Lieferstatus, LieferzeitVal, ""
        ));
      }

      groupRows.forEach(r => {
        const artikelnummer = artikelnummerBuilder(kurzl, name, code, color, r.Size);
        const hanVal = safe(r.ClothCode) || safe(r.EAN) || "";
        const eanVal = safe(r.EAN) || "";
        outputRows.push(buildRow(
          artikelnummer,
          hasParent ? artikelnummerBuilder(kurzl, name, code, color, "") : "",
          name,
          r.Size,
          color,
          eanVal,
          hanVal,
          r.EK,
          r.VK,
          hersteller,
          AufAB,
          AufAuf,
          AufSe,
          Lieferstatus,
          LieferzeitVal,
          r.Menge
        ));
      });
    });

    // Convert to CSV
    if (outputRows.length === 0) return;

    const headers = Object.keys(outputRows[0]);
    const escCsv = (v: unknown) => {
      if (v === null || v === undefined) return "";
      let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
      s = s.replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
      if (/[";]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csvContent = [
      headers.map(escCsv).join(";"),
      ...outputRows.map(row => headers.map(h => escCsv(row[h])).join(";"))
    ].join("\r\n");

    // Download
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`;
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kurzl || "export"}_artikelanlegen_GESAMT_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: keyof ClothRow; label: string; width: string }[] = [
    { key: "ClothName", label: "ClothName", width: "180px" },
    { key: "ClothCode", label: "ClothCode", width: "120px" },
    { key: "color", label: "color", width: "100px" },
    { key: "Size", label: "Size", width: "80px" },
    { key: "EAN", label: "EAN", width: "140px" },
    { key: "HAN", label: "HAN", width: "120px" },
    { key: "EK", label: "EK", width: "80px" },
    { key: "VK", label: "VK", width: "80px" },
    { key: "Menge", label: "Menge", width: "80px" },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">Artikel Anlegen</h1>
        
        {/* Input Controls */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kurzl">KURZL</Label>
              <Input 
                id="kurzl" 
                value={kurzl} 
                onChange={(e) => setKurzl(e.target.value)}
                placeholder="z.B. SNU FS26"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hersteller">Hersteller</Label>
              <Input 
                id="hersteller" 
                value={hersteller} 
                onChange={(e) => setHersteller(e.target.value)}
                placeholder="z.B. SNUG"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="auf">AUF</Label>
              <Select value={auf} onValueChange={setAuf}>
                <SelectTrigger id="auf">
                  <SelectValue placeholder="Wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ab">AB</Label>
              <Select value={ab} onValueChange={setAb}>
                <SelectTrigger id="ab">
                  <SelectValue placeholder="Wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lieferzeit">Lieferzeit (Tage)</Label>
              <Input 
                id="lieferzeit" 
                type="number"
                value={lieferzeit} 
                onChange={(e) => setLieferzeit(e.target.value)}
                placeholder="14"
              />
            </div>
          </div>
        </div>

        {/* Excel-like Table */}
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[hsl(320,70%,75%)]">
                  {columns.map(col => (
                    <th 
                      key={col.key}
                      className="border border-[hsl(320,60%,65%)] px-2 py-2 text-left text-sm font-semibold text-foreground"
                      style={{ minWidth: col.width }}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="border border-[hsl(320,60%,65%)] px-2 py-2 w-10 bg-[hsl(320,70%,75%)]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className={rowIndex % 2 === 0 ? "bg-[hsl(320,70%,92%)]" : "bg-[hsl(320,70%,88%)]"}>
                    {columns.map(col => (
                      <td key={col.key} className="border border-[hsl(320,60%,80%)] p-0">
                        <input
                          type="text"
                          value={row[col.key]}
                          onChange={(e) => handleCellChange(row.id, col.key, e.target.value)}
                          className="w-full px-2 py-1.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        />
                      </td>
                    ))}
                    <td className="border border-[hsl(320,60%,80%)] p-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteRow(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={addRow} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Zeile hinzufügen
          </Button>
          <Button onClick={processAndDownload} className="gap-2">
            <Download className="h-4 w-4" />
            CSV exportieren
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ArtikelAnlegen;
