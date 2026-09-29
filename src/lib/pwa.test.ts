import { describe, expect, it } from "vitest";
import { detectInstallContext, isIosUserAgent } from "@/lib/pwa";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";

describe("detectInstallContext", () => {
  it("reconnaît le mode installé avant tout", () => {
    expect(detectInstallContext({ userAgent: IPHONE, standalone: true, hasPromptEvent: false })).toBe("installed");
    expect(detectInstallContext({ userAgent: ANDROID, standalone: true, hasPromptEvent: true })).toBe("installed");
  });

  it("préfère l'invite native quand le navigateur l'a émise", () => {
    expect(detectInstallContext({ userAgent: ANDROID, standalone: false, hasPromptEvent: true })).toBe("prompt");
  });

  it("guide manuellement sur iOS, sinon rien", () => {
    expect(detectInstallContext({ userAgent: IPHONE, standalone: false, hasPromptEvent: false })).toBe("ios-manual");
    expect(detectInstallContext({ userAgent: ANDROID, standalone: false, hasPromptEvent: false })).toBe("unsupported");
  });

  it("détecte iPhone et iPad", () => {
    expect(isIosUserAgent(IPHONE)).toBe(true);
    expect(isIosUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosUserAgent(ANDROID)).toBe(false);
  });
});
