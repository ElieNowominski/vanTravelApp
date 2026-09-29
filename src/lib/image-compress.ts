import type { DocumentKind } from "@/lib/types";

/** Cible de poids d'un document : une photo de confirmation reste lisible bien en dessous. */
export const DOC_TARGET_BYTES = 300 * 1024;
/** Un PDF ne se recompresse pas côté client : on l'accepte jusqu'à cette taille. */
export const PDF_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 1600;

export function documentKind(mimeType: string): DocumentKind | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

/** Dimensions réduites pour tenir dans `maxSide`, ratio conservé, jamais agrandies. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/**
 * Plan de compression : on baisse la qualité JPEG par paliers, puis on réduit la taille
 * quand la qualité plancher ne suffit pas. Renvoie `null` quand il n'y a plus rien à tenter.
 */
export function nextAttempt(
  current: { quality: number; maxSide: number },
  size: number,
  target: number,
): { quality: number; maxSide: number } | null {
  if (size <= target) return null;
  if (current.quality > 0.5) {
    return { quality: Math.max(0.5, Math.round((current.quality - 0.15) * 100) / 100), maxSide: current.maxSide };
  }
  if (current.maxSide > 800) return { quality: 0.7, maxSide: Math.round(current.maxSide * 0.75) };
  return null;
}

export function extensionFor(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Compresse une image dans le navigateur (canvas → JPEG) jusqu'à viser ~300 Ko.
 * Les PDF passent tels quels. Lève une erreur lisible si le fichier n'est pas pris en charge.
 */
export async function prepareDocument(file: Blob & { name?: string; type: string }): Promise<{ blob: Blob; kind: DocumentKind }> {
  const kind = documentKind(file.type);
  if (!kind) throw new Error("Format non pris en charge : photo (JPEG, PNG, HEIC converti) ou PDF.");
  if (kind === "pdf") {
    if (file.size > PDF_MAX_BYTES) throw new Error("PDF trop lourd (2 Mo max). Exporte-le en plus léger ou photographie la page.");
    return { blob: file, kind };
  }
  if (file.size <= DOC_TARGET_BYTES && file.type === "image/jpeg") return { blob: file, kind };

  const bitmap = await decodeImage(file);
  try {
    let attempt: { quality: number; maxSide: number } | null = { quality: 0.85, maxSide: IMAGE_MAX_SIDE };
    let best: Blob | null = null;
    while (attempt) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, attempt.maxSide);
      const blob = await drawToJpeg(bitmap, width, height, attempt.quality);
      if (!best || blob.size < best.size) best = blob;
      attempt = nextAttempt(attempt, blob.size, DOC_TARGET_BYTES);
    }
    if (!best) throw new Error("Compression impossible.");
    return { blob: best, kind };
  } finally {
    bitmap.close?.();
  }
}

async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Image illisible sur ce navigateur (HEIC ? Choisis « Le plus compatible » dans l’appareil photo).");
  }
}

function drawToJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas indisponible."));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encodage JPEG impossible."))), "image/jpeg", quality);
  });
}
