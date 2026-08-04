/**
 * O CACHE NUNCA RESPONDE PELA PÁGINA ANTES DA REDE.
 *
 * Esta regra é a diferença entre o app abrir e o app ficar branco depois de uma publicação nova.
 *
 * Antes, o 'fetch' respondia pelo cache primeiro para QUALQUER pedido, inclusive o do index.html.
 * O index.html é o único arquivo cujo nome não muda, mas o conteúdo dele muda a cada publicação:
 * é ele que aponta para o pacote de código, e o pacote leva um resumo no nome
 * (/assets/index-DngDnqid.js) que é diferente a cada versão. Entregando o index.html antigo, o
 * navegador ia buscar um pacote que já não existia no servidor — e o resultado era uma tela
 * branca em toda atualização, sempre, porque o cache continuava entregando o mesmo HTML velho.
 *
 * Trocar o nome do cache a cada publicação "resolveria" no papel e falhava na prática: dependia
 * de alguém lembrar de editar este arquivo em toda subida, e esquecer uma vez já deixava todo
 * mundo com a tela branca. Aqui a correção é estrutural — a página vem da rede quando há rede, e
 * o cache existe para quando não há.
 *
 * A divisão é por tipo de pedido, e cada uma tem um motivo:
 *
 * - PÁGINA (navegação): rede primeiro, cache só como reserva. Publicação nova aparece na hora.
 * - /assets/: cache primeiro, porque o resumo no nome JÁ é a versão. Arquivo com aquele nome
 *   nunca muda de conteúdo, então servir do cache é sempre correto e é o que deixa o app rápido.
 * - /api/ e qualquer outro endereço: rede, com o cache só como reserva. Resposta de API guardada
 *   e servida como se fosse nova mostraria dado velho, que é pior do que não ter cache nenhum.
 */
const CACHE_NAME = 'osone-cache-v3';

/** O mínimo para o app abrir sem internet. O resto entra sozinho conforme for sendo usado. */
const RESERVA_OFFLINE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Um item que falhe (rede instável na hora da instalação) derrubaria o addAll inteiro e
      // deixaria o service worker sem instalar; guardando um por um, o que der certo fica.
      .then(cache => Promise.all(RESERVA_OFFLINE.map(url => cache.add(url).catch(() => {}))))
      // Assume o controle sem esperar as abas antigas fecharem: é o que faz esta correção chegar
      // a quem já está com a tela branca, sem precisar fechar tudo.
      .then(() => self.skipWaiting())
  );
});

// Apaga os caches de versões anteriores — inclusive o v2, que é o que guarda o index.html velho
// de quem está com a tela branca agora. É por aqui que o conserto se aplica sozinho.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(nome => nome !== CACHE_NAME).map(nome => caches.delete(nome))
      ))
      .then(() => self.clients.claim())
  );
});

/** Guarda uma cópia, mas só do que veio inteiro e de verdade — erro em cache vira erro eterno. */
function guardarCopia(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const copia = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copia)).catch(() => {});
}

/** Rede primeiro; o cache entra quando a rede não responde. */
async function redePrimeiro(request, reserva) {
  try {
    const resposta = await fetch(request);
    guardarCopia(request, resposta);
    return resposta;
  } catch (erro) {
    const doCache = await caches.match(request);
    if (doCache) return doCache;
    if (reserva) {
      const paginaDeReserva = await caches.match(reserva);
      if (paginaDeReserva) return paginaDeReserva;
    }
    throw erro;
  }
}

/** Cache primeiro; só vale para endereço cujo nome já carrega a versão. */
async function cachePrimeiro(request) {
  const doCache = await caches.match(request);
  if (doCache) return doCache;
  const resposta = await fetch(request);
  guardarCopia(request, resposta);
  return resposta;
}

self.addEventListener('fetch', event => {
  const { request } = event;

  // Envio de dados nunca passa por cache, e endereço de outro domínio (APIs do Gemini, da
  // ElevenLabs) não é problema deste service worker — interceptar só atrapalharia.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // A resposta da API é sempre a da rede: cache aqui mostraria dado velho como se fosse novo.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(redePrimeiro(request, '/index.html'));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cachePrimeiro(request));
    return;
  }

  event.respondWith(redePrimeiro(request, null));
});
