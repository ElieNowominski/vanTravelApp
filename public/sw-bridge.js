/* global self */
/**
 * Pont de transition entre les deux modes de mise à jour, importé dans le service worker
 * généré par Workbox (`workbox.importScripts` dans vite.config.ts).
 *
 * Avant : mise à jour automatique (la page se rechargeait dès l'activation).
 * Maintenant : mode « prompt », la nouvelle version attend un toucher sur « Mettre à jour ».
 * Problème : une page servie par l'ancienne version ne connaît pas la bannière, et la
 * nouvelle version ne s'active jamais tant que cette page reste ouverte (téléphone jamais fermé).
 *
 * À l'installation, on demande à chaque page ouverte si elle sait afficher l'invite.
 * Aucune réponse : anciennes pages seulement, on prend la main tout de suite et leur code
 * de rechargement automatique fait le reste. Au moins une réponse : on attend l'invite.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Première installation sur cet appareil : rien à ponter.
      if (!self.registration.active) return;
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      if (clients.length === 0) return;
      const answers = await Promise.all(clients.map(askClient));
      if (!answers.some(Boolean)) await self.skipWaiting();
    })().catch(() => {
      /* le pont n'est qu'un confort : jamais bloquer l'installation */
    }),
  );
});

function askClient(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 800);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data === "PROMPT_UPDATE_SUPPORTED");
    };
    try {
      client.postMessage({ type: "VANTRAVEL_UPDATE_CAPABILITIES" }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}
