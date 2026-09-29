import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChecklistSection({
  items,
  onAdd,
  onToggle,
  onRemove,
  placeholder = "Plein d’eau, vidange, réserver la nuit suivante…",
}: {
  items: ChecklistItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  };
  const remaining = items.filter((item) => !item.done).length;

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {remaining === 0 ? "Tout est fait." : `${remaining} à faire sur ${items.length}.`}
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1 pr-1">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={() => onToggle(item.id)}
              className="flex min-h-11 flex-1 items-center gap-3 px-3 text-left text-sm"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md ring-1",
                  item.done ? "bg-primary text-primary-foreground ring-primary" : "ring-foreground/30",
                )}
              >
                {item.done && <Check className="size-4" />}
              </span>
              <span className={cn("flex-1", item.done && "text-muted-foreground line-through")}>{item.text}</span>
            </button>
            <Button variant="ghost" size="icon-sm" className="size-11" aria-label="Retirer" onClick={() => onRemove(item.id)}>
              <X className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="h-11"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button className="h-11" variant="outline" disabled={!text.trim()} onClick={submit} aria-label="Ajouter">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
