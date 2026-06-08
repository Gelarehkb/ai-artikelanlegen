import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { Lang } from "@/lib/translations";

export interface OnlineTextItem {
  id: string;
  artikelname: string;
  han: string;
  markenname: string;
  beschreibung: string;
  prompt: string;
  groesse?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: OnlineTextItem[];
  onConfirm: (items: OnlineTextItem[]) => void;
  lang: Lang;
}

export const OnlineTextsPreviewDialog = ({ open, onOpenChange, items, onConfirm, lang }: Props) => {
  const [draft, setDraft] = useState<OnlineTextItem[]>([]);

  useEffect(() => {
    if (open) setDraft(items.map(i => ({ ...i })));
  }, [open, items]);

  const update = (id: string, key: keyof OnlineTextItem, value: string) => {
    setDraft(prev => prev.map(it => (it.id === id ? { ...it, [key]: value } : it)));
  };
  const remove = (id: string) => setDraft(prev => prev.filter(it => it.id !== id));
  const add = () =>
    setDraft(prev => [
      ...prev,
      { id: crypto.randomUUID(), artikelname: "", han: "", markenname: "", beschreibung: "", prompt: "", groesse: "" },
    ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {lang === "DE" ? "Online-Texte Vorschau" : "Online texts preview"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-2 w-[280px]">{lang === "DE" ? "Name" : "Name"}</th>
                <th className="text-left p-2">Prompt</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map(it => (
                <tr key={it.id} className="border-t align-top">
                  <td className="p-2">
                    <Input
                      value={it.artikelname}
                      onChange={e => update(it.id, "artikelname", e.target.value)}
                      className="text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <Textarea
                      value={it.prompt}
                      onChange={e => update(it.id, "prompt", e.target.value)}
                      className="text-xs min-h-[120px] max-h-[300px] font-mono"
                    />
                  </td>
                  <td className="p-2">
                    <Button variant="ghost" size="icon" onClick={() => remove(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {draft.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    {lang === "DE" ? "Keine Einträge" : "No entries"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" size="sm" onClick={add} className="gap-2">
            <Plus className="h-4 w-4" />
            {lang === "DE" ? "Eintrag hinzufügen" : "Add entry"}
          </Button>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {lang === "DE" ? "Abbrechen" : "Cancel"}
            </Button>
            <Button onClick={() => onConfirm(draft)} disabled={draft.length === 0}>
              {lang === "DE" ? "Änderungen speichern & generieren" : "Save changes & generate"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
