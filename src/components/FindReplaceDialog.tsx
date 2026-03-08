import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search, Replace } from "lucide-react";

interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: (findValue: string, replaceValue: string, scope: "all" | "selection") => void;
  hasSelection: boolean;
}

export const FindReplaceDialog = ({
  open,
  onOpenChange,
  onReplace,
  hasSelection,
}: FindReplaceDialogProps) => {
  const [findValue, setFindValue] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [scope, setScope] = useState<"all" | "selection">("all");

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setFindValue("");
      setReplaceValue("");
      setScope(hasSelection ? "selection" : "all");
    }
  }, [open, hasSelection]);

  const handleReplace = useCallback(() => {
    if (!findValue.trim()) return;
    onReplace(findValue, replaceValue, scope);
    onOpenChange(false);
  }, [findValue, replaceValue, scope, onReplace, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleReplace();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Suchen und Ersetzen
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="find-input">Suchen nach</Label>
            <Input
              id="find-input"
              value={findValue}
              onChange={(e) => setFindValue(e.target.value)}
              placeholder="Text zum Suchen..."
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="replace-input">Ersetzen durch</Label>
            <Input
              id="replace-input"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder="Ersatztext (leer = löschen)"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Bereich</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as "all" | "selection")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="font-normal cursor-pointer">
                  Gesamte Tabelle
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem 
                  value="selection" 
                  id="scope-selection" 
                  disabled={!hasSelection}
                />
                <Label 
                  htmlFor="scope-selection" 
                  className={`font-normal cursor-pointer ${!hasSelection ? 'text-muted-foreground' : ''}`}
                >
                  Nur ausgewählte Zellen {!hasSelection && "(keine Auswahl)"}
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleReplace} 
            disabled={!findValue.trim()}
            className="gap-2"
          >
            <Replace className="h-4 w-4" />
            Alle ersetzen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
