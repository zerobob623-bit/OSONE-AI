/**
 * Confere a leitura do link do YouTube — e, principalmente, que ela FALHA quando deve falhar.
 *
 * O defeito relatado foi "os vídeos abrem como indisponível, mesmo o link estando certo". A
 * causa não era o player: era esta função. Quando ela não sabia ler o endereço, devolvia
 * 'XgWUDbYfNe4' — um videoclipe do Homem de Ferro, chumbado como valor padrão. O usuário pedia
 * um vídeo, o OSONE abria OUTRO sem avisar, e como esse outro é clipe de gravadora (que proíbe
 * reprodução fora do YouTube), o que aparecia na tela era "Vídeo indisponível" — com o link
 * certo na mão da pessoa. Uma falha silenciosa escondendo a outra.
 *
 * Dois formatos caíam nessa armadilha e hoje são metade do YouTube: /shorts/ e /live/.
 *
 * A conferência que mais importa aqui é a última: um termo de busca ("despacito") NÃO é um
 * vídeo, e a resposta certa é null — quem chamou decide o que fazer. Voltar a tocar um vídeo
 * qualquer no lugar seria reintroduzir exatamente o defeito.
 *
 * Como rodar:
 *   node scripts/conferir-youtube.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(RAIZ, '.tmp-yt-'));
const saida = path.join(pastaTemp, 'yt.mjs');

// A função mora dentro do App.tsx (componente gigante que não dá para importar num teste).
// Extrair o trecho pelo nome mantém o teste amarrado ao código REAL: se alguém a renomear ou
// apagar, o teste quebra aqui em vez de passar testando uma cópia velha.
const fonte = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf8');
const inicio = fonte.indexOf('const extractYoutubeVideoId');
if (inicio === -1) {
  console.error('FALHOU: extractYoutubeVideoId não existe mais em src/App.tsx.');
  process.exit(1);
}
const fim = fonte.indexOf('\n};', inicio);
fs.writeFileSync(saida.replace('.mjs', '-src.ts'),
  fonte.slice(inicio, fim + 3).replace('const extractYoutubeVideoId', 'export const extractYoutubeVideoId'));

await build({
  entryPoints: [saida.replace('.mjs', '-src.ts')],
  bundle: true, format: 'esm', outfile: saida, logLevel: 'silent'
});
const { extractYoutubeVideoId } = await import('file://' + saida);

const ID = 'kJQP7kiw5Fk';
let ok = 0, falhou = 0;
const conferir = (nome, real, esperado) => {
  if (real === esperado) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} — esperava ${esperado}, veio ${real}`); }
};

console.log('\n=== FORMATOS QUE PRECISAM FUNCIONAR ===');
for (const [rotulo, url] of [
  ['link normal', `https://www.youtube.com/watch?v=${ID}`],
  ['link curto', `https://youtu.be/${ID}`],
  ['link curto com ?si= (o que o botão Compartilhar gera)', `https://youtu.be/${ID}?si=AbCdEfGh`],
  ['SHORTS (virava Homem de Ferro)', `https://www.youtube.com/shorts/${ID}`],
  ['LIVE (virava Homem de Ferro)', `https://www.youtube.com/live/${ID}`],
  ['embed', `https://www.youtube.com/embed/${ID}`],
  ['celular (m.)', `https://m.youtube.com/watch?v=${ID}`],
  ['YouTube Music', `https://music.youtube.com/watch?v=${ID}`],
  ['dentro de playlist, v= depois de list=', `https://www.youtube.com/watch?list=PLabc&v=${ID}`],
  ['com tempo no fim', `https://www.youtube.com/watch?v=${ID}&t=42s`],
  ['ID puro', ID],
  ['com espaços em volta', `  https://youtu.be/${ID}  `]
]) conferir(rotulo, extractYoutubeVideoId(url), ID);

console.log('\n=== O QUE PRECISA FALHAR (em vez de tocar outro vídeo) ===');
for (const [rotulo, entrada] of [
  ['termo de busca', 'despacito'],
  ['frase', 'toca aquela música do Michael Jackson'],
  ['vazio', ''],
  ['indefinido', undefined],
  ['link de outro site', 'https://vimeo.com/123456789'],
  ['palavra de 11 letras minúsculas', 'despacitooo']
]) conferir(rotulo, extractYoutubeVideoId(entrada), null);

console.log('\n=== NENHUMA ENTRADA PODE DEVOLVER O ANTIGO PADRÃO CHUMBADO ===');
const entradasVariadas = ['despacito', '', 'https://vimeo.com/1', 'texto qualquer', undefined,
  `https://www.youtube.com/shorts/${ID}`];
const algumVirouIronMan = entradasVariadas.some(e => extractYoutubeVideoId(e) === 'XgWUDbYfNe4');
conferir("nunca devolve 'XgWUDbYfNe4' silenciosamente", algumVirouIronMan, false);

fs.rmSync(pastaTemp, { recursive: true, force: true });
console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou > 0 ? 1 : 0);
