
import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TripMark, TripMarkKind } from "@/lib/types";

export function TripMarksEditor({
  marks,
  onAdd,
  onRemove,
}: {
  marks: TripMark[];
  onAdd: (kind: TripMarkKind, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const plus = marks.filter((mark) => mark.kind === "plus");
  const minus = marks.filter((mark) => mark.kind === "minus");

  const submit = (kind: TripMarkKind) => {
    onAdd(kind, text);
    setText("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Un plus ou un moins…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit("plus");
            }
          }}
        />
        <Button
          size="icon-sm"
          variant="outline"
          title="Ajouter un plus"
          disabled={!text.trim()}
          onClick={() => submit("plus")}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          title="Ajouter un moins"
          disabled={!text.trim()}
          onClick={() => submit("minus")}
        >
          <Minus className="size-3.5" />
        </Button>
      </div>
      {plus.length === 0 && minus.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Ex. + Milford au calme · − trop de conduite J5
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {plus.map((mark) => (
            <MarkRow key={mark.id} mark={mark} onRemove={onRemove} />
          ))}
          {minus.map((mark) => (
            <MarkRow key={mark.id} mark={mark} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MarkRow({
  mark,
  onRemove,
}: {
  mark: TripMark;
  onRemove: (id: string) => void;
}) {
  const positive = mark.kind === "plus";
  return (
    <li
      className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-xs ${
        positive ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
      }`}
    >
      <span className="mt-0.5 font-semibold">{positive ? "+" : "−"}</span>
      <span className="min-w-0 flex-1 leading-snug">{mark.text}</span>
      <button
        type="button"
        className="mt-0.5 shrink-0 opacity-50 hover:opacity-100"
        onClick={() => onRemove(mark.id)}
        title="Retirer"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}
