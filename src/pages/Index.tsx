import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Trash2, ClipboardPaste, Undo2, Sparkles, Loader2, Globe } from "lucide-react";
import { MerkmaleMultiSelect } from "@/components/MerkmaleMultiSelect";
import { useToast } from "@/hooks/use-toast";
import { FindReplaceDialog } from "@/components/FindReplaceDialog";
import { supabase } from "@/integrations/supabase/client";
import { type Lang, t, warengruppeTranslations, farbeTranslations, artTranslations, groesseTranslations, getDisplayValue, getDropdownOptions } from "@/lib/translations";

interface CellPosition {
  row: number;
  col: number;
}

interface ClothRow {
  id: string;
  ClothName: string;
  WarenGruppe: string;
  color: string;
  Size: string;
  EAN: string;
  HAN: string;
  EK: string;
  VK: string;
  Menge: string;
  MerkmaleGroesse?: string;
  MerkmaleFarbe?: string;
  MerkmaleArt?: string;
}

const createEmptyRow = (): ClothRow => ({
  id: crypto.randomUUID(),
  ClothName: "",
  WarenGruppe: "",
  color: "",
  Size: "",
  EAN: "",
  HAN: "",
  EK: "",
  VK: "",
  Menge: "",
  MerkmaleGroesse: "",
  MerkmaleFarbe: "",
  MerkmaleArt: "",
});

const safe = (val: string | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const v = String(val).trim();
  return v.toLowerCase() === "nan" ? "" : v;
};

// Column letter to index mapping (A=0, B=1, etc.)
const colLetterToIndex = (letter: string): number => {
  const upper = letter.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1; // 0-indexed
};

// Parse cell reference like "A1" into {col: 0, row: 0}
const parseCellRef = (ref: string): { col: number; row: number } | null => {
  const match = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const col = colLetterToIndex(match[1]);
  const row = parseInt(match[2], 10) - 1; // 0-indexed
  return { col, row };
};

// Get cell value by reference
const getCellValue = (
  ref: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): string => {
  const parsed = parseCellRef(ref);
  if (!parsed) return "";
  const { col, row } = parsed;
  if (row < 0 || row >= rows.length || col < 0 || col >= columns.length) return "";
  return rows[row][columns[col].key] || "";
};

// Parse a range like "H1:H10" into array of cell references
const parseRange = (range: string): string[] => {
  const match = range.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!match) return [];
  
  const startCol = colLetterToIndex(match[1]);
  const startRow = parseInt(match[2], 10);
  const endCol = colLetterToIndex(match[3]);
  const endRow = parseInt(match[4], 10);
  
  const refs: string[] = [];
  for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) {
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
      // Convert column index back to letter
      let colLetter = "";
      let c = col + 1;
      while (c > 0) {
        colLetter = String.fromCharCode(((c - 1) % 26) + 65) + colLetter;
        c = Math.floor((c - 1) / 26);
      }
      refs.push(`${colLetter}${row}`);
    }
  }
  return refs;
};

// Get numeric value from cell
const getNumericValue = (
  ref: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): number => {
  const value = getCellValue(ref, rows, columns);
  const numValue = parseFloat(value.replace(",", "."));
  return isNaN(numValue) ? 0 : numValue;
};

// Evaluate a formula string (starting with =)
const evaluateFormula = (
  formula: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): string => {
  if (!formula.startsWith("=")) return formula;
  
  let expr = formula.slice(1).trim();
  
  // Check for SUM function
  const sumMatch = expr.match(/^SUM\(([^)]+)\)$/i);
  if (sumMatch) {
    const arg = sumMatch[1].trim();
    let values: number[] = [];
    
    // Check if it's a range (e.g., H1:H10)
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns));
    } else {
      // Single cell or comma-separated cells
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns));
    }
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2).replace(".", ",");
  }
  
  // Check for AVERAGE function
  const avgMatch = expr.match(/^AVERAGE\(([^)]+)\)$/i);
  if (avgMatch) {
    const arg = avgMatch[1].trim();
    let values: number[] = [];
    
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns));
    } else {
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns));
    }
    
    if (values.length === 0) return "0";
    const avg = values.reduce((acc, val) => acc + val, 0) / values.length;
    return avg.toFixed(2).replace(".", ",");
  }
  
  // Check for COUNT function
  const countMatch = expr.match(/^COUNT\(([^)]+)\)$/i);
  if (countMatch) {
    const arg = countMatch[1].trim();
    let values: number[] = [];
    
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns)).filter(v => v !== 0);
    } else {
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns)).filter(v => v !== 0);
    }
    
    return String(values.length);
  }
  
  // Check if it's a string concatenation formula (contains &)
  if (expr.includes("&")) {
    const parts = expr.split("&").map(p => p.trim());
    const result = parts.map(part => {
      // Check if it's a quoted string
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      // Check if it's a cell reference
      const cellRef = parseCellRef(part);
      if (cellRef) {
        return getCellValue(part, rows, columns);
      }
      return part;
    });
    return result.join("");
  }
  
  // For arithmetic operations, replace cell references with values
  const cellRefPattern = /([A-Za-z]+\d+)/g;
  let processedExpr = expr.replace(cellRefPattern, (match) => {
    const value = getCellValue(match, rows, columns);
    // Try to parse as number, handle comma as decimal separator
    const numValue = parseFloat(value.replace(",", "."));
    return isNaN(numValue) ? "0" : String(numValue);
  });
  
  // Safely evaluate arithmetic expression (only allow numbers and basic operators)
  try {
    // Validate expression contains only safe characters
    if (!/^[\d\s+\-*/().]+$/.test(processedExpr)) {
      return "#ERROR";
    }
    // Use Function constructor for safe evaluation
    const result = new Function(`return (${processedExpr})`)();
    if (typeof result === "number") {
      // Format with 2 decimal places if needed
      return Number.isInteger(result) ? String(result) : result.toFixed(2).replace(".", ",");
    }
    return String(result);
  } catch {
    return "#ERROR";
  }
};

const toProperCase = (s: string): string =>
  s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

// Map a Size value to the best matching MerkmaleGroesse option
const mapSizeToMerkmaleGroesse = (size: string, options: string[]): string => {
  if (!size.trim()) return "";
  const s = size.trim().toLowerCase();
  
  // Try exact match first
  for (const opt of options) {
    if (opt.toLowerCase() === s) return opt;
  }
  
  // Try matching the numeric cm part (e.g. "86" matches "86 cm (12-18 M)")
  const numericSize = parseInt(s, 10);
  if (!isNaN(numericSize)) {
    for (const opt of options) {
      const cmMatch = opt.match(/^(\d+)\s*cm/);
      if (cmMatch && parseInt(cmMatch[1], 10) === numericSize) return opt;
    }
  }
  
  // Try substring match
  for (const opt of options) {
    if (opt.toLowerCase().includes(s) || s.includes(opt.toLowerCase().split(" ")[0])) return opt;
  }
  
  return "";
};

// Map a color value to the best matching MerkmaleFarbe option
const mapColorToMerkmaleFarbe = (color: string, options: string[]): string => {
  if (!color.trim()) return "";
  const c = color.trim().toLowerCase();
  
  const colorMap: Record<string, string> = {
    pink: "rosa", blue: "blau", brown: "braun", yellow: "gelb", grey: "grau", gray: "grau",
    green: "grün", multicolor: "mehrfärbig", bunt: "mehrfärbig", red: "rot", black: "schwarz",
    turquoise: "türkis", purple: "violett", violet: "violett", white: "weiß", beige: "beige",
    orange: "orange", rose: "rosa", nuvola: "weiß", cream: "beige", ivory: "beige",
    navy: "blau", mint: "grün", khaki: "grün", sand: "beige", taupe: "braun",
  };
  
  for (const opt of options) {
    if (opt.toLowerCase() === c) return opt;
  }
  
  for (const [key, val] of Object.entries(colorMap)) {
    if (c.includes(key)) {
      const match = options.find(o => o.toLowerCase() === val);
      if (match) return match;
    }
  }
  
  for (const opt of options) {
    if (opt.toLowerCase().includes(c) || c.includes(opt.toLowerCase())) return opt;
  }
  
  return "";
};

const artikelnummerBuilder = (KRZL: string, name: string, color: string, size: string): string => {
  const parts = [KRZL.toUpperCase(), toProperCase(name), color.toLowerCase()].filter(Boolean);
  if (size !== "") {
    parts.push(size.toUpperCase());
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
};

const buildRow = (
  artikelnummer: string, vaterartikel: string, name: string,
  size: string, color: string, EAN: string, HAN: string, EK: string, VK: string, Hersteller: string,
  AufAB: number, AufAuf: number, AufSe: string, Lieferstatus: string, Lieferzeit: number, Menge: string,
  Lieferant: string,
  warengruppe: string, translatedName: string = "", translatedNameEN: string = ""
): Record<string, string | number> => {
  let check = "";
  try {
    const ek = parseFloat(EK.replace(",", "."));
    const vk = parseFloat(VK.replace(",", "."));
    check = ek < vk ? "OK" : "ERROR";
  } catch {
    check = "";
  }

  // Proper Case name + lowercase color, no double spaces
  const fmtName = (n: string) => toProperCase(n);
  const nameWithColor = [fmtName(translatedName || name), color ? color.toLowerCase() : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const nameWithColorEN = [fmtName(translatedNameEN || name), color ? color.toLowerCase() : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return {
    "für Kassa aktivieren": "Y",
    "Artikelnummer": artikelnummer,
    "VaterArtikel ID-Feld": vaterartikel,
    "EAN": EAN || "",
    "HAN": HAN || "",
    "Artikelname/Etikettenname": nameWithColor,
    "VarName 1 (Größe)": "Größe",
    "Wert Name 1": size || "",
    "Größe Sort.no": "",
    "EK Netto": EK,
    "VK Brutto": VK,
    "EK < VK": check,
    "Hersteller": Hersteller.toUpperCase(),
    "Lieferant": Lieferant || Hersteller.split(' ').map(w => ['mit','zum','aus'].includes(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    "Lieferstatus": Lieferstatus,
    "Lieferzeit ohne Bestand mit ÜV": Lieferzeit,
    "Versandklasse": "standard",
    "Warengruppe": warengruppe,
    "Liefer. EK": EK,
    "Lieferanten ArtikelNR": HAN || "",
    "Puffer": 0,
    "Var Darstel.form Größe": "SWATCHES",
    "Var Darstel.form Farbe": "DROPDOWN",
    "Variationsname Englisch": "size",
    "Variationsname Englisch2": "color",
    "Onlineshop Artikelname Deutsch": nameWithColor,
    "Onlineshop Artikelname Englisch": nameWithColorEN,
    "Bestell Menge": Menge || "",
    "Spalte2": "KG Store Auffüllen AB",
    "KG Store Auffüllen AB": AufAB,
    "Spalte3": "KG Store Auffüllen AUF",
    "KG Store Auffüllen AUF": AufAuf,
    "Spalte4": "",
    "Kategorie f. Kassa Ebene 1": "Kassenartikel",
    "Kategorie f. Kassa Ebene 2": "alle",
    "Name Auffüllen Saison": "Auffüllen Saison",
    "Auffüllen Saison": AufSe,
    "Abnahmeintervall": 0,
    "Mindestabnahme": 0,
    "Bild 1": "",
    "Beschaffungszeit (manuell in Tage)": Lieferzeit,
    "Bild URL": "",
  };
};

const Index = () => {
  const { toast } = useToast();
  const [lang, setLang] = useState<Lang>("DE");
  const [kurzl, setKurzl] = useState("");
  const [vaterstat, setVaterstat] = useState(false);
  const [hersteller, setHersteller] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [auf, setAuf] = useState("2");
  const [ab, setAb] = useState("1");
  const [aufSe, setAufSe] = useState("");
  const [lieferzeit, setLieferzeit] = useState("14");
  const [verfuegbarkeit, setVerfuegbarkeit] = useState("3 - 5 Werktage");
  const verfuegbarkeitOptions = [
    "2 - 5 Werktage",
    "3 - 7 Werktage",
    "4 - 5 Werktage",
    "5 - 7 Werktage",
    "1 - 2 Wochen",
    "2 - 3 Wochen",
    "3 - 4 Wochen",
    "4 - 8 Wochen",
    "Derzeit nicht verfügbar",
    "Liefertermin auf Anfrage",
  ];
  const warengruppeOptions = [
    "Accessoires",
    "Care",
    "Deko",
    "Dienstleistungen",
    "Essen/Trinken",
    "Fahren",
    "Fahrräder",
    "Gutscheine",
    "Homeware",
    "KiWa",
    "KiWa Zubehör",
    "Kleidung Basics",
    "Kleidung Funktion",
    "Kleidung Mode",
    "Medien",
    "Möbel",
    "Schuhe",
    "Spielzeug Baby",
    "Spielzeug Kind",
    "Spielzeug Kleinkind",
    "Taschen",
    "Tragen"
  ];

  // Merkmale state and options (placeholder values - to be updated)
  const [merkmale, setMerkmale] = useState(false);
  
  const merkmaleGroesseOptions = [
    "50 cm (0M)", "62 cm (0-3 M)", "68 cm (3-6 M)", "74 cm (6-9 M)", "80 cm (9-12 M)",
    "86 cm (12-18 M)", "92 cm (2 J)", "98 cm (3 J)", "110 cm (4 J)", "120 cm (5 J)", "128 cm (6 J)"
  ];
  
  const merkmaleFarbeOptions = [
    "beige", "blau", "braun", "gelb", "grau", "grün", "mehrfärbig",
    "orange", "rosa", "rot", "schwarz", "türkis", "violett", "weiß"
  ];
  
  const merkmaleArtOptions = [
    "Accessories", "Aufbewahrung", "Babyspielsachen", "Babywippe", "Baden", "Beißen",
    "Beleuchtung", "Betten", "Bettwäsche", "Bewegung", "Bodies", "Cardigans", "Care",
    "Decken", "Deko", "Einzelkinderwagen", "Essen", "Fahren", "Fußsäcke",
    "Geschwisterkinderwagen", "Große Spielsachen", "Gutscheine", "Handschuhe", "Hauben",
    "Hochstühle", "Holzspielzeug", "Hosen", "Hüte", "Jacken", "Kinderautositze",
    "Kinderwagen", "Kinderwagen Einzelteil", "Kissen", "Kleider", "Kniestrümpfe",
    "Kommoden", "Kurze Hosen", "Kuscheltiere", "Lätzchen", "Leggings", "Lernen",
    "Matratzen", "Modellbahn", "Musik", "Nestchen", "Overalls", "Pullover", "Puppen",
    "Pyjamas", "Regale", "Röcke", "Schals", "Schlafsäcke", "Schnuller", "Schränke",
    "Schuhe", "Schwimmbekleidung", "Socken", "Spiele", "Spielen", "Stillen", "Stofftiere",
    "Stoffwindeln", "Strampler", "Stühle", "Sweatshirts", "Taschen", "Tattoos", "Teppich",
    "Teppiche", "Tische", "Tops", "Tragen", "Trinken", "T-Shirts", "Waschen",
    "Wickeltaschen", "Wickelunterlagen", "Wiegen", "Zubehör"
  ];
  const [rowCount, setRowCount] = useState("10");
  const [rows, setRows] = useState<ClothRow[]>(() => 
    Array.from({ length: 10 }, () => createEmptyRow())
  );
  const [history, setHistory] = useState<ClothRow[][]>([]);
  const [discount, setDiscount] = useState<string>("");
  const [selection, setSelection] = useState<CellPosition[]>([]);
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [fillHandleDrag, setFillHandleDrag] = useState<{
    sourceRow: number;
    sourceCol: number;
    targetRow: number;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    ClothName: 220,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

  const handleAIClassify = async () => {
    const filledRows = rows.filter(r => r.ClothName.trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    try {
      const itemNames = filledRows.map(r => {
        const parts = [r.ClothName, r.color].filter(Boolean);
        return parts.join(" ").trim();
      });
      const itemSizes = filledRows.map(r => r.Size || "");

      const { data, error } = await supabase.functions.invoke('classify-products', {
        body: {
          items: itemNames,
          sizes: itemSizes,
          warengruppeOptions: warengruppeOptions,
          farbeOptions: merkmaleFarbeOptions,
          artOptions: merkmaleArtOptions,
          groesseOptions: merkmaleGroesseOptions,
        },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast({ title: t("rateLimit", lang), description: t("rateLimitDesc", lang), variant: "destructive" });
        } else if (data.error.includes("Payment")) {
          toast({ title: t("paymentIssue", lang), description: t("paymentIssueDesc", lang), variant: "destructive" });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      const classifications = data?.classifications;
      if (!Array.isArray(classifications)) throw new Error("Invalid response");

      setHistory(prev => [...prev.slice(-19), rows]);
      setRows(prev => {
        const newRows = [...prev];
        let classIdx = 0;
        newRows.forEach((row, i) => {
          if (row.ClothName.trim() !== "" && classIdx < classifications.length) {
            const c = classifications[classIdx];
            newRows[i] = {
              ...row,
              WarenGruppe: c.warengruppe || row.WarenGruppe,
              MerkmaleFarbe: c.farbe || mapColorToMerkmaleFarbe(row.color, merkmaleFarbeOptions) || row.MerkmaleFarbe || "",
              MerkmaleArt: c.art || row.MerkmaleArt || "",
              MerkmaleGroesse: c.groesse || mapSizeToMerkmaleGroesse(row.Size, merkmaleGroesseOptions) || row.MerkmaleGroesse || "",
            };
            classIdx++;
          }
        });
        return newRows;
      });

      toast({ title: t("classifyDone", lang), description: `${classifications.length} ${t("classifyDoneDesc", lang)}` });
    } catch (err) {
      console.error("Classification error:", err);
      toast({ title: t("classifyError", lang), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsClassifying(false);
    }
  };

  // Calculate order total (EK × Menge for all rows)
  const orderTotal = useMemo(() => {
    return rows.reduce((total, row) => {
      const ek = parseFloat((row.EK || "0").replace(",", "."));
      const menge = parseFloat((row.Menge || "0").replace(",", "."));
      if (!isNaN(ek) && !isNaN(menge)) {
        return total + (ek * menge);
      }
      return total;
    }, 0);
  }, [rows]);

  // Sum of Menge (quantity) values
  const filledRowsCount = useMemo(() => {
    return rows.reduce((sum, row) => {
      const val = parseInt(row.Menge, 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [rows]);

  // Calculate discounted total
  const discountedTotal = useMemo(() => {
    const discountValue = parseFloat(discount.replace(",", "."));
    if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
      return orderTotal;
    }
    return orderTotal * (1 - discountValue / 100);
  }, [orderTotal, discount]);

  // Handle discount input change with validation
  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty, or valid numbers 0-100 (including decimals)
    if (value === "" || /^(\d{0,3}([.,]\d{0,2})?)?$/.test(value)) {
      const numValue = parseFloat(value.replace(",", "."));
      if (value === "" || (numValue >= 0 && numValue <= 100)) {
        setDiscount(value);
      }
    }
  };

  const isCellSelected = useCallback((row: number, col: number) => {
    return selection.some(s => s.row === row && s.col === col);
  }, [selection]);

  const getSelectionRange = (start: CellPosition, end: CellPosition): CellPosition[] => {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    const positions: CellPosition[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        positions.push({ row: r, col: c });
      }
    }
    return positions;
  };

  const handleCellMouseDown = (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    if (e.shiftKey && selectionStart) {
      // Shift+click: extend selection
      const range = getSelectionRange(selectionStart, { row: rowIndex, col: colIndex });
      setSelection(range);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle cell in selection
      const exists = selection.some(s => s.row === rowIndex && s.col === colIndex);
      if (exists) {
        setSelection(prev => prev.filter(s => !(s.row === rowIndex && s.col === colIndex)));
      } else {
        setSelection(prev => [...prev, { row: rowIndex, col: colIndex }]);
        setSelectionStart({ row: rowIndex, col: colIndex });
      }
    } else {
      // Normal click: start new selection
      setSelection([{ row: rowIndex, col: colIndex }]);
      setSelectionStart({ row: rowIndex, col: colIndex });
      setIsSelecting(true);
    }
  };

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (isSelecting && selectionStart) {
      const range = getSelectionRange(selectionStart, { row: rowIndex, col: colIndex });
      setSelection(range);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
    // Fill handle drag end is handled separately
  }, []);

  // Global mouse up listener for both selection and fill handle
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleMouseUp]);

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey] || 180;
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (resizingColumn) {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(100, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    }
  }, [resizingColumn]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  // Global resize listeners
  useEffect(() => {
    if (resizingColumn) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  const baseColumns: { key: keyof ClothRow; label: string; width: string; isDropdown?: boolean; isMultiSelect?: boolean; resizable?: boolean; dropdownOptions?: string[]; translationMap?: Record<string, string> }[] = [
    { key: "ClothName", label: t("colItemName", lang), width: "220px", resizable: true },
    { key: "WarenGruppe", label: t("colWarenGruppe", lang), width: "150px", isDropdown: true, resizable: true, dropdownOptions: warengruppeOptions, translationMap: warengruppeTranslations },
    { key: "color", label: t("colColor", lang), width: "100px", resizable: true },
    { key: "Size", label: t("colSize", lang), width: "80px", resizable: true },
    { key: "EAN", label: t("colEAN", lang), width: "140px", resizable: true },
    { key: "HAN", label: t("colHAN", lang), width: "120px", resizable: true },
    { key: "EK", label: t("colEK", lang), width: "80px", resizable: true },
    { key: "VK", label: t("colVK", lang), width: "80px", resizable: true },
    { key: "Menge", label: t("colMenge", lang), width: "80px", resizable: true },
  ];

  const merkmaleColumns: { key: keyof ClothRow; label: string; width: string; isDropdown?: boolean; isMultiSelect?: boolean; resizable?: boolean; dropdownOptions?: string[]; translationMap?: Record<string, string> }[] = [
    { key: "MerkmaleGroesse", label: t("colGroesse", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleGroesseOptions, translationMap: groesseTranslations },
    { key: "MerkmaleFarbe", label: t("colFarbe", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleFarbeOptions, translationMap: farbeTranslations },
    { key: "MerkmaleArt", label: t("colArt", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleArtOptions, translationMap: artTranslations },
  ];

  const columns = useMemo(() => {
    if (merkmale) {
      return [...baseColumns, ...merkmaleColumns];
    }
    return baseColumns;
  }, [merkmale, lang]);

  const parseClipboardData = (text: string): ClothRow[] => {
    const lines = text.trim().split(/\r?\n/);
    const parsedRows: ClothRow[] = [];
    
    for (const line of lines) {
      // Split by tab (Excel) or semicolon (CSV)
      const cells = line.includes("\t") ? line.split("\t") : line.split(";");
      
      if (cells.length > 0 && cells.some(c => c.trim() !== "")) {
        parsedRows.push({
          id: crypto.randomUUID(),
          ClothName: safe(cells[0]),
          WarenGruppe: "",
          color: safe(cells[1]),
          Size: safe(cells[2]),
          EAN: safe(cells[3]),
          HAN: safe(cells[4]),
          EK: safe(cells[5]),
          VK: safe(cells[6]),
          Menge: safe(cells[7]),
        });
      }
    }
    return parsedRows;
  };

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsedRows = parseClipboardData(text);
      
      if (parsedRows.length === 0) {
        toast({
          title: "Keine Daten gefunden",
          description: "Die Zwischenablage enthält keine gültigen Daten.",
          variant: "destructive",
        });
        return;
      }
      
      setHistory(prev => [...prev.slice(-19), rows]);
      
      // Find first empty row or append
      const firstEmptyIndex = rows.findIndex(r => 
        !r.ClothName && !r.color && !r.Size && !r.EAN && !r.HAN && !r.EK && !r.VK && !r.Menge
      );
      
      if (firstEmptyIndex >= 0) {
        const newRows = [...rows];
        parsedRows.forEach((pr, i) => {
          if (firstEmptyIndex + i < newRows.length) {
            newRows[firstEmptyIndex + i] = pr;
          } else {
            newRows.push(pr);
          }
        });
        setRows(newRows);
        setRowCount(String(newRows.length));
      } else {
        setRows(prev => [...prev, ...parsedRows]);
        setRowCount(String(rows.length + parsedRows.length));
      }
      
      toast({
        title: "Daten eingefügt",
        description: `${parsedRows.length} Zeilen wurden eingefügt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler beim Einfügen",
        description: "Bitte erlauben Sie den Zugriff auf die Zwischenablage.",
        variant: "destructive",
      });
    }
  }, [rows, toast]);

  const handleCellChange = (id: string, field: keyof ClothRow, value: string, saveHistory = true) => {
    if (saveHistory) {
      setHistory(prev => [...prev.slice(-19), rows]);
    }
    
    // Check if value is a formula
    let finalValue = value;
    if (value.startsWith("=")) {
      finalValue = evaluateFormula(value, rows, columns);
    }
    
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: finalValue };
      // Auto-map Size to MerkmaleGroesse
      if (field === "Size") {
        updated.MerkmaleGroesse = mapSizeToMerkmaleGroesse(finalValue, merkmaleGroesseOptions);
      }
      // Auto-map color to MerkmaleFarbe
      if (field === "color") {
        updated.MerkmaleFarbe = mapColorToMerkmaleFarbe(finalValue, merkmaleFarbeOptions);
      }
      return updated;
    }));
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousState = history[history.length - 1];
      setRows(previousState);
      setHistory(prev => prev.slice(0, -1));
      toast({
        title: "Rückgängig",
        description: "Letzte Änderung wurde rückgängig gemacht.",
      });
    }
  };

  const handleHeaderDropdownChange = (colKey: keyof ClothRow, value: string) => {
    setHistory(prev => [...prev.slice(-19), rows]);
    setRows(prev => prev.map(row => 
      row.ClothName.trim() !== "" ? { ...row, [colKey]: value } : row
    ));
  };

  // Fill down to a specific range (for drag)
  const handleFillToRange = (sourceRow: number, colIndex: number, targetRow: number) => {
    const field = columns[colIndex].key;
    const value = rows[sourceRow][field];
    if (!value || targetRow <= sourceRow) return;
    
    setHistory(prev => [...prev.slice(-19), rows]);
    const fillCount = targetRow - sourceRow;
    setRows(prev => prev.map((row, idx) => 
      idx > sourceRow && idx <= targetRow ? { ...row, [field]: value } : row
    ));
    toast({
      title: "Werte übernommen",
      description: `${fillCount} Zellen wurden aktualisiert.`,
    });
  };

  // Double-click fill: fill until adjacent column has data gap
  const handleFillDoubleClick = (rowIndex: number, colIndex: number) => {
    const field = columns[colIndex].key;
    const value = rows[rowIndex][field];
    if (!value) return;
    
    // Find how far to fill based on adjacent column data
    // Use the first column (ClothName) as reference, or next column if we're at ClothName
    const refColIndex = colIndex === 0 ? 1 : 0;
    const refField = columns[refColIndex]?.key || "ClothName";
    
    let lastRowToFill = rowIndex;
    for (let i = rowIndex + 1; i < rows.length; i++) {
      // Stop if the reference column is empty (end of data block)
      if (!rows[i][refField]?.trim()) break;
      // Also stop if the target cell already has data
      if (rows[i][field]?.trim()) break;
      lastRowToFill = i;
    }
    
    if (lastRowToFill === rowIndex) return; // Nothing to fill
    
    handleFillToRange(rowIndex, colIndex, lastRowToFill);
  };

  // Handle fill handle drag start
  const handleFillHandleMouseDown = (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFillHandleDrag({
      sourceRow: rowIndex,
      sourceCol: colIndex,
      targetRow: rowIndex,
    });
  };

  // Handle fill handle drag move
  const handleFillHandleDragMove = useCallback((rowIndex: number) => {
    if (fillHandleDrag && rowIndex > fillHandleDrag.sourceRow) {
      setFillHandleDrag(prev => prev ? { ...prev, targetRow: rowIndex } : null);
    }
  }, [fillHandleDrag]);

  // Handle fill handle drag end
  const handleFillHandleDragEnd = useCallback(() => {
    if (fillHandleDrag && fillHandleDrag.targetRow > fillHandleDrag.sourceRow) {
      handleFillToRange(fillHandleDrag.sourceRow, fillHandleDrag.sourceCol, fillHandleDrag.targetRow);
    }
    setFillHandleDrag(null);
  }, [fillHandleDrag, rows, columns]);

  // Copy selected cells
  const handleCopySelection = useCallback(async () => {
    if (selection.length === 0) return;

    const minRow = Math.min(...selection.map(s => s.row));
    const maxRow = Math.max(...selection.map(s => s.row));
    const minCol = Math.min(...selection.map(s => s.col));
    const maxCol = Math.max(...selection.map(s => s.col));

    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowData: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const field = columns[c].key;
        rowData.push(rows[r][field] || "");
      }
      lines.push(rowData.join("\t"));
    }
    
    await navigator.clipboard.writeText(lines.join("\n"));
    toast({
      title: "Kopiert",
      description: `${selection.length} Zellen wurden kopiert.`,
    });
  }, [selection, rows, columns, toast]);

  // Paste into selected area
  const handlePasteSelection = useCallback(async () => {
    if (selection.length === 0) return;
    
    try {
      const text = await navigator.clipboard.readText();
      const lines = text.split(/\r?\n/).filter(l => l.length > 0);
      
      const minRow = Math.min(...selection.map(s => s.row));
      const maxRow = Math.max(...selection.map(s => s.row));
      const minCol = Math.min(...selection.map(s => s.col));
      const maxCol = Math.max(...selection.map(s => s.col));
      
      // Single word append mode: if clipboard is a single word (no tabs, no newlines, no semicolons)
      // and pasting into a single column selection, append to existing values
      const isSingleWord = lines.length === 1 && !text.includes("\t") && !text.includes(";") && !text.includes(" ");
      const isSingleColumn = minCol === maxCol;
      
      setHistory(prev => [...prev.slice(-19), rows]);
      
      if (isSingleWord && isSingleColumn && selection.length >= 1) {
        const word = text.trim();
        setRows(prev => {
          const newRows = [...prev];
          selection.forEach(({ row, col }) => {
            const field = columns[col].key;
            const existing = (newRows[row][field] || "").trim();
            newRows[row] = { ...newRows[row], [field]: existing ? `${existing} ${word}` : word };
          });
          return newRows;
        });
      } else {
        setRows(prev => {
          const newRows = [...prev];
          lines.forEach((line, lineIdx) => {
            const cells = line.includes("\t") ? line.split("\t") : line.split(";");
            cells.forEach((cell, cellIdx) => {
              const targetRow = minRow + lineIdx;
              const targetCol = minCol + cellIdx;
              if (targetRow < newRows.length && targetCol < columns.length) {
                const field = columns[targetCol].key;
                newRows[targetRow] = { ...newRows[targetRow], [field]: cell.trim() };
              }
            });
          });
          return newRows;
        });
      }
      
      toast({
        title: "Eingefügt",
        description: `Daten wurden eingefügt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Konnte nicht einfügen.",
        variant: "destructive",
      });
    }
  }, [selection, rows, columns, toast]);

  // Delete selected cells
  const handleDeleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    
    setHistory(prev => [...prev.slice(-19), rows]);
    
    setRows(prev => {
      const newRows = [...prev];
      selection.forEach(({ row, col }) => {
        const field = columns[col].key;
        newRows[row] = { ...newRows[row], [field]: "" };
      });
      return newRows;
    });
    
    toast({
      title: "Gelöscht",
      description: `${selection.length} Zellen wurden gelöscht.`,
    });
  }, [selection, rows, columns, toast]);

  // Find and Replace handler
  const handleFindReplace = useCallback((findValue: string, replaceValue: string, scope: "all" | "selection") => {
    if (!findValue) return;
    
    setHistory(prev => [...prev.slice(-19), rows]);
    
    let replacementCount = 0;
    
    setRows(prev => {
      const newRows = [...prev];
      
      if (scope === "selection" && selection.length > 0) {
        // Replace only in selected cells
        selection.forEach(({ row, col }) => {
          const field = columns[col].key;
          const currentValue = newRows[row][field];
          if (currentValue && currentValue.includes(findValue)) {
            newRows[row] = {
              ...newRows[row],
              [field]: currentValue.split(findValue).join(replaceValue),
            };
            replacementCount++;
          }
        });
      } else {
        // Replace in all cells
        newRows.forEach((row, rowIndex) => {
          columns.forEach((col) => {
            const currentValue = row[col.key];
            if (currentValue && currentValue.includes(findValue)) {
              newRows[rowIndex] = {
                ...newRows[rowIndex],
                [col.key]: currentValue.split(findValue).join(replaceValue),
              };
              replacementCount++;
            }
          });
        });
      }
      
      return newRows;
    });
    
    toast({
      title: "Ersetzen abgeschlossen",
      description: replacementCount > 0 
        ? `${replacementCount} Zellen wurden aktualisiert.`
        : "Keine Übereinstimmungen gefunden.",
    });
  }, [rows, selection, columns, toast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' && !target.closest('table');
      
      // Ctrl+F for Find & Replace - should work anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindReplaceOpen(true);
        return;
      }
      
      if (isInputFocused) return;
      
      // Check if we're in a table input that is actively focused (user is editing text)
      const isTableInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.closest('table');
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (isTableInput) return; // Let browser handle native copy in focused input
        if (selection.length > 0) {
          e.preventDefault();
          handleCopySelection();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isTableInput) return; // Let browser handle native paste in focused input
        e.preventDefault();
        if (selection.length > 0) {
          handlePasteSelection();
        } else {
          handlePaste();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTableInput) return; // Let browser handle native delete in focused input
        if (selection.length >= 1) {
          e.preventDefault();
          handleDeleteSelection();
        }
      } else if (e.key === 'Escape') {
        if (selection.length > 0) {
          e.preventDefault();
          setSelection([]);
        }
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleCopySelection, handlePasteSelection, handleDeleteSelection, handlePaste, selection, handleUndo]);

  // Select entire column
  const handleColumnSelect = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const positions: CellPosition[] = rows.map((_, rowIndex) => ({ row: rowIndex, col: colIndex }));
    setSelection(positions);
    setSelectionStart({ row: 0, col: colIndex });
  };

  // Select entire row
  const handleRowSelect = (rowIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const positions: CellPosition[] = columns.map((_, colIndex) => ({ row: rowIndex, col: colIndex }));
    if (e.shiftKey && selectionStart) {
      const minRow = Math.min(selectionStart.row, rowIndex);
      const maxRow = Math.max(selectionStart.row, rowIndex);
      const allPositions: CellPosition[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        columns.forEach((_, c) => allPositions.push({ row: r, col: c }));
      }
      setSelection(allPositions);
    } else if (e.ctrlKey || e.metaKey) {
      setSelection(prev => [...prev, ...positions]);
    } else {
      setSelection(positions);
      setSelectionStart({ row: rowIndex, col: 0 });
    }
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: keyof ClothRow) => {
    const pastedText = e.clipboardData.getData("text");
    const lines = pastedText.split(/\r?\n/).filter(line => line.trim() !== "");
    
    // If only one line, let default paste behavior handle it
    if (lines.length <= 1) return;
    
    e.preventDefault();
    
    setRows(prev => {
      const newRows = [...prev];
      lines.forEach((line, i) => {
        const targetIndex = rowIndex + i;
        if (targetIndex < newRows.length) {
          newRows[targetIndex] = { ...newRows[targetIndex], [field]: line.trim() };
        } else {
          const newRow = createEmptyRow();
          newRow[field] = line.trim();
          newRows.push(newRow);
        }
      });
      setRowCount(String(newRows.length));
      return newRows;
    });
    
    toast({
      title: "Daten verteilt",
      description: `${lines.length} Werte wurden in Zeilen verteilt.`,
    });
};


  const handleKeyNavigation = useCallback((e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const { key } = e;
    let newRow = rowIndex;
    let newCol = colIndex;

    if (key === "ArrowUp") {
      e.preventDefault();
      newRow = Math.max(0, rowIndex - 1);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else if (key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      newCol = Math.max(0, colIndex - 1);
    } else if (key === "ArrowRight") {
      const input = e.target as HTMLInputElement;
      if (input.selectionStart === input.value?.length) {
        e.preventDefault();
        newCol = Math.min(columns.length - 1, colIndex + 1);
      }
    } else if (key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIndex > 0) {
          newCol = colIndex - 1;
        } else if (rowIndex > 0) {
          newRow = rowIndex - 1;
          newCol = columns.length - 1;
        }
      } else {
        if (colIndex < columns.length - 1) {
          newCol = colIndex + 1;
        } else if (rowIndex < rows.length - 1) {
          newRow = rowIndex + 1;
          newCol = 0;
        }
      }
    } else if (key === "Enter") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else if (key === "Escape") {
      e.preventDefault();
      const row = rows[rowIndex];
      const field = columns[colIndex].key;
      handleCellChange(row.id, field, "");
      return;
    } else {
      return;
    }

    if (newRow !== rowIndex || newCol !== colIndex) {
      const selector = `[data-row="${newRow}"][data-col="${newCol}"]`;
      const nextCell = document.querySelector(selector) as HTMLElement;
      if (nextCell) {
        nextCell.focus();
      }
    }
  }, [rows.length, columns.length]);

  const setRowsCount = (count: number) => {
    const currentCount = rows.length;
    if (count > currentCount) {
      setRows(prev => [...prev, ...Array.from({ length: count - currentCount }, () => createEmptyRow())]);
    } else if (count < currentCount) {
      setRows(prev => prev.slice(0, count));
    }
  };

  const deleteRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const processAndDownload = async () => {
    const AufAB = parseInt(ab) || 1;
    const AufAuf = parseInt(auf) || 2;
    const AufSe = aufSe;
    const Lieferstatus = verfuegbarkeit || "3 - 5 Werktage";
    const LieferzeitVal = parseInt(lieferzeit) || 14;

    // Group by ClothName, color
    const groups: Record<string, ClothRow[]> = {};
    rows.forEach(row => {
      const key = `${safe(row.ClothName)}|${safe(row.color)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    // === Product type caching: only translate the FIRST WORD, cache results ===

    // Predefined dictionaries for common product types (no API needed)
    const deToEn: Record<string, string> = {
      "hose": "Trousers", "jacke": "Jacket", "hemd": "Shirt", "kleid": "Dress",
      "mantel": "Coat", "pullover": "Sweater", "rock": "Skirt", "bluse": "Blouse",
      "weste": "Vest", "stiefel": "Boots", "schuh": "Shoe", "schuhe": "Shoes",
      "sneaker": "Sneaker", "sneakers": "Sneakers", "tasche": "Bag", "gürtel": "Belt",
      "mütze": "Beanie", "kappe": "Cap", "anzug": "Suit", "shorts": "Shorts",
      "jogginghose": "Sweatpants", "sweatshirt": "Sweatshirt", "cardigan": "Cardigan",
      "parka": "Parka", "blazer": "Blazer", "jeans": "Jeans", "top": "Top",
      "body": "Body", "overall": "Overall", "jumpsuit": "Jumpsuit", "poncho": "Poncho",
      "cape": "Cape", "sandalen": "Sandals", "sandale": "Sandal", "pantolette": "Mule",
      "slipper": "Slipper", "loafer": "Loafer", "ballerina": "Ballerina",
      "handschuhe": "Gloves", "schal": "Scarf", "tuch": "Cloth", "socken": "Socks",
      "strümpfe": "Stockings", "leggings": "Leggings", "bikini": "Bikini",
      "badeanzug": "Swimsuit", "badehose": "Swim Trunks", "t-shirt": "T-Shirt",
      "poloshirt": "Polo Shirt", "hoodie": "Hoodie",
    };
    const enToDe: Record<string, string> = {
      "trousers": "Hose", "jacket": "Jacke", "shirt": "Hemd", "dress": "Kleid",
      "coat": "Mantel", "sweater": "Pullover", "skirt": "Rock", "blouse": "Bluse",
      "vest": "Weste", "boots": "Stiefel", "shoe": "Schuh", "shoes": "Schuhe",
      "sneaker": "Sneaker", "sneakers": "Sneakers", "bag": "Tasche", "belt": "Gürtel",
      "beanie": "Mütze", "cap": "Kappe", "suit": "Anzug", "shorts": "Shorts",
      "sweatpants": "Jogginghose", "sweatshirt": "Sweatshirt", "cardigan": "Cardigan",
      "parka": "Parka", "blazer": "Blazer", "jeans": "Jeans", "top": "Top",
      "body": "Body", "overall": "Overall", "jumpsuit": "Jumpsuit", "poncho": "Poncho",
      "cape": "Cape", "sandals": "Sandalen", "sandal": "Sandale", "mule": "Pantolette",
      "slipper": "Slipper", "loafer": "Loafer", "ballerina": "Ballerina",
      "gloves": "Handschuhe", "scarf": "Schal", "cloth": "Tuch", "socks": "Socken",
      "stockings": "Strümpfe", "leggings": "Leggings", "bikini": "Bikini",
      "swimsuit": "Badeanzug", "swim trunks": "Badehose", "t-shirt": "T-Shirt",
      "polo shirt": "Poloshirt", "hoodie": "Hoodie",
    };

    // Known German product types for language detection
    const germanProductTypes = new Set(Object.keys(deToEn));

    const detectIsGerman = (name: string): boolean => {
      const firstWord = name.split(" ")[0].toLowerCase();
      return germanProductTypes.has(firstWord);
    };

    // Collect unique product names
    const uniqueNames = [...new Set(
      Object.keys(groups).map(key => key.split("|")[0]).filter(n => n.length > 0)
    )];

    // Extract unique first words (product types) and use local dictionary only
    const productTypeCache: Record<string, { de: string; en: string }> = {};

    uniqueNames.forEach(name => {
      const parts = name.split(" ");
      const firstWord = parts[0];
      const firstWordLower = firstWord.toLowerCase();

      if (productTypeCache[firstWordLower]) return;

      const isGerman = germanProductTypes.has(firstWordLower);

      if (isGerman) {
        const enTranslation = deToEn[firstWordLower];
        productTypeCache[firstWordLower] = { de: firstWord, en: enTranslation || firstWord };
      } else {
        const deTranslation = enToDe[firstWordLower];
        productTypeCache[firstWordLower] = { de: deTranslation || firstWord, en: firstWord };
      }
    });

    // Build full translated names by reconstructing: translated type + rest of original
    const translationMapDE: Record<string, string> = {};
    const translationMapEN: Record<string, string> = {};

    uniqueNames.forEach(name => {
      const parts = name.split(" ");
      const firstWordLower = parts[0].toLowerCase();
      const rest = parts.slice(1).join(" ");
      const cached = productTypeCache[firstWordLower];

      if (cached) {
        translationMapDE[name] = rest ? `${cached.de} ${rest}` : cached.de;
        translationMapEN[name] = rest ? `${cached.en} ${rest}` : cached.en;
      } else {
        // Fallback: use original name for both
        translationMapDE[name] = name;
        translationMapEN[name] = name;
      }
    });

    const outputRows: Record<string, string | number>[] = [];

    Object.entries(groups).forEach(([key, groupRows]) => {
      const [name, color] = key.split("|");
      if (!name && !color) return;

      const sizes = [...new Set(groupRows.map(r => safe(r.Size)))];
      const hasParent = vaterstat && sizes.length > 1;
      // German translation is fetched ONCE per name and reused for both Artikelname/Etikettenname and Onlineshop Artikelname Deutsch
      const translated = translationMapDE[name] || "";
      const translatedEN = translationMapEN[name] || "";

      if (hasParent) {
        const vaterArtikelnummer = artikelnummerBuilder(kurzl, name, color, "");
        const firstRowWarengruppe = groupRows[0]?.WarenGruppe || "";
        outputRows.push(buildRow(
          vaterArtikelnummer, "", name, "", color, "", "", "", "", hersteller,
          AufAB, AufAuf, AufSe, Lieferstatus, LieferzeitVal, "", lieferant, firstRowWarengruppe, translated, translatedEN
        ));
      }

      groupRows.forEach(r => {
        const artikelnummer = artikelnummerBuilder(kurzl, name, color, r.Size);
        const eanVal = safe(r.EAN) || "";
        const hanVal = safe(r.HAN) || "";
        outputRows.push(buildRow(
          artikelnummer,
          hasParent ? artikelnummerBuilder(kurzl, name, color, "") : "",
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
          r.Menge,
          lieferant,
          r.WarenGruppe || "",
          translated,
          translatedEN
        ));
      });
    });
    if (outputRows.length === 0) return;

    const headers = Object.keys(outputRows[0]);
    const csvContent = [
      headers.join(";"),
      ...outputRows.map(row => 
        headers.map(h => {
          let val = row[h];
          if (typeof val === "number") val = String(val).replace(".", ",");
          return String(val).replace(/"/g, '""');
        }).join(";")
      )
    ].join("\n");

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

  const downloadMerkmaleCSV = () => {
    const filledRows = rows.filter(r => r.ClothName.trim() !== "");
    if (filledRows.length === 0) return;

    // Parse comma-separated values into arrays
    const parseMulti = (val: string | undefined) => (val || "").split(",").map(v => v.trim()).filter(Boolean);

    // Find max count per merkmal type across all rows
    let maxGroesse = 1, maxArt = 1, maxFarbe = 1;
    filledRows.forEach(r => {
      maxGroesse = Math.max(maxGroesse, parseMulti(r.MerkmaleGroesse).length);
      maxArt = Math.max(maxArt, parseMulti(r.MerkmaleArt).length);
      maxFarbe = Math.max(maxFarbe, parseMulti(r.MerkmaleFarbe).length);
    });

    // Build dynamic headers
    const headers: string[] = ["Artikelnummer"];
    for (let i = 0; i < maxGroesse; i++) headers.push("Größe", "Größewert");
    for (let i = 0; i < maxArt; i++) headers.push("Art", "Artwert");
    for (let i = 0; i < maxFarbe; i++) headers.push("Farbe", "Farbewert");

    const csvRows = filledRows.map(r => {
      const artikelnummer = artikelnummerBuilder(kurzl, r.ClothName, r.color, r.Size);
      const groesseVals = parseMulti(r.MerkmaleGroesse);
      const artVals = parseMulti(r.MerkmaleArt);
      const farbeVals = parseMulti(r.MerkmaleFarbe);

      const cells: string[] = [artikelnummer];
      for (let i = 0; i < maxGroesse; i++) {
        cells.push(groesseVals[i] ? "Größe" : "", groesseVals[i] || "");
      }
      for (let i = 0; i < maxArt; i++) {
        cells.push(artVals[i] ? "Art" : "", artVals[i] || "");
      }
      for (let i = 0; i < maxFarbe; i++) {
        cells.push(farbeVals[i] ? "Farbe" : "", farbeVals[i] || "");
      }
      return cells;
    });

    const csvContent = [
      headers.join(";"),
      ...csvRows.map(cells => cells.map(c => c.replace(/"/g, '""')).join(";"))
    ].join("\n");

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`;
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kurzl || "export"}_merkmale_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
        onReplace={handleFindReplace}
        hasSelection={selection.length > 0}
      />
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("pageTitle", lang)}</h1>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setLang(prev => prev === "DE" ? "EN" : "DE")}
          >
            <Globe className="h-4 w-4" />
            {lang === "DE" ? "EN" : "DE"}
          </Button>
        </div>
        
        {/* Input Controls */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="kurzl" className="text-xs">{t("kurzl", lang)}</Label>
              <Input id="kurzl" value={kurzl} onChange={(e) => setKurzl(e.target.value)} placeholder="z.B. SNU FS26" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="hersteller" className="text-xs">{t("hersteller", lang)}</Label>
              <Input id="hersteller" value={hersteller} onChange={(e) => setHersteller(e.target.value)} placeholder="z.B. SNUG" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="lieferant" className="text-xs">{t("lieferant", lang)}</Label>
              <Input id="lieferant" value={lieferant} onChange={(e) => setLieferant(e.target.value)} placeholder="z.B. Snug" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="auf" className="text-xs">{t("auf", lang)}</Label>
              <Input id="auf" type="number" min="0" value={auf} onChange={(e) => setAuf(e.target.value)} className="w-14" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="ab" className="text-xs">{t("ab", lang)}</Label>
              <Input id="ab" type="number" min="0" value={ab} onChange={(e) => setAb(e.target.value)} className="w-14" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="aufSe" className="text-xs">{t("auffuellSeason", lang)}</Label>
              <Input id="aufSe" value={aufSe} onChange={(e) => setAufSe(e.target.value)} placeholder="z.B. SS25" className="w-28" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="lieferzeit" className="text-xs">{t("lieferzeit", lang)}</Label>
              <Input id="lieferzeit" inputMode="numeric" pattern="[0-9]*" value={lieferzeit} onChange={(e) => setLieferzeit(e.target.value.replace(/[^0-9]/g, ''))} placeholder="14" className="w-14" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="verfuegbarkeit" className="text-xs">{t("lieferstatusOnline", lang)}</Label>
              <Select value={verfuegbarkeit} onValueChange={setVerfuegbarkeit}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t("lieferstatusPlaceholder", lang)} />
                </SelectTrigger>
                <SelectContent>
                  {verfuegbarkeitOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 border-t border-border mt-1">
                    <Input
                      placeholder={t("manualInput", lang)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) setVerfuegbarkeit(val);
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 pb-2">
              <div className="flex items-center gap-1.5">
                <Checkbox id="vaterstat" checked={vaterstat} onCheckedChange={(checked) => setVaterstat(checked === true)} />
                <Label htmlFor="vaterstat" className="text-xs font-normal cursor-pointer">{t("vaterStatus", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="merkmale" checked={merkmale} onCheckedChange={(checked) => setMerkmale(checked === true)} />
                <Label htmlFor="merkmale" className="text-xs font-normal cursor-pointer">{t("merkmale", lang)}</Label>
              </div>
            </div>
          </div>
        </div>

        {/* Excel-like Table */}
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full border-collapse select-none">
              <thead>
                <tr className="bg-[hsl(0,0%,85%)]">
                  <th className="border border-[hsl(0,0%,75%)] px-1 py-2 w-8 bg-[hsl(0,0%,80%)] cursor-pointer hover:bg-[hsl(0,0%,75%)]"
                    onClick={() => {
                      // Select all cells
                      const allCells: CellPosition[] = [];
                      rows.forEach((_, r) => columns.forEach((_, c) => allCells.push({ row: r, col: c })));
                      setSelection(allCells);
                    }}
                    title={t("selectAll", lang)}
                  >
                    <span className="text-xs text-muted-foreground">#</span>
                  </th>
                  {columns.map((col, colIndex) => (
                    <th 
                      key={col.key}
                      className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-sm font-semibold text-foreground cursor-pointer hover:bg-[hsl(0,0%,80%)] relative"
                      style={{ 
                        minWidth: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : col.width,
                        width: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                      }}
                      onClick={(e) => !col.isDropdown && !col.resizable && handleColumnSelect(colIndex, e)}
                    >
                      <div className="flex items-center justify-between">
                        {col.isDropdown && col.dropdownOptions ? (
                          <Select onValueChange={(value) => handleHeaderDropdownChange(col.key, value)}>
                            <SelectTrigger className="h-7 bg-white border-border text-sm font-semibold">
                              <SelectValue placeholder={col.label} />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              {getDropdownOptions(col.dropdownOptions, col.translationMap || {}, lang).map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span onClick={(e) => { e.stopPropagation(); handleColumnSelect(colIndex, e); }}>
                            {col.label}
                          </span>
                        )}
                        {col.resizable && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="border border-[hsl(0,0%,75%)] px-2 py-2 w-10 bg-[hsl(0,0%,85%)]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className={rowIndex % 2 === 0 ? "bg-[hsl(0,0%,96%)]" : "bg-[hsl(0,0%,92%)]"}>
                    <td 
                      className="border border-[hsl(0,0%,85%)] px-1 py-1 text-center text-xs text-muted-foreground bg-[hsl(0,0%,90%)] cursor-pointer hover:bg-[hsl(0,0%,85%)]"
                      onClick={(e) => handleRowSelect(rowIndex, e)}
                      title={t("selectRow", lang)}
                    >
                      {rowIndex + 1}
                    </td>
                    {columns.map((col, colIndex) => {
                      const isSelected = isCellSelected(rowIndex, colIndex);
                      const isInFillRange = fillHandleDrag && 
                        colIndex === fillHandleDrag.sourceCol &&
                        rowIndex > fillHandleDrag.sourceRow && 
                        rowIndex <= fillHandleDrag.targetRow;
                      const isItemNameCol = col.key === "ClothName";
                      const cellValue = row[col.key];
                      const showTooltip = isItemNameCol && cellValue && cellValue.length > 30;
                      
                      return (
                        <td 
                          key={col.key} 
                          className={`border border-[hsl(0,0%,85%)] p-0 relative group/cell ${isSelected ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''} ${isInFillRange ? 'bg-primary/30 ring-1 ring-primary ring-inset' : ''}`}
                          style={{
                            width: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                            minWidth: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                          }}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                          onMouseEnter={() => {
                            handleCellMouseEnter(rowIndex, colIndex);
                            if (fillHandleDrag && colIndex === fillHandleDrag.sourceCol) {
                              handleFillHandleDragMove(rowIndex);
                            }
                          }}
                          onMouseUp={() => {
                            if (fillHandleDrag) {
                              handleFillHandleDragEnd();
                            }
                          }}
                        >
                          {col.isMultiSelect && col.dropdownOptions ? (
                            <div 
                              className="relative"
                              onClickCapture={(e) => {
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }
                              }}
                            >
                              <MerkmaleMultiSelect
                                values={(row[col.key] || "").split(",").map(v => v.trim()).filter(Boolean)}
                                options={col.dropdownOptions}
                                translationMap={col.translationMap || {}}
                                lang={lang}
                                placeholder={t("choose", lang)}
                                onChange={(vals) => handleCellChange(row.id, col.key, vals.join(", "))}
                                data-row={rowIndex}
                                data-col={colIndex}
                                onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                              />
                              {row[col.key] && rowIndex < rows.length - 1 && (
                                <div
                                  className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                                  onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                                  title={t("fillDoubleClick", lang)}
                                />
                              )}
                            </div>
                          ) : col.isDropdown && col.dropdownOptions ? (
                            <div 
                              className="relative"
                              onClickCapture={(e) => {
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }
                              }}
                            >
                              <Select 
                                value={row[col.key] || ""} 
                                onValueChange={(value) => handleCellChange(row.id, col.key, value)}
                              >
                                <SelectTrigger 
                                  className="w-full h-8 border-none rounded-none bg-transparent focus:ring-2 focus:ring-primary/50 text-sm pr-8"
                                  data-row={rowIndex}
                                  data-col={colIndex}
                                  onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                                  onPointerDown={(e) => {
                                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  }}
                                >
                                  <SelectValue placeholder={t("choose", lang)}>
                                    {row[col.key] ? getDisplayValue(row[col.key] || "", col.translationMap || {}, lang) : undefined}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {getDropdownOptions(col.dropdownOptions, col.translationMap || {}, lang).map(({ value, label }) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {row[col.key] && rowIndex < rows.length - 1 && (
                                <div
                                  className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                                  onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                                  title={t("fillDoubleClick", lang)}
                                />
                              )}
                            </div>
                          ) : isItemNameCol ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <textarea
                                    value={cellValue}
                                    onChange={(e) => handleCellChange(row.id, col.key, e.target.value)}
                                    onPaste={(e) => handleCellPaste(e, rowIndex, col.key)}
                                    onKeyDown={(e) => {
                                      // Allow Enter for new line in textarea, use Ctrl+Enter to move down
                                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                                        return; // Allow natural newline
                                      }
                                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        e.preventDefault();
                                        const nextRow = Math.min(rows.length - 1, rowIndex + 1);
                                        const selector = `[data-row="${nextRow}"][data-col="${colIndex}"]`;
                                        const nextCell = document.querySelector(selector) as HTMLElement;
                                        if (nextCell) nextCell.focus();
                                        return;
                                      }
                                      handleKeyNavigation(e, rowIndex, colIndex);
                                    }}
                                    data-row={rowIndex}
                                    data-col={colIndex}
                                    rows={1}
                                    className="w-full px-2 py-1.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm pr-6 resize-none overflow-hidden min-h-[32px]"
                                    style={{
                                      height: 'auto',
                                    }}
                                    onInput={(e) => {
                                      const target = e.target as HTMLTextAreaElement;
                                      target.style.height = 'auto';
                                      target.style.height = `${Math.max(32, target.scrollHeight)}px`;
                                    }}
                                    ref={(el) => {
                                      if (el && cellValue) {
                                        el.style.height = 'auto';
                                        el.style.height = `${Math.max(32, el.scrollHeight)}px`;
                                      }
                                    }}
                                  />
                                </TooltipTrigger>
                                {showTooltip && (
                                  <TooltipContent side="top" className="max-w-xs bg-popover text-popover-foreground z-50">
                                    <p className="whitespace-pre-wrap">{cellValue}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => handleCellChange(row.id, col.key, e.target.value)}
                              onPaste={(e) => handleCellPaste(e, rowIndex, col.key)}
                              onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                              data-row={rowIndex}
                              data-col={colIndex}
                              className="w-full px-2 py-1.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm pr-6"
                            />
                          )}
                          {!col.isDropdown && row[col.key] && rowIndex < rows.length - 1 && (
                            <div
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                              onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                              onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                              title={t("fillDoubleClick", lang)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-[hsl(0,0%,85%)] p-1">
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
        <div className="flex gap-3 items-end flex-wrap">
          <div className="space-y-2">
            <Label htmlFor="rowCount">{t("rowCount", lang)}</Label>
            <Input 
              id="rowCount"
              type="number"
              value={rowCount}
              onChange={(e) => {
                setRowCount(e.target.value);
                const count = parseInt(e.target.value) || 0;
                if (count > 0) setRowsCount(count);
              }}
              className="w-32"
              min="1"
            />
          </div>
          <Button 
            onClick={handleUndo} 
            variant="outline" 
            size="icon"
            disabled={history.length === 0}
            className="h-9 w-9"
            title={t("undoTitle", lang)}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          
          {/* Order Total Summary Panel */}
          <div className="flex items-center gap-3 px-3 h-9 bg-background rounded-md border border-input">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{t("artikel", lang)}</span>
              <span className="text-sm font-semibold">{filledRowsCount}</span>
            </div>
            <div className="w-px h-5 bg-input" />
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{t("bestellwert", lang)}</span>
              <span className="text-sm font-bold text-primary">
                {orderTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </span>
            </div>
            <div className="w-px h-5 bg-input" />
            <div className="flex items-center gap-1">
              <Label htmlFor="discount" className="text-xs text-muted-foreground whitespace-nowrap">{t("rabatt", lang)}</Label>
              <Input
                id="discount"
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={handleDiscountChange}
                placeholder="0"
                className="h-6 w-14 px-1.5 text-sm text-center"
              />
            </div>
            {parseFloat(discount.replace(",", ".")) > 0 && (
              <>
                <div className="w-px h-5 bg-input" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{t("netto", lang)}</span>
                  <span className="text-sm font-bold text-accent-foreground">
                    {discountedTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
              </>
            )}
          </div>
          <Button onClick={handlePaste} variant="outline" className="gap-2">
            <ClipboardPaste className="h-4 w-4" />
            {t("csvPaste", lang)}
          </Button>
          <Button onClick={processAndDownload} className="gap-2">
            <Download className="h-4 w-4" />
            {t("csvExport", lang)}
          </Button>
          {merkmale && (
            <Button onClick={downloadMerkmaleCSV} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t("merkmaleCSV", lang)}
            </Button>
          )}
          <Button 
            onClick={handleAIClassify} 
            variant="outline" 
            className="gap-2"
            disabled={isClassifying}
          >
            {isClassifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isClassifying ? t("aiClassifying", lang) : t("aiClassify", lang)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
