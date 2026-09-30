/**
 * Enveloppe chiffrée pour les codes d'accès qui voyagent dans le dépôt privé.
 * AES-GCM 256 bits, clé dérivée d'une phrase partagée entre les deux téléphones (PBKDF2, SHA-256).
 * WebCrypto seulement : disponible dans les navigateurs et dans Node 20+ (tests).
 *
 * Format : `v1.<sel>.<iv>.<chiffré>` en base64url. Le sel voyage avec l'enveloppe : deux appareils
 * avec la même phrase déchiffrent, un dépôt lu sans la phrase ne montre rien.
 */
const PREFIX = "v1";
const ITERATIONS = 310_000;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto indisponible");
  return c.subtle;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isSecureEnvelope(value: string | undefined | null): value is string {
  return typeof value === "string" && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plain: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plain));
  return [PREFIX, toBase64Url(salt), toBase64Url(iv), toBase64Url(new Uint8Array(cipher))].join(".");
}

/** `null` si la phrase est fausse ou l'enveloppe altérée : jamais d'exception vers l'interface. */
export async function decryptSecret(envelope: string, passphrase: string): Promise<string | null> {
  if (!isSecureEnvelope(envelope)) return null;
  const [, salt, iv, cipher] = envelope.split(".");
  try {
    const key = await deriveKey(passphrase, fromBase64Url(salt));
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) as BufferSource }, key, fromBase64Url(cipher) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
