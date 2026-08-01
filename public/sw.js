// O número no fim do nome precisa mudar sempre que index.html, manifest.json ou os ícones
// mudarem. O 'fetch' abaixo responde pelo cache primeiro, então, sem trocar o nome, quem já
// instalou o PWA continuaria recebendo a versão antiga para sempre — foi o que aconteceria com
// a troca dos ícones, que ficariam invisíveis para todos os usuários que já tinham o app.
const CACHE_NAME = 'osone-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      // Assume o controle sem esperar todas as abas antigas fecharem: sem isto, a versão nova
      // só entraria em vigor quando o usuário fechasse cada aba aberta do app.
      .then(() => self.skipWaiting())
  );
});

// Apaga os caches de versões anteriores. Sem esta limpeza, cada troca de nome deixaria o cache
// antigo ocupando espaço no disco do usuário indefinidamente.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(nome => nome !== CACHE_NAME).map(nome => caches.delete(nome))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
