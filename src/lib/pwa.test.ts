import { describe, expect, it } from "vitest";
import { chooseExportMethod, detectInstallContext, isIosUserAgent, printNeedsBrowser } from "@/lib/pwa";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

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

describe("chooseExportMethod", () => {
  it("partage sur iOS quand le navigateur sait partager des fichiers", () => {
    expect(chooseExportMethod({ userAgent: IPHONE, canShareFiles: true })).toBe("share");
  });

  it("télécharge partout ailleurs, et sur iOS sans partage de fichiers", () => {
    expect(chooseExportMethod({ userAgent: IPHONE, canShareFiles: false })).toBe("download");
    expect(chooseExportMethod({ userAgent: ANDROID, canShareFiles: true })).toBe("download");
    expect(chooseExportMethod({ userAgent: WINDOWS, canShareFiles: true })).toBe("download");
  });
});

describe("printNeedsBrowser", () => {
  it("seulement en web app iOS installée", () => {
    expect(printNeedsBrowser({ userAgent: IPHONE, standalone: true })).toBe(true);
    expect(printNeedsBrowser({ userAgent: IPHONE, standalone: false })).toBe(false);
    expect(printNeedsBrowser({ userAgent: ANDROID, standalone: true })).toBe(false);
  });
});
