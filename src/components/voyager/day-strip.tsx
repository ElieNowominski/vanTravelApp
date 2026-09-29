import { useEffect, useRef } from "react";
import type { TripDay } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Liste des jours en défilement horizontal. Chaque jour est une cible de 56 × 60 px.
 * Le jour sélectionné est centré au montage et à chaque changement.
 */
export function DayStrip({
  days,
  selected,
  todayIndex,
  onSelect,
}: {
  days: TripDay[];
  selected: number;
  todayIndex: number;
  onSelect: (index: number) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    refs.current[selected]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      role="tablist"
      aria-label="Jours du voyage"
      className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((day, index) => {
        const active = index === selected;
        const isToday = index === todayIndex;
        const dayNumber = day.date.slice(8, 10).replace(/^0/, "");
        return (
          <button
            key={day.date}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`Jour ${index + 1}, ${day.weekday} ${day.label}${isToday ? ", aujourd’hui" : ""}`}
            onClick={() => onSelect(index)}
            className={cn(
              "flex h-15 w-14 shrink-0 flex-col items-center justify-center rounded-xl ring-1 transition-colors",
              active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-foreground/10",
            )}
          >
            <span className={cn("text-[10px] uppercase", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {day.weekday}
            </span>
            <span className="text-lg leading-tight font-semibold">{dayNumber}</span>
            <span className="flex h-2 items-center gap-0.5">
              {isToday && <span className={cn("size-1.5 rounded-full", active ? "bg-primary-foreground" : "bg-primary")} />}
              {day.overnightStopId && !isToday && (
                <span className={cn("size-1 rounded-full", active ? "bg-primary-foreground/60" : "bg-foreground/30")} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
