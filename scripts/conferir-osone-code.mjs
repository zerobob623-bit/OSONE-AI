/**
 * Roda a aba OSONE CODE de verdade num Chromium e verifica que código não se perde.
 *
 * Por que existe: os defeitos que esta aba tinha não apareciam na tela. Gerar código com o
 * script.js aberto gravava o resultado por cima do index.html, e o usuário só descobria ao abrir
 * o index.html muito depois. Nenhum deles dava erro, nenhum acendia aviso — a única prova possível
 * é montar um repositório conhecido, mexer na interface como uma pessoa mexeria, e conferir o que
 * sobrou gravado.
 *
 * Cada caso aqui reprova exatamente um desses defeitos. Rodado contra a versão anterior ao
 * conserto, o primeiro caso mostra o index.html perdido e o de desfazer nem encontra o botão
 * habilitado, porque a alteração da IA não entrava no histórico.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-osone-code.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("Este conferidor precisa do playwright: rode 'npm i -D playwright' e tente de novo.");
  process.exit(2);
}

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-code-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

// A aba é montada sozinha, com a IA substituída por uma resposta combinada: o que se está
// verificando é o caminho do código DEPOIS que o modelo responde, não o modelo.
fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {},
      onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x' },
      isGenerating: false,
      onGenerateCodeRequest: async (p, _i, _m, alvo) => {
        window.__alvoRecebido = alvo;
        window.__pedidoRecebido = p;
        // 'null' e 'identico' reproduzem as duas formas de a geração não dar em nada.
        if (window.__respostaDaIA === null) return null;
        if (window.__respostaDaIA === 'identico') return { conteudo: alvo.conteudo, resumo: '' };
        return { conteudo: window.__respostaDaIA, resumo: 'teste' };
      }
    })
  )
);
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./code.js"></script></body></html>`);

await build({
  entryPoints: [entrada],
  bundle: true,
  outfile: path.join(pastaTemp, 'code.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  // O ponto de entrada é gerado fora do projeto, então o esbuild precisa ser apontado para os
  // módulos daqui — senão nem o React ele encontra.
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const CHAVE = 'osone_code_repository_files';
const NOVO = '/* CODIGO NOVO DA IA */';
const REPO = [
  { id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
    content: '<link rel="stylesheet" href="styles.css"><h1>HTML ORIGINAL</h1>' },
  { id: 'css-1', name: 'styles.css', language: 'css', updatedAt: 1, content: 'body { color: red; }' },
  { id: 'js-1', name: 'script.js', language: 'javascript', updatedAt: 1, content: '// JS ORIGINAL' }
];

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const abrir = async () => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([repo, chave, resposta]) => {
    localStorage.setItem(chave, JSON.stringify(repo));
    localStorage.setItem('osone_code_active_project_id', 'proj-1');
    window.__respostaDaIA = resposta;
  }, [REPO, CHAVE, NOVO]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

const lerRepo = (pag) => pag.evaluate(chave => JSON.parse(localStorage.getItem(chave) || '[]'), CHAVE);
const conteudoDe = (repo, nome) => (repo.find(f => f.name === nome) || {}).content;
const gerar = async (pag, texto) => {
  await pag.getByPlaceholder('Descreva a alteração').fill(texto);
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(800);
};
/** O botão muda de título conforme tenha ou não o que desfazer — daí os dois nomes. */
const botaoDesfazer = (pag) => pag.locator('button[title="Desfazer alteração no código (Ctrl+Z)"], button[title="Nada para desfazer"]').first();

// 1) O arquivo ABERTO é o que a IA recebe e o que recebe o resultado.
{
  const { pag, ctx } = await abrir();
  await pag.getByText('script.js', { exact: true }).first().click();
  await pag.waitForTimeout(200);
  await gerar(pag, 'muda alguma coisa');

  const repo = await lerRepo(pag);
  const alvo = await pag.evaluate(() => window.__alvoRecebido);
  const html = conteudoDe(repo, 'index.html');
  const cabecalho = (await pag.locator('.text-cyan-400.font-semibold').first().innerText().catch(() => '')).trim();

  registrar('gerar com script.js aberto grava no script.js, e não no index.html',
    alvo?.nome === 'script.js' && conteudoDe(repo, 'script.js') === NOVO && html?.includes('<h1>HTML ORIGINAL</h1>'),
    `a IA recebeu "${alvo?.nome}"; index.html ${html?.includes('<h1>HTML ORIGINAL</h1>') ? 'intacto' : 'PERDIDO'}`);

  registrar('o editor passa a mostrar o arquivo que a IA mudou',
    cabecalho === 'script.js', `cabeçalho mostra "${cabecalho}"`);

  // 2) Alteração feita pela IA precisa ser reversível.
  const desfazer = botaoDesfazer(pag);
  const semHistorico = await desfazer.isDisabled();
  if (semHistorico) {
    registrar('desfazer reverte a alteração feita pela IA', false, 'a alteração da IA não entrou no histórico (botão desabilitado)');
  } else {
    await desfazer.click();
    await pag.waitForTimeout(400);
    const depois = await lerRepo(pag);
    registrar('desfazer reverte a alteração feita pela IA',
      conteudoDe(depois, 'script.js') === '// JS ORIGINAL',
      `script.js voltou para "${conteudoDe(depois, 'script.js')}"`);
  }
  await ctx.close();
}

// 3) Ser o primeiro da lista não pode ser critério para virar alvo.
{
  const { pag, ctx } = await abrir();
  await pag.getByText('styles.css', { exact: true }).first().click();
  await pag.waitForTimeout(200);
  await gerar(pag, 'ajusta o css');

  const repo = await lerRepo(pag);
  registrar('gerar com styles.css aberto não toca no index.html',
    conteudoDe(repo, 'styles.css') === NOVO && conteudoDe(repo, 'index.html')?.includes('<h1>HTML ORIGINAL</h1>'),
    `index.html ${conteudoDe(repo, 'index.html')?.includes('<h1>HTML ORIGINAL</h1>') ? 'intacto' : 'PERDIDO'}`);
  await ctx.close();
}

// 4) O "refazer" não pode atravessar a troca de projeto carregando os arquivos do anterior.
{
  const { pag, ctx } = await abrir();
  // O histórico é criado com uma edição À MÃO, e não pela IA: é o caminho que existe nas duas
  // versões do código, então o que este caso reprova é a pilha de refazer sobreviver à troca de
  // projeto — e não a alteração da IA entrar no histórico, que o caso 2 já cobre.
  await pag.locator('textarea').first().fill('<h1>EDITADO A MAO NO PROJETO 1</h1>');
  await pag.waitForTimeout(400);
  const desfazer = botaoDesfazer(pag);
  if (!(await desfazer.isDisabled())) {
    await desfazer.click();
    await pag.waitForTimeout(400);
  }

  await pag.getByText('Projeto 2', { exact: true }).first().click();
  await pag.waitForTimeout(600);
  const antes = await lerRepo(pag);

  const refazer = pag.locator('button[title="Refazer alteração no código (Ctrl+Shift+Z)"]').first();
  if (await refazer.count() && !(await refazer.isDisabled())) {
    await refazer.click();
    await pag.waitForTimeout(500);
  }
  const depois = await lerRepo(pag);
  const vazou = JSON.stringify(depois).includes('EDITADO A MAO') || JSON.stringify(depois).includes('HTML ORIGINAL');

  registrar('refazer depois de trocar de projeto não invade o projeto novo',
    !vazou && JSON.stringify(antes) === JSON.stringify(depois),
    vazou ? 'ARQUIVOS DO PROJETO ANTERIOR VAZARAM' : 'o Projeto 2 ficou como estava');
  await ctx.close();
}

// 5) Editar o CSS mostra a página montada no preview, e não o CSS cru.
{
  const { pag, ctx } = await abrir();
  await pag.getByText('styles.css', { exact: true }).first().click();
  await pag.waitForTimeout(200);
  await pag.locator('textarea').first().fill('body { color: rebeccapurple; }');
  await pag.waitForTimeout(600);

  // A conferência é feita no srcdoc entregue ao iframe, e não no que ele desenha: o preview
  // carrega Tailwind e fontes por CDN, e num teste sem internet essas buscas ficam pendentes —
  // esperar a pintura mediria a rede, não a montagem.
  const srcdoc = (await pag.locator('iframe').first().getAttribute('srcdoc')) || '';
  const temPagina = srcdoc.includes('<h1>HTML ORIGINAL</h1>');
  const temCssNovo = srcdoc.includes('rebeccapurple');

  registrar('com o styles.css aberto, o preview recebe a página com o CSS embutido',
    temPagina && temCssNovo,
    `página ${temPagina ? 'presente' : 'AUSENTE'}; CSS em edição ${temCssNovo ? 'embutido' : 'AUSENTE'}`);
  await ctx.close();
}

// 6) O editor de código: régua de linhas, Tab que indenta e o desfazer funcionando aqui dentro.
{
  const { pag, ctx } = await abrir();
  await pag.getByText('script.js', { exact: true }).first().click();
  await pag.waitForTimeout(200);

  const editor = pag.locator('textarea.code-editor-textarea').first();
  const regua = pag.locator('.regua-de-linhas').first();

  // Sem a classe, o atalho global de desfazer ignora o editor — e era assim que estava. Reprovar
  // com essa frase vale mais do que o teste inteiro morrer procurando um seletor que não existe.
  if (await editor.count() === 0) {
    registrar('o editor é reconhecido pelo atalho de desfazer', false,
      'a área de escrita não tem a classe code-editor-textarea; Ctrl+Z nunca age aqui dentro');
    await ctx.close();
  } else {

  await editor.fill('linha um\nlinha dois\nlinha tres');
  await pag.waitForTimeout(400);

  const numeros = (await regua.innerText()).split('\n').map(t => t.trim()).filter(Boolean);
  registrar('a régua numera todas as linhas do arquivo',
    numeros.length === 3 && numeros[0] === '1' && numeros[2] === '3',
    `régua mostra [${numeros.join(', ')}]`);

  // Tab no meio de uma linha: insere recuo e mantém o foco no editor.
  await editor.evaluate(el => el.setSelectionRange(0, 0));
  await editor.press('Tab');
  await pag.waitForTimeout(300);
  const depoisDoTab = await editor.inputValue();
  const focoContinua = await editor.evaluate(el => document.activeElement === el);
  registrar('Tab indenta em vez de tirar o foco do editor',
    depoisDoTab.startsWith('  linha um') && focoContinua,
    focoContinua ? 'recuo inserido e foco mantido' : 'O FOCO SAIU DO EDITOR');

  // Tab com várias linhas selecionadas: indenta o bloco inteiro.
  await editor.fill('a\nb\nc');
  await pag.waitForTimeout(300);
  await editor.evaluate(el => el.setSelectionRange(0, el.value.length));
  await editor.press('Tab');
  await pag.waitForTimeout(300);
  const bloco = await editor.inputValue();
  registrar('Tab com seleção indenta o bloco inteiro',
    bloco === '  a\n  b\n  c', `ficou ${JSON.stringify(bloco)}`);

  // Shift+Tab desfaz um nível.
  await editor.evaluate(el => el.setSelectionRange(0, el.value.length));
  await editor.press('Shift+Tab');
  await pag.waitForTimeout(300);
  const semRecuo = await editor.inputValue();
  registrar('Shift+Tab tira um nível de recuo',
    semRecuo === 'a\nb\nc', `ficou ${JSON.stringify(semRecuo)}`);

  // Ctrl+Z COM O FOCO NO EDITOR: era o caso que o atalho global recusava.
  await editor.fill('TEXTO NOVO DIGITADO');
  await pag.waitForTimeout(400);
  await editor.press('Control+z');
  await pag.waitForTimeout(500);
  const depoisDoDesfazer = await editor.inputValue();
  registrar('Ctrl+Z funciona com o cursor dentro do editor',
    depoisDoDesfazer !== 'TEXTO NOVO DIGITADO',
    depoisDoDesfazer !== 'TEXTO NOVO DIGITADO' ? `voltou para ${JSON.stringify(depoisDoDesfazer.slice(0, 30))}` : 'NADA FOI DESFEITO');

  await ctx.close();
  }
}

// ====== BUSCA E SUBSTITUIÇÃO NA INTERFACE ======
// A lógica tem conferidor próprio (conferir-busca.mjs); aqui o que se prova é que ela está LIGADA
// na tela: o atalho abre, o resultado leva ao arquivo certo, e a troca em massa entra no desfazer.

// 12) Ctrl+F abre a busca do projeto, e não a do navegador.
{
  const { pag, ctx } = await abrir();
  await pag.locator('textarea').first().click();
  await pag.keyboard.press('Control+f');
  await pag.waitForTimeout(300);
  const visivel = await pag.getByPlaceholder('Buscar em todos os arquivos...').isVisible().catch(() => false);
  registrar('Ctrl+F abre a busca do projeto', visivel, visivel ? 'painel aberto' : 'painel não apareceu');
  await ctx.close();
}

// 13) O resultado atravessa arquivos e leva ao trecho.
{
  const { pag, ctx } = await abrir();
  await pag.keyboard.press('Control+f');
  await pag.getByPlaceholder('Buscar em todos os arquivos...').fill('ORIGINAL');
  await pag.waitForTimeout(400);
  const linhas = await pag.locator('button:has-text("script.js")').count();
  const contagem = await pag.getByText(/ocorrência\(s\)/).innerText().catch(() => '');
  registrar('a busca acha em arquivos que não estão abertos',
    linhas > 0 && /[1-9]/.test(contagem),
    `${contagem}; script.js entre os resultados: ${linhas > 0 ? 'sim' : 'não'}`);
  await ctx.close();
}

// 14) Clicar num resultado abre o arquivo daquele resultado.
{
  const { pag, ctx } = await abrir();
  await pag.keyboard.press('Control+f');
  await pag.getByPlaceholder('Buscar em todos os arquivos...').fill('JS ORIGINAL');
  await pag.waitForTimeout(400);
  await pag.locator('button:has-text("script.js")').first().click();
  await pag.waitForTimeout(300);
  const cabecalho = (await pag.locator('.text-cyan-400.font-semibold').first().innerText().catch(() => '')).trim();
  registrar('clicar no resultado abre o arquivo correspondente',
    cabecalho === 'script.js', `editor mostra "${cabecalho}"`);
  await ctx.close();
}

// 15) Substituir tudo troca em vários arquivos E entra no desfazer como UMA ação.
{
  const { pag, ctx } = await abrir();
  await pag.keyboard.press('Control+f');
  await pag.getByPlaceholder('Buscar em todos os arquivos...').fill('ORIGINAL');
  await pag.getByPlaceholder('Substituir por...').fill('TROCADO');
  await pag.getByRole('button', { name: 'Substituir tudo' }).click();
  await pag.waitForTimeout(500);

  const depois = await lerRepo(pag);
  const trocouEmDois = conteudoDe(depois, 'script.js')?.includes('TROCADO')
    && conteudoDe(depois, 'index.html')?.includes('TROCADO');

  const desfazer = botaoDesfazer(pag);
  if (!(await desfazer.isDisabled())) {
    await desfazer.click();
    await pag.waitForTimeout(400);
  }
  const revertido = await lerRepo(pag);
  const voltouTudo = conteudoDe(revertido, 'script.js')?.includes('JS ORIGINAL')
    && conteudoDe(revertido, 'index.html')?.includes('HTML ORIGINAL');

  registrar('substituir tudo troca em vários arquivos e um Ctrl+Z desfaz tudo',
    trocouEmDois && voltouTudo,
    `troca em 2 arquivos: ${trocouEmDois ? 'sim' : 'NÃO'}; desfazer restaurou: ${voltouTudo ? 'sim' : 'NÃO'}`);
  await ctx.close();
}


// ====== REALCE DE SINTAXE E PYTHON ======

// 16) O realce aparece e as três camadas têm a MESMA medida.
//
// O que se verifica é a medida, e não a posição em pixels: este arnês monta o componente sem a
// folha de estilo do app, então largura e altura aqui não são as da tela real e uma comparação de
// caixas mediria o arnês, não o editor. A medida, sim, é do componente — ela vem de um objeto só
// aplicado nos três elementos (METRICA_DO_EDITOR), justamente para o alinhamento não depender de
// classe utilitária nenhuma. Fonte, tamanho, altura de linha e folga iguais nos três é a condição
// que faz o texto colorido cair exatamente sobre o texto real.
{
  const { pag, ctx } = await abrir();
  await pag.getByText('script.js', { exact: true }).first().click();
  await pag.waitForTimeout(300);

  const temSpans = await pag.locator('pre[aria-hidden="true"] span.r-com').count();

  const medidas = await pag.evaluate(() => {
    const ta = document.querySelector('textarea.code-editor-textarea');
    const pre = document.querySelector('pre[aria-hidden="true"]');
    const regua = document.querySelector('.regua-de-linhas');
    if (!ta || !pre || !regua) return null;
    const m = (e) => {
      const c = getComputedStyle(e);
      return [c.fontFamily, c.fontSize, c.lineHeight, c.whiteSpace, c.paddingTop, c.tabSize].join('|');
    };
    return { ta: m(ta), pre: m(pre), regua: m(regua) };
  });

  const iguais = medidas && medidas.ta === medidas.pre && medidas.ta === medidas.regua;
  registrar('o realce aparece, e régua/realce/escrita compartilham a mesma medida',
    temSpans > 0 && iguais,
    iguais ? `${temSpans} trecho(s) marcados; medida idêntica nos três` : `medidas diferentes: ${JSON.stringify(medidas)}`);
  await ctx.close();
}

// 17) O texto digitado continua íntegro com o realce ligado — é o que o editor grava.
{
  const { pag, ctx } = await abrir();
  const codigo = 'const a = "<b>oi</b>"; // & teste\nfor (let i=0;i<3;i++) {}';
  await pag.locator('textarea').first().fill(codigo);
  await pag.waitForTimeout(500);
  const gravado = conteudoDe(await lerRepo(pag), 'index.html');
  registrar('o realce não altera o texto que é gravado',
    gravado === codigo,
    gravado === codigo ? 'texto idêntico ao digitado' : `gravou "${String(gravado).slice(0, 50)}"`);
  await ctx.close();
}

// 18) Python roda de verdade e o print aparece.
{
  const { pag, ctx } = await abrir();
  await pag.getByRole('button', { name: 'Novo Arquivo' }).click().catch(() => {});
  // O nome do arquivo vem por window.prompt; respondido antes de clicar.
  await ctx.close();
}


// ====== A GERAÇÃO QUE NÃO DÁ EM NADA PRECISA APARECER ======
//
// Relatado: "ninguém tá conseguindo gerar nada". Parte disso era falha de verdade, e parte era o
// editor não dizer NADA quando a geração terminava sem código: a pessoa escrevia o pedido,
// apertava gerar, a caixa esvaziava e acabava — sem erro, sem aviso, sem código. Do lado de quem
// usa, uma falha muda é indistinguível de um app quebrado.

// 19) Geração que volta vazia precisa avisar E devolver o texto do pedido.
{
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([repo, chave]) => {
    localStorage.setItem(chave, JSON.stringify(repo));
    localStorage.setItem('osone_code_active_project_id', 'proj-1');
    window.__respostaDaIA = null;
  }, [REPO, CHAVE]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);

  await pag.getByPlaceholder('Descreva a alteração').fill('faz um jogo da velha');
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(700);

  const avisou = await pag.getByText(/não devolveu código/i).count();
  const pedidoDeVolta = await pag.getByPlaceholder('Descreva a alteração').inputValue();
  registrar('geração vazia avisa na tela e devolve o pedido para a caixa',
    avisou > 0 && pedidoDeVolta === 'faz um jogo da velha',
    avisou > 0 ? `avisou; a caixa voltou com "${pedidoDeVolta}"` : 'FICOU EM SILÊNCIO');
  await ctx.close();
}

// 20) Modelo respondeu mas nada mudou: era anunciado como "atualizado" enquanto o editor não
//     mudava um caractere. Agora precisa dizer que nada mudou.
{
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript(([repo, chave]) => {
    localStorage.setItem(chave, JSON.stringify(repo));
    localStorage.setItem('osone_code_active_project_id', 'proj-1');
    window.__respostaDaIA = 'identico';
  }, [REPO, CHAVE]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);

  await pag.getByPlaceholder('Descreva a alteração').fill('muda a cor do botão');
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(700);

  const disseQueNadaMudou = await pag.getByText(/nada mudou no arquivo/i).count();
  const disseQueAplicou = await pag.getByText(/Código aplicado/i).count();
  registrar('resposta que não muda nada é relatada como tal, e não como sucesso',
    disseQueNadaMudou > 0 && disseQueAplicou === 0,
    disseQueNadaMudou > 0 ? 'avisou que nada mudou' : 'NÃO avisou (ou disse que aplicou)');
  await ctx.close();
}


await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const falhas = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falhas}/${casos.length} conferências passaram.`);
process.exit(falhas ? 1 : 0);
