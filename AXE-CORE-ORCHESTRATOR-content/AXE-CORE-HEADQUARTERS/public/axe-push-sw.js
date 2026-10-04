/*
 * De meldingenkant van de service worker.
 *
 * ## Waarom een los bestand en geen injectManifest
 *
 * De worker wordt gemaakt door workbox (`generateSW` in vite.config.ts) en daar
 * valt geen eigen code in te schrijven -- behalve via `importScripts`, en dat
 * is precies wat hier gebeurt. Overstappen op `injectManifest` zou betekenen
 * dat wij de hele worker gaan schrijven, inclusief de cache-strategie die er al
 * staat. Die worker heeft hier al een geschiedenis: `skipWaiting` en
 * `clientsClaim` ontbraken, en Luka's telefoon toonde daardoor dagen een oude
 * bundel. Dat risico is niet nodig voor twee event-handlers.
 *
 * Dit bestand staat in `public/`, dus het wordt ongewijzigd meegekopieerd en is
 * bereikbaar op /axe-push-sw.js -- waar de gegenereerde sw.js hem importeert.
 *
 * ## Wat de zender stuurt
 *
 * JSON met {titel, body, tag, url}, gemaakt door `domain/pushBericht.ts`. Die
 * vorm staat daar, met een test per geval, zodat deze worker en de Python-zender
 * op de VPS niet ieder hun eigen samenvatting verzinnen.
 */

self.addEventListener('push', (event) => {
  // Geen payload is geen reden om niets te tonen: sommige pushdiensten leveren
  // een lege push af om de verbinding te testen, en een melding zonder tekst is
  // nog altijd beter dan stilte bij een melding die wel bedoeld was.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { titel: 'AXE CORE', body: event.data ? event.data.text() : '' };
  }

  const titel = data.titel || 'AXE CORE';
  const opties = {
    body: data.body || '',
    // Meldingen met dezelfde tag vervangen elkaar in plaats van zich op te
    // stapelen -- zie de uitleg bij tagVan in domain/pushBericht.ts.
    tag: data.tag || 'axe-melding',
    renotify: false,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(titel, opties));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.url) || '/';
  // HashRouter: de routes leven achter een #, zie src/app/main.tsx.
  const doel = new URL(`/#${route}`, self.location.origin).href;

  event.waitUntil((async () => {
    const vensters = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Een openstaand venster focussen en daarheen sturen, in plaats van een
    // tweede kopie van de app openen. Twee vensters van dezelfde app is precies
    // het soort "welke is de echte" dat we elders ook opruimen.
    for (const venster of vensters) {
      if (venster.url.startsWith(self.location.origin)) {
        await venster.focus();
        if ('navigate' in venster) {
          try { await venster.navigate(doel); } catch { /* focus is al genoeg */ }
        }
        return;
      }
    }
    await self.clients.openWindow(doel);
  })());
});
