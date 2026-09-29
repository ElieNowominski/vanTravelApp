import type { RouteSketch } from "@/lib/route-sketch";

/** Croquis SVG d'un jour : tracé stocké et étapes, sans fond de carte (imprimable, hors ligne). */
export function RouteSketchSvg({ sketch, color = "#0f5a46" }: { sketch: RouteSketch; color?: string }) {
  return (
    <svg
      viewBox={`0 0 ${sketch.width} ${sketch.height}`}
      width={sketch.width}
      height={sketch.height}
      role="img"
      aria-label={`Croquis de la route, environ ${sketch.spanKm} km d’étendue`}
      className="max-w-full rounded-lg bg-muted/40 ring-1 ring-foreground/10 print:bg-white"
    >
      {sketch.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={path.estimated ? "6 5" : undefined}
        />
      ))}
      {sketch.points.map((point) => (
        <g key={`${point.label}-${point.order}`}>
          <circle cx={point.x} cy={point.y} r={point.overnight ? 7 : 5} fill={point.overnight ? color : "#fff"} stroke={color} strokeWidth={2} />
          <text
            x={point.x + 9}
            y={point.y + 4}
            fontSize={11}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="#1f2d28"
            stroke="#fff"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {point.label}
          </text>
        </g>
      ))}
      <text x={sketch.width - 6} y={sketch.height - 6} fontSize={9} textAnchor="end" fill="#6b7280">
        ~{sketch.spanKm} km · sans fond de carte
      </text>
    </svg>
  );
}
