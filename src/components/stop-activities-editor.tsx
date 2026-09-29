
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StopActivity } from "@/lib/types";

export function StopActivitiesEditor({
  activities,
  onAdd,
  onRemove,
}: {
  activities: StopActivity[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");

  const submit = () => {
    onAdd(text);
    setText("");
  };

  return (
    <div className="mt-1.5 rounded-lg bg-muted/50 px-2 py-1.5">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">Sur le chemin</p>
      {activities.length > 0 && (
        <ul className="mb-1.5 flex flex-col gap-1">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-start gap-1.5 text-xs leading-snug">
              <span className="mt-0.5 text-muted-foreground">•</span>
              <span className="min-w-0 flex-1">{activity.text}</span>
              <button
                type="button"
                className="mt-0.5 shrink-0 opacity-50 hover:opacity-100"
                onClick={() => onRemove(activity.id)}
                title="Retirer l’activité"
                aria-label="Retirer l’activité"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Rando, cascade, pause photo…"
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          size="icon-xs"
          variant="outline"
          title="Ajouter"
          disabled={!text.trim()}
          onClick={submit}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
