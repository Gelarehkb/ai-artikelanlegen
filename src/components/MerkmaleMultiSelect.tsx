import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { type Lang, getDisplayValue } from "@/lib/translations";

interface MerkmaleMultiSelectProps {
  values: string[]; // array of selected German values
  options: string[];
  translationMap: Record<string, string>;
  lang: Lang;
  placeholder?: string;
  onChange: (values: string[]) => void;
  className?: string;
  "data-row"?: number;
  "data-col"?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function MerkmaleMultiSelect({
  values,
  options,
  translationMap,
  lang,
  placeholder = "Wählen...",
  onChange,
  className,
  onKeyDown,
  ...props
}: MerkmaleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const displayText = values.length > 0
    ? values.map((v) => getDisplayValue(v, translationMap, lang)).join(", ")
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full h-8 flex items-center justify-between px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm text-left ${className || ""}`}
          data-row={props["data-row"]}
          data-col={props["data-col"]}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onClick={(e) => {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }}
        >
          <span className="truncate flex-1">
            {displayText || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-background z-50 max-h-60 overflow-y-auto" align="start">
        {options.map((opt) => {
          const label = getDisplayValue(opt, translationMap, lang);
          return (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer text-sm"
            >
              <Checkbox
                checked={values.includes(opt)}
                onCheckedChange={() => toggleValue(opt)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
