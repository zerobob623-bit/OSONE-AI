/**
 * Confere COMO um endereço é aberto na tela do agente — a causa da tela preta.
 *
 * O que aconteceu em uso: a tela do agente ficava preta, o relatório dizia "abri" com sucesso, e
 * nenhuma janela aparecia. O agente concluía, corretamente pelo que via, que não tinha aberto, e
 * tentava de novo. As "três abas do YouTube" saíram daí.
 *
 * A causa não era um defeito nosso nem do modelo: quando já existe um navegador rodando, um
 * segundo lançamento não abre outro navegador — ele ENTREGA o endereço ao que já está aberto, que
 * abre uma aba. Como o que estava aberto era o do usuário, na tela DELE, a aba nascia lá. Passar
 * o DISPLAY não muda nada, porque quem desenha é o processo antigo.
 *
 * O que estes casos fixam, para o conserto não se desfazer sem alguém notar:
 *
 *   1. Que o argumento de INSTÂNCIA PRÓPRIA está presente em todo navegador da lista. É a peça
 *      inteira do conserto: sem ele, tudo volta a "abrir" com sucesso e não aparecer nada.
 *   2. Que o perfil é FIXO. Um perfil por abertura trocaria três abas na tela errada por três
 *      janelas na tela certa — melhor, mas ainda errado.
 *   3. Que nome de programa não é tratado como caminho de arquivo, que era a segunda mensagem
 *      confusa do relatório ("gio: file:///home/usuario/google-chrome").
 *
 * Como rodar:
 *   node scripts/conferir-abrir-na-tela-do-agente.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-navegador-'));
const saida = path.join(pastaTemp, 'navegador.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/navegadorDoAgente.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { ehEndereco, normalizarEndereco, pareceNomeDePrograma, NAVEGADORES_DO_AGENTE, NOME_DO_PERFIL } =
  await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ====== 1) O QUE É ENDEREÇO E O QUE NÃO É ======
{
  const enderecos = ['https://studio.youtube.com', 'http://localhost:3000', 'www.google.com', 'HTTPS://X.COM'];
  registrar('endereços de site são reconhecidos como endereço',
    enderecos.every(ehEndereco), enderecos.join(' '));

  const naoEnderecos = ['google-chrome', '/home/usuario/nota.txt', '~/Documentos', 'terminal', 'meu-arquivo.html'];
  registrar('nome de programa e caminho de arquivo NÃO são endereço',
    naoEnderecos.every(a => !ehEndereco(a)), naoEnderecos.join(' '));

  registrar('"www." sem protocolo vira https',
    normalizarEndereco('www.youtube.com') === 'https://www.youtube.com',
    normalizarEndereco('www.youtube.com'));

  registrar('endereço com protocolo passa intacto',
    normalizarEndereco('https://studio.youtube.com') === 'https://studio.youtube.com',
    'nada é reescrito à toa');
}

// ====== 2) A PEÇA DO CONSERTO: INSTÂNCIA PRÓPRIA, EM TODOS ======
// Sem isto, o navegador entrega o endereço ao que já roda na tela do usuário — e a tela do agente
// fica preta enquanto o relatório diz "abri".
{
  const perfil = '/tmp/perfil-de-teste';
  const url = 'https://studio.youtube.com';

  const semIsolamento = NAVEGADORES_DO_AGENTE.filter(n => {
    const args = n.argumentos(perfil, url);
    const texto = args.join(' ');
    // Chrome e derivados: --user-data-dir. Firefox: -no-remote (o -profile sozinho não basta).
    return !(texto.includes(`--user-data-dir=${perfil}`) || (texto.includes('-no-remote') && texto.includes(perfil)));
  });
  registrar('TODO navegador da lista é lançado como instância própria',
    semIsolamento.length === 0,
    semIsolamento.length ? `sem isolamento: ${semIsolamento.map(n => n.bin).join(', ')}` : `${NAVEGADORES_DO_AGENTE.length} navegadores conferidos`);

  const semUrl = NAVEGADORES_DO_AGENTE.filter(n => !n.argumentos(perfil, url).includes(url));
  registrar('o endereço pedido vai para o navegador',
    semUrl.length === 0, semUrl.length ? semUrl.map(n => n.bin).join(', ') : 'todos recebem a URL');

  const firefox = NAVEGADORES_DO_AGENTE.find(n => n.bin === 'firefox');
  registrar('no Firefox, "-no-remote" está presente — o "-profile" sozinho não impediria o recado',
    firefox.argumentos(perfil, url).includes('-no-remote'),
    firefox.argumentos(perfil, url).join(' '));

  const chrome = NAVEGADORES_DO_AGENTE.find(n => n.bin === 'google-chrome');
  registrar('nos derivados do Chrome, a primeira execução não trava numa tela de boas-vindas',
    chrome.argumentos(perfil, url).includes('--no-first-run'),
    'perfil novo abriria o assistente inicial, e o agente ficaria preso nele');
}

// ====== 3) O PERFIL É FIXO ======
// Um perfil por abertura trocaria três abas na tela errada por três janelas na tela certa.
{
  registrar('existe um nome de perfil único e fixo',
    typeof NOME_DO_PERFIL === 'string' && NOME_DO_PERFIL.length > 3 && !/\d{5,}/.test(NOME_DO_PERFIL),
    NOME_DO_PERFIL);

  const a = NAVEGADORES_DO_AGENTE[0].argumentos('/tmp/' + NOME_DO_PERFIL, 'https://a.com');
  const b = NAVEGADORES_DO_AGENTE[0].argumentos('/tmp/' + NOME_DO_PERFIL, 'https://b.com');
  const perfilDe = (args) => args.find(x => x.startsWith('--user-data-dir='));
  registrar('duas aberturas seguidas usam o MESMO perfil',
    perfilDe(a) === perfilDe(b),
    'a segunda vira uma aba no navegador do agente, não uma janela nova');

  registrar('o perfil do agente não se mistura com o do usuário',
    NOME_DO_PERFIL.includes('osone'), `perfil separado: ${NOME_DO_PERFIL}`);
}

// ====== 4) NOME DE PROGRAMA NÃO É CAMINHO DE ARQUIVO ======
// A segunda mensagem confusa do relatório: "gio: file:///home/usuario/google-chrome: arquivo não
// encontrado" — que aponta para o lugar errado e faz parecer que o programa não está instalado.
{
  const programas = ['google-chrome', 'firefox', 'gnome-calculator', 'code'];
  registrar('nome de programa é reconhecido como programa',
    programas.every(pareceNomeDePrograma), programas.join(' '));

  const naoPrograma = ['/home/usuario/nota.txt', '~/Documentos/a b', 'rm -rf /; ls'];
  registrar('caminho e comando com espaço/metacaractere não passam por nome de programa',
    !pareceNomeDePrograma(naoPrograma[0]) && !pareceNomeDePrograma(naoPrograma[1]),
    'só um nome simples vira execução direta');

  registrar('texto com metacaractere de shell é recusado como nome de programa',
    !pareceNomeDePrograma('meu;programa') && !pareceNomeDePrograma('a|b') && !pareceNomeDePrograma('$(x)'),
    'o nome é interpolado num comando, então não pode carregar injeção');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
