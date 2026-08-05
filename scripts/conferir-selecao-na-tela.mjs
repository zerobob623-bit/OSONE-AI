/**
 * Roda o OSONE CODE num Chromium e confere a seleção de trecho pela INTERFACE.
 *
 * A costura do texto é conferida em conferir-trecho-selecionado.mjs, sem navegador. O que só a
 * tela pode provar é o outro lado: que marcar o código com o mouse realmente muda o alvo do
 * pedido, que a pessoa VÊ isso acontecendo antes de apertar gerar, e que dá para voltar atrás.
 *
 * O aviso na tela não é enfeite: um pedido que atinge o arquivo inteiro e um que atinge doze
 * linhas são coisas muito diferentes, e a única outra pista seria a marcação no editor — que fica
 * acima e sai da vista quando se rola até a caixa de texto. Sem o aviso, uma seleção acidental
 * mudaria o comportamento do app sem nada explicar.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-selecao-na-tela.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-selecao-'));
const entrada = path.join(pastaTemp, 'entrada.tsx');
const pagina = path.join(pastaTemp, 'index.html');

fs.writeFileSync(entrada, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeWorkspace } from ${JSON.stringify(path.join(RAIZ, 'src/components/CodeWorkspace'))};

createRoot(document.getElementById('raiz')).render(
  React.createElement('div', { style: { height: '100vh' } },
    React.createElement(CodeWorkspace, {
      onClose: () => {},
      onStartLiveVoice: () => {},
      apiKeys: { gemini: 'x', geminiModel: 'gemini-3.6-flash' },
      isGenerating: false,
      onGenerateCodeRequest: async (p, _i, _m, alvo) => {
        // O que interessa registrar é o ALVO: é nele que a seleção viaja.
        window.__alvoRecebido = JSON.parse(JSON.stringify(alvo || null));
        return null;
      }
    })
  )
);
`);
fs.writeFileSync(pagina, `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#07080d;color:#ccc"><div id="raiz"></div><script src="./code.js"></script></body></html>`);

await build({
  entryPoints: [entrada], bundle: true, outfile: path.join(pastaTemp, 'code.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});

const CHAVE_PROJETOS = 'osone_code_projects_v2';
const CHAVE_ATIVO = 'osone_code_active_project_id';

const CODIGO = `<!DOCTYPE html>
<html><body>
<script>
function checarBatida(a, b) { return a.x === b.x; }
function desenhar() { ctx.fillRect(0, 0, 10, 10); }
</script>
</body></html>`;
const ALVO_TEXTO = 'function checarBatida(a, b) { return a.x === b.x; }';

const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`, name: `Projeto ${n}`, activeFileId: 'main-app', updatedAt: 1,
  files: [{ id: 'main-app', name: 'index.html', language: 'html', isMain: true, updatedAt: 1,
            content: n === 1 ? CODIGO : '<h1>outro</h1>' },
          ...(n === 1 ? [{ id: 'f2', name: 'notas.js', language: 'javascript', updatedAt: 1, content: '// notas' }] : [])]
}));

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
  await pag.addInitScript(([ps, cp, ca]) => {
    localStorage.setItem(cp, JSON.stringify(ps));
    localStorage.setItem(ca, 'proj-1');
  }, [PROJETOS, CHAVE_PROJETOS, CHAVE_ATIVO]);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

/**
 * Marca a linha 4 do editor com o TECLADO, como uma pessoa faria de verdade.
 *
 * Definir a seleção por código e disparar um evento 'select' à mão não serve: o onSelect do React
 * é sintético, montado a partir de outros eventos, e não reage a um 'select' fabricado. O teste
 * passaria a medir o despachante de eventos em vez de medir o app. Com o teclado, o caminho
 * percorrido é o mesmo de quem está usando o editor.
 */
const marcarLinhaDoCodigo = async (pag) => {
  const area = pag.locator('textarea.code-editor-textarea').first();
  await area.click();
  await pag.keyboard.press('Control+Home');
  for (let i = 0; i < 3; i++) await pag.keyboard.press('ArrowDown');
  await pag.keyboard.press('Shift+End');
  await pag.waitForTimeout(300);
};

/** Marca um intervalo exato (para os casos-limite) e avisa o React por um evento que ele escuta. */
const marcarIntervalo = async (pag, inicio, fim) => {
  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.evaluate(([de, ate]) => {
    const area = document.querySelector('textarea.code-editor-textarea');
    area.focus();
    area.setSelectionRange(de, ate);
    area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Shift' }));
  }, [inicio, fim]);
  await pag.waitForTimeout(300);
};

const gerar = async (pag, texto) => {
  await pag.getByPlaceholder(/Descreva/).fill(texto);
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(600);
};

// ====== 1) SEM SELEÇÃO: nada muda, o pedido continua valendo para o arquivo inteiro ======
{
  const { pag, ctx } = await abrir();
  const temAviso = await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false);
  registrar('sem seleção, nenhum aviso de trecho aparece',
    !temAviso, temAviso ? 'avisou sem haver seleção' : 'tela limpa');

  await gerar(pag, 'muda a cor');
  const alvo = await pag.evaluate(() => window.__alvoRecebido);
  registrar('sem seleção, o pedido leva o arquivo inteiro e nenhum trecho',
    alvo?.conteudo === CODIGO && !alvo?.trechoSelecionado,
    `trechoSelecionado=${alvo?.trechoSelecionado ? 'presente (errado)' : 'ausente'}`);
  await ctx.close();
}

// ====== 2) COM SELEÇÃO: a tela avisa ANTES de gerar ======
{
  const { pag, ctx } = await abrir();
  await marcarLinhaDoCodigo(pag);

  const aviso = await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false);
  registrar('marcar código no editor avisa na tela que o alvo mudou',
    aviso, aviso ? 'aviso visível antes de gerar' : 'NADA na tela indicando a mudança de alvo');

  // O número vem do próprio texto marcado: fixá-lo à mão faria o caso reprovar por um caractere
  // de diferença sem que nada estivesse errado no app.
  const contagem = await pag.getByText(/linha\(s\),.*caracteres/).innerText().catch(() => '');
  const esperado = new RegExp(`1 linha\\(s\\), ${ALVO_TEXTO.length} caracteres`);
  registrar('o aviso diz quanto foi marcado, em linhas e caracteres',
    esperado.test(contagem), contagem.trim());
  await ctx.close();
}

// ====== 3) O TRECHO CHEGA AO PEDIDO — e o arquivo inteiro vai junto como contexto ======
{
  const { pag, ctx } = await abrir();
  await marcarLinhaDoCodigo(pag);
  await gerar(pag, 'usa distância euclidiana');

  const alvo = await pag.evaluate(() => window.__alvoRecebido);
  registrar('o trecho marcado viaja no pedido, com o texto exato',
    alvo?.trechoSelecionado?.texto === ALVO_TEXTO,
    alvo?.trechoSelecionado ? `"${alvo.trechoSelecionado.texto.slice(0, 40)}…"` : 'não foi junto');

  const t = alvo?.trechoSelecionado;
  registrar('as posições do trecho apontam para ele dentro do arquivo',
    !!t && alvo.conteudo.slice(t.inicio, t.fim) === t.texto,
    t ? `${t.inicio}–${t.fim}` : 'sem trecho');

  registrar('o arquivo inteiro continua indo junto, para servir de contexto',
    alvo?.conteudo === CODIGO, `${alvo?.conteudo?.length} caracteres`);
  await ctx.close();
}

// ====== 4) DÁ PARA VOLTAR ATRÁS SEM MEXER NO EDITOR ======
{
  const { pag, ctx } = await abrir();
  await marcarLinhaDoCodigo(pag);
  await pag.getByRole('button', { name: /usar o arquivo inteiro/ }).click();
  await pag.waitForTimeout(300);

  const sumiu = !(await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false));
  registrar('o botão de voltar atrás desfaz a seleção',
    sumiu, sumiu ? 'aviso fechado' : 'aviso continuou na tela');

  await gerar(pag, 'muda tudo');
  const alvo = await pag.evaluate(() => window.__alvoRecebido);
  registrar('depois de voltar atrás, o pedido volta a valer para o arquivo inteiro',
    !alvo?.trechoSelecionado, alvo?.trechoSelecionado ? 'AINDA mandou o trecho' : 'arquivo inteiro');
  await ctx.close();
}

// ====== 5) SELEÇÃO MINÚSCULA NÃO CONTA ======
// Um clique arrastado marca um ou dois caracteres sem querer. Ativar o modo "editar só o trecho"
// por acidente mudaria o comportamento do app sem a pessoa ter escolhido nada.
{
  const { pag, ctx } = await abrir();
  await marcarIntervalo(pag, 0, 1);
  const avisou = await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false);
  registrar('seleção de um caractere não liga o modo trecho',
    !avisou, avisou ? 'ligou por acidente' : 'ignorada');
  await ctx.close();
}

{
  // Só espaço em branco também não é um trecho para editar.
  const { pag, ctx } = await abrir();
  const posEspaco = CODIGO.indexOf('\n<html>');
  await marcarIntervalo(pag, posEspaco, posEspaco + 1);
  const avisou = await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false);
  registrar('seleção de espaço em branco não liga o modo trecho',
    !avisou, avisou ? 'ligou com espaço em branco' : 'ignorada');
  await ctx.close();
}

// ====== 6) TROCAR DE ARQUIVO INVALIDA A SELEÇÃO ======
// As posições apontavam para outro texto; mantê-las editaria o arquivo novo no lugar errado.
{
  const { pag, ctx } = await abrir();
  await marcarLinhaDoCodigo(pag);
  await pag.getByText('notas.js', { exact: true }).first().click();
  await pag.waitForTimeout(400);

  const sobrou = await pag.getByText(/Editando só o trecho marcado/).isVisible().catch(() => false);
  registrar('abrir outro arquivo apaga a seleção do anterior',
    !sobrou, sobrou ? 'seleção do index.html sobreviveu no notas.js' : 'seleção descartada');
  await ctx.close();
}

// ====== 7) EDITAR O ARQUIVO DEPOIS DE MARCAR NÃO PODE MANDAR UM TRECHO QUE JÁ MUDOU ======
{
  const { pag, ctx } = await abrir();
  await marcarLinhaDoCodigo(pag);
  // O usuário apaga justamente o que estava marcado, e só depois pede.
  await pag.evaluate(() => {
    const area = document.querySelector('textarea.code-editor-textarea');
    const nativo = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativo.call(area, area.value.replace('function checarBatida(a, b) { return a.x === b.x; }', '// apagado'));
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pag.waitForTimeout(400);
  await gerar(pag, 'melhora isso');

  const alvo = await pag.evaluate(() => window.__alvoRecebido);
  const mandouTrechoInvalido = !!alvo?.trechoSelecionado
    && alvo.conteudo.slice(alvo.trechoSelecionado.inicio, alvo.trechoSelecionado.fim) !== alvo.trechoSelecionado.texto;
  registrar('trecho que já não corresponde ao arquivo não é enviado como alvo',
    !mandouTrechoInvalido,
    mandouTrechoInvalido ? 'MANDOU um trecho que não existe mais' : 'o pedido saiu sem trecho inválido');
  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
