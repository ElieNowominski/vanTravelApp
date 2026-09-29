import { jsPDF } from "jspdf";
import { assetUrl } from "@/lib/base-url";
import { buildCatalog, findCatalogPlace } from "@/lib/catalog";
import { dayColor } from "@/lib/constants";
import { formatDayDrive, formatDuration, formatKm, isRestDay } from "@/lib/format";
import { overnightCaption, stayById } from "@/lib/trip-plan";
import { normalizeMarks } from "@/lib/trip-marks";
import type { TripConfig, TripMark } from "@/lib/types";
import { dayStats, selectedOption, type TripState } from "@/store/trip-store";

type PdfDoc = jsPDF & { getNumberOfPages: () => number };

export async function exportTripPdf(
  state: Pick<TripState, "days" | "stops" | "legs">,
  options?: { mapImage?: string | null; title?: string | null; marks?: TripMark[]; config?: TripConfig | null },
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true }) as PdfDoc;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const fontReady = await embedFonts(doc);

  const setFont = (style: "normal" | "bold", size: number, color: [number, number, number]) => {
    if (fontReady) doc.setFont("NotoSans", style);
    else doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  let y = 16;

  const ensure = (need: number) => {
    if (y + need > pageH - 16) {
      doc.addPage();
      y = 16;
    }
  };

  const write = (
    text: string,
    size = 10,
    color: [number, number, number] = [32, 32, 32],
    style: "normal" | "bold" = "normal",
    indent = 0,
  ) => {
    const maxW = contentW - indent;
    setFont(style, size, color);
    const lines = doc.splitTextToSize(pdfText(text), maxW) as string[];
    const lineH = size * 0.42 + 1.5;
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, margin + indent, y);
      y += lineH;
    }
  };

  const config = options?.config ?? null;
  const tripTitle = options?.title?.trim() || config?.name || "Roadtrip van";
  doc.setProperties({ title: tripTitle });

  setFont("bold", 18, [15, 90, 70]);
  doc.text(pdfText(tripTitle), margin, y);
  y += 8;
  if (config) {
    const catalog = buildCatalog(config);
    const placeName = (id: string) => findCatalogPlace(catalog, id)?.name ?? id;
    const firstDate = config.arrival?.date ?? config.start.date;
    write(
      `${formatPdfRange(firstDate, config.end.date)}  ·  ${config.vehicle.name}  ·  ${placeName(config.start.placeId)} -> ${placeName(config.end.placeId)}`,
      10,
      [90, 90, 90],
    );
    const v = config.vehicle;
    const dims =
      typeof v.lengthM === "number" && typeof v.widthM === "number"
        ? `${v.lengthM} m × ${v.widthM} m${typeof v.heightM === "number" ? `, ~${v.heightM} m` : ""}. `
        : "";
    write(
      `Van ${v.selfContained ? "self-contained " : ""}${dims}Temps van × ${v.timeFactor} (rythme, ponts à une voie, pauses).`,
      8,
      [110, 110, 110],
    );
  }
  y += 3;

  const mapH = 118;
  ensure(mapH + 28);
  if (options?.mapImage) {
    drawMapScreenshot(doc, options.mapImage, { x: margin, y, w: contentW, h: mapH });
  } else {
    drawTripMap(doc, state, { x: margin, y, w: contentW, h: mapH });
  }
  y += mapH + 4;
  y = drawLegend(doc, state, margin, y, contentW, setFont);
  y += 4;

  const arrivalStay = config?.arrival ? stayById(config, config.arrival.placeId) : null;
  if (arrivalStay && config?.arrival) {
    ensure(18);
    setFont("bold", 12, [20, 70, 60]);
    doc.text(pdfText(`Arrivée  ·  ${formatPdfDay(config.arrival.date)}`), margin, y);
    y += 6;
    write(overnightCaption(arrivalStay), 9, [150, 90, 30], "normal", 5);
    write(config.arrival.label || "Nuit avant récupération du van.", 8, [110, 110, 110], "normal", 5);
    y += 3;
  }

  let totalKm = 0;
  let totalSec = 0;

  state.days.forEach((day, index) => {
    const stats = dayStats(state, index);
    totalKm += stats.km;
    totalSec += stats.driveSec;
    if (day.stopIds.length === 0) return;

    const color = hexRgb(dayColor(index));
    const rest = isRestDay(stats.km, stats.driveSec);
    ensure(24);
    doc.setFillColor(...color);
    doc.roundedRect(margin, y - 3.2, 2.2, 5.2, 0.4, 0.4, "F");
    setFont("bold", 12, [20, 70, 60]);
    doc.text(pdfText(`Jour ${index + 1}  ·  ${day.weekday} ${day.label}`), margin + 5, y);
    setFont("normal", 9, [100, 100, 100]);
    doc.text(pdfText(formatDayDrive(stats.km, stats.driveSec)), pageW - margin, y, { align: "right" });
    y += 6;
    write(`Nuit : ${overnightCaption(stats.overnight)}`, 9, [150, 90, 30], "normal", 5);
    if (rest) {
      write("Journée sur place — même camping, pas de route.", 8, [110, 110, 110], "normal", 5);
    }

    day.stopIds.forEach((stopId, stopIndex) => {
      const stop = state.stops[stopId];
      if (!stop) return;
      const inbound =
        stopIndex === 0
          ? state.legs.find((l) => l.toStopId === stopId && l.dayIndex === index)
          : state.legs.find(
              (l) => l.fromStopId === day.stopIds[stopIndex - 1] && l.toStopId === stopId,
            );
      const opt = inbound ? selectedOption(inbound) : null;
      if (opt) {
        const fromStop = inbound ? state.stops[inbound.fromStopId] : null;
        const fromName = fromStop?.name ?? "Départ";
        const winding = opt.winding ? " · route lente" : "";
        const est = inbound?.estimated ? " · estimé" : "";
        write(`${fromName}  →  ${stop.name}`, 8, [70, 90, 80], "bold", 5);
        write(
          `${formatKm(opt.distanceKm)}  ·  ${formatDuration(opt.durationVanSec)} van (voiture ${formatDuration(opt.durationCarSec)})${winding}${est}`,
          8,
          [110, 110, 110],
          "normal",
          7,
        );
      }
      const marker = stop.isOvernight ? "N" : String(stopIndex + 1);
      ensure(6);
      doc.setFillColor(...color);
      doc.circle(margin + 3.5, y - 1.2, 2.2, "F");
      setFont("bold", 7, [255, 255, 255]);
      doc.text(marker, margin + 3.5, y - 0.1, { align: "center" });
      setFont(stop.isOvernight ? "bold" : "normal", 10, [32, 32, 32]);
      doc.text(pdfText(stop.name), margin + 8, y);
      y += 4.5;
      if (stop.area) write(stop.area, 8, [90, 90, 90], "normal", 8);
      const amenity = typeof stop.meta?.amenities === "string" ? stop.meta.amenities : "";
      const note = stop.notes ? clip(stop.notes, 140) : "";
      const extra = [amenity, note].filter(Boolean).join(" — ");
      if (extra) write(extra, 8, [110, 110, 110], "normal", 8);
      if (stop.warning) write(clip(stop.warning, 160), 8, [160, 50, 30], "normal", 8);
      const activities = stop.activities ?? [];
      if (activities.length > 0) {
        write("Sur le chemin", 8, [70, 90, 80], "bold", 8);
        for (const activity of activities) {
          write(`• ${clip(activity.text, 160)}`, 8, [70, 90, 80], "normal", 8);
        }
      }
    });
    y += 4;
  });

  const marks = normalizeMarks(options?.marks);
  if (marks.length > 0) {
    ensure(16);
    write("Plus et moins", 12, [20, 70, 60], "bold");
    for (const mark of marks.filter((item) => item.kind === "plus")) {
      write(`+  ${clip(mark.text, 180)}`, 9, [15, 110, 70]);
    }
    for (const mark of marks.filter((item) => item.kind === "minus")) {
      write(`-  ${clip(mark.text, 180)}`, 9, [160, 50, 50]);
    }
    y += 3;
  }

  ensure(14);
  write(
    `Total : ${formatKm(totalKm)}  ·  ${formatDuration(totalSec)} de conduite van.`,
    11,
    [15, 90, 70],
    "bold",
  );
  write(
    "Les temps sont volontairement plus élevés que Google Maps. Vérifier météo, fermetures DOC et contrat du loueur avant de partir.",
    8,
    [120, 120, 120],
  );
  write("Carte : fond OpenStreetMap, calques masqués. © OpenStreetMap.", 7, [140, 120, 120]);

  doc.save(pdfFilename(options?.title));
}

function pdfFilename(title?: string | null): string {
  const slug = (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${slug}.pdf` : "roadtrip-van.pdf";
}

async function embedFonts(doc: jsPDF): Promise<boolean> {
  try {
    const [regular, bold] = await Promise.all([
      loadFontB64(assetUrl("fonts/NotoSans-Regular.ttf")),
      loadFontB64(assetUrl("fonts/NotoSans-Bold.ttf")),
    ]);
    doc.addFileToVFS("NotoSans-Regular.ttf", regular);
    doc.addFileToVFS("NotoSans-Bold.ttf", bold);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    return true;
  } catch {
    return false;
  }
}

async function loadFontB64(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function drawMapScreenshot(
  doc: jsPDF,
  dataUrl: string,
  rect: { x: number; y: number; w: number; h: number },
) {
  doc.setFillColor(215, 228, 216);
  doc.roundedRect(rect.x, rect.y, rect.w, rect.h, 2, 2, "F");
  const props = doc.getImageProperties(dataUrl);
  const aspect = props.width / Math.max(props.height, 1);
  let w = rect.w;
  let h = w / aspect;
  if (h > rect.h) {
    h = rect.h;
    w = h * aspect;
  }
  const x = rect.x + (rect.w - w) / 2;
  const y = rect.y + (rect.h - h) / 2;
  doc.addImage(dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
  doc.setDrawColor(190, 205, 192);
  doc.setLineWidth(0.3);
  doc.roundedRect(rect.x, rect.y, rect.w, rect.h, 2, 2, "S");
}

function drawTripMap(
  doc: jsPDF,
  state: Pick<TripState, "days" | "stops" | "legs">,
  rect: { x: number; y: number; w: number; h: number },
) {
  doc.setFillColor(215, 228, 216);
  doc.roundedRect(rect.x, rect.y, rect.w, rect.h, 2, 2, "F");
  doc.setDrawColor(190, 205, 192);
  doc.setLineWidth(0.3);
  doc.roundedRect(rect.x, rect.y, rect.w, rect.h, 2, 2, "S");

  const points: Array<[number, number]> = [];
  for (const stop of Object.values(state.stops)) {
    points.push([stop.lng, stop.lat]);
  }
  for (const leg of state.legs) {
    const opt = selectedOption(leg);
    if (!opt) continue;
    for (const coord of downsample(opt.geometry.coordinates, 180)) {
      points.push([coord[0], coord[1]]);
    }
  }
  if (points.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text("Ajoute des étapes pour voir le circuit.", rect.x + rect.w / 2, rect.y + rect.h / 2, {
      align: "center",
    });
    return;
  }

  const project = makeProjector(points, rect, 10);

  for (const index of state.days.keys()) {
    const color = hexRgb(dayColor(index));
    const dayLegs = state.legs.filter((l) => l.dayIndex === index);
    doc.setDrawColor(...color);
    doc.setLineWidth(1.15);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    for (const leg of dayLegs) {
      const opt = selectedOption(leg);
      if (!opt) continue;
      const line = downsample(opt.geometry.coordinates, 220).map(([lng, lat]) => project(lng, lat));
      if (line.length < 2) continue;
      for (let i = 1; i < line.length; i++) {
        doc.line(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
      }
    }
  }

  state.days.forEach((day, index) => {
    const color = hexRgb(dayColor(index));
    day.stopIds.forEach((stopId, stopIndex) => {
      const stop = state.stops[stopId];
      if (!stop) return;
      const [x, yy] = project(stop.lng, stop.lat);
      const overnight = stop.isOvernight || stopId === day.overnightStopId;
      const r = overnight ? 2.1 : 1.5;
      doc.setFillColor(255, 255, 255);
      doc.circle(x, yy, r + 0.5, "F");
      doc.setFillColor(...color);
      doc.circle(x, yy, r, "F");
      if (overnight && stop.name) {
        doc.setFontSize(6.5);
        doc.setTextColor(40, 50, 45);
        const label = pdfText(clip(stop.name, 28));
        doc.text(label, x + 2.6, yy + 0.8);
      } else if (stopIndex === 0 && index === 0) {
        doc.setFontSize(6.5);
        doc.setTextColor(40, 50, 45);
        doc.text(pdfText(clip(stop.name, 28)), x + 2.6, yy + 0.8);
      }
    });
  });
}

function drawLegend(
  doc: jsPDF,
  state: Pick<TripState, "days" | "stops" | "legs">,
  x: number,
  y: number,
  width: number,
  setFont: (style: "normal" | "bold", size: number, color: [number, number, number]) => void,
): number {
  const used = state.days
    .map((day, index) => ({ day, index, stats: dayStats(state, index) }))
    .filter((row) => row.day.stopIds.length > 0);
  if (used.length === 0) return y;
  const colW = width / 2;
  let rowY = y;
  used.forEach((row, i) => {
    const col = i % 2;
    const colX = x + col * colW;
    if (col === 0 && i > 0) rowY += 5;
    const color = hexRgb(dayColor(row.index));
    doc.setFillColor(...color);
    doc.roundedRect(colX, rowY - 2.2, 4, 3.2, 0.4, 0.4, "F");
    setFont("normal", 8, [70, 70, 70]);
    doc.text(
      pdfText(`J${row.index + 1} ${row.day.weekday}  ·  ${formatDayDrive(row.stats.km, row.stats.driveSec)}`),
      colX + 6,
      rowY,
    );
  });
  return rowY + 4;
}

function makeProjector(
  points: Array<[number, number]>,
  rect: { x: number; y: number; w: number; h: number },
  pad: number,
) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const lngPad = Math.max((maxLng - minLng) * 0.1, 0.25);
  const latPad = Math.max((maxLat - minLat) * 0.1, 0.18);
  minLng -= lngPad;
  maxLng += lngPad;
  minLat -= latPad;
  maxLat += latPad;
  const inner = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2 };
  const dataW = Math.max(maxLng - minLng, 0.01);
  const dataH = Math.max(maxLat - minLat, 0.01);
  const scale = Math.min(inner.w / dataW, inner.h / dataH);
  const ox = inner.x + (inner.w - dataW * scale) / 2;
  const oy = inner.y + (inner.h - dataH * scale) / 2;
  return (lng: number, lat: number): [number, number] => [
    ox + (lng - minLng) * scale,
    oy + (maxLat - lat) * scale,
  ];
}

function downsample(coords: number[][], maxPoints: number): number[][] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function pdfText(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[·•]/g, " | ")
    .replace(/…/g, "...")
    .replace(/×/g, "x");
}

function clip(text: string, max: number): string {
  const compact = pdfText(text).replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}...`;
}

function formatPdfDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatPdfRange(startIso: string, endIso: string): string {
  const start = new Date(`${startIso}T12:00:00Z`);
  const end = new Date(`${endIso}T12:00:00Z`);
  const startDay = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${startDay} – ${endLabel}`;
}
