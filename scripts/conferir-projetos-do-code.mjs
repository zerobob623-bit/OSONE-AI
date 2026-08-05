/**
 * Roda o OSONE CODE num Chromium e confere que um projeto não sobrescreve o outro.
 *
 * O defeito principal aqui destruía trabalho em silêncio, e ninguém veria acontecer:
 *
 * A lista de arquivos era carregada da chave ANTIGA ('osone_code_repository_files'), enquanto o
 * projeto ativo vinha de outra chave ('osone_code_active_project_id') — duas fontes independentes
 * para uma informação só. Bastava outra janela do OSONE gravar por cima, ou uma gravação parcial,
 * para o editor abrir os arquivos do Projeto 1 com a barra marcando o Projeto 3. E o auto-save,
 * que grava a lista DENTRO do projeto ativo a cada mudança, terminava o serviço: o primeiro
 * caractere digitado gravava o Projeto 1 por cima do Projeto 3. Sem erro, sem aviso, e sem passar
 * pelo histórico que o Ctrl+Z alcança.
 *
 * Os outros casos aqui são do mesmo tipo — coisas que não dão erro na tela, só resultado errado:
 * apagar arquivo escolhendo o próximo por uma lista vencida, renomear sem trocar a linguagem, e
 * aviso de erro exibido com o ícone de sucesso.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-projetos-do-code.mjs
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

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-projetos-'));
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
      apiKeys: { gemini: 'x' },
      isGenerating: false,
      onGenerateCodeRequest: async (p, _i, _m, alvo) => {
        window.__alvoRecebido = alvo;
        if (window.__respostaDaIA === null) return null;
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
  nodePaths: [path.join(RAIZ, 'node_modules')],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

const CHAVE_PROJETOS = 'osone_code_projects_v2';
const CHAVE_LEGADA = 'osone_code_repository_files';
const CHAVE_ATIVO = 'osone_code_active_project_id';

const arq = (id, name, content, extra = {}) =>
  ({ id, name, language: name.endsWith('.html') ? 'html' : name.endsWith('.css') ? 'css' : 'javascript',
     content, updatedAt: 1, ...extra });

/** Cinco projetos, cada um com conteúdo reconhecível — é como se prova que um não virou o outro. */
const PROJETOS = [1, 2, 3, 4, 5].map(n => ({
  id: `proj-${n}`,
  name: `Projeto ${n}`,
  files: [arq('main-app', 'index.html', `<h1>PROJETO ${n}</h1>`, { isMain: true })],
  activeFileId: 'main-app',
  updatedAt: 1
}));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});

const abrir = async (estadoInicial) => {
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 } });
  const pag = await ctx.newPage();
  await pag.addInitScript((estado) => {
    for (const [chave, valor] of Object.entries(estado)) {
      localStorage.setItem(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
    }
    window.__respostaDaIA = '/* CODIGO NOVO */';
  }, estadoInicial);
  await pag.goto('file://' + pagina);
  await pag.waitForTimeout(500);
  return { pag, ctx };
};

const lerProjetos = (pag) => pag.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]'), CHAVE_PROJETOS);
const textoDoEditor = (pag) => pag.locator('textarea.code-editor-textarea').first().inputValue();

// ====== 1) O DEFEITO PRINCIPAL: chave antiga divergindo do projeto ativo ======
{
  // Estado montado à mão exatamente como ele aparece na prática: o projeto ativo é o 3, mas a
  // chave antiga ficou com os arquivos do Projeto 1.
  const { pag, ctx } = await abrir({
    [CHAVE_PROJETOS]: PROJETOS,
    [CHAVE_ATIVO]: 'proj-3',
    [CHAVE_LEGADA]: PROJETOS[0].files
  });

  const noEditor = await textoDoEditor(pag);
  registrar('com a chave antiga divergindo, o editor abre os arquivos do projeto ATIVO',
    noEditor.includes('PROJETO 3'),
    noEditor.includes('PROJETO 3') ? 'abriu o Projeto 3' : `abriu "${noEditor.slice(0, 30)}" (o projeto errado)`);

  // Agora a parte cara: digitar. O auto-save grava a lista no projeto ativo.
  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.type('<!-- editado -->');
  await pag.waitForTimeout(600);

  const projetos = await lerProjetos(pag);
  const p1 = projetos.find(p => p.id === 'proj-1');
  const p3 = projetos.find(p => p.id === 'proj-3');

  registrar('digitar no Projeto 3 NÃO grava o Projeto 1 por cima dele',
    p3.files[0].content.includes('PROJETO 3'),
    p3.files[0].content.includes('PROJETO 3') ? 'Projeto 3 preservado' : 'PROJETO 3 DESTRUÍDO pelo conteúdo do 1');

  registrar('o Projeto 1 continua intacto enquanto se edita o 3',
    p1.files[0].content === '<h1>PROJETO 1</h1>',
    p1.files[0].content.slice(0, 40));

  await ctx.close();
}

// ====== 2) Trocar de projeto continua isolando o conteúdo ======
{
  const { pag, ctx } = await abrir({ [CHAVE_PROJETOS]: PROJETOS, [CHAVE_ATIVO]: 'proj-1' });

  await pag.getByText('Projeto 2', { exact: true }).first().click();
  await pag.waitForTimeout(400);
  const noEditor = await textoDoEditor(pag);
  registrar('trocar de projeto carrega os arquivos daquele projeto',
    noEditor.includes('PROJETO 2'), noEditor.slice(0, 30));

  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.type('X');
  await pag.waitForTimeout(500);

  const projetos = await lerProjetos(pag);
  const conteudoDoUm = projetos.find(p => p.id === 'proj-1').files[0].content;
  registrar('editar o Projeto 2 não encosta no Projeto 1',
    conteudoDoUm === '<h1>PROJETO 1</h1>',
    conteudoDoUm === '<h1>PROJETO 1</h1>' ? 'Projeto 1 intacto' : `Projeto 1 virou "${conteudoDoUm.slice(0, 40)}"`);

  await ctx.close();
}

// ====== 3) Apagar o arquivo aberto escolhe um arquivo que EXISTE ======
{
  const comTresArquivos = [{
    ...PROJETOS[0],
    files: [
      arq('main-app', 'index.html', '<h1>A</h1>', { isMain: true }),
      arq('f2', 'script.js', '// B'),
      arq('f3', 'styles.css', '/* C */')
    ]
  }, ...PROJETOS.slice(1)];

  const { pag, ctx } = await abrir({ [CHAVE_PROJETOS]: comTresArquivos, [CHAVE_ATIVO]: 'proj-1' });
  pag.on('dialog', d => d.accept());

  await pag.getByText('script.js', { exact: true }).first().click();
  await pag.waitForTimeout(200);
  // O botão de apagar do arquivo aberto.
  await pag.locator('button[title="Excluir"]').nth(1).click();
  await pag.waitForTimeout(500);

  const cabecalho = (await pag.locator('.text-cyan-400.font-semibold').first().innerText().catch(() => '')).trim();
  const conteudo = await textoDoEditor(pag);
  const projetos = await lerProjetos(pag);
  const nomes = projetos.find(p => p.id === 'proj-1').files.map(f => f.name);

  registrar('apagar o arquivo aberto abre um arquivo que realmente existe',
    !nomes.includes('script.js') && nomes.includes(cabecalho) && conteudo.length > 0,
    `sobraram [${nomes.join(', ')}]; o editor abriu "${cabecalho}"`);

  await ctx.close();
}

// ====== 4) Renomear troca a linguagem e entra no desfazer ======
{
  const { pag, ctx } = await abrir({
    [CHAVE_PROJETOS]: [{
      ...PROJETOS[0],
      files: [arq('main-app', 'index.html', '<h1>A</h1>', { isMain: true }), arq('f2', 'script.js', 'const a = 1;')]
    }, ...PROJETOS.slice(1)],
    [CHAVE_ATIVO]: 'proj-1'
  });

  await pag.locator('button[title="Renomear"]').nth(1).click();
  await pag.waitForTimeout(200);
  // O localizador é resolvido de novo a cada uso: depois do fill, um seletor por value já não
  // casa. O Enter vai pelo teclado, no campo que está com o foco.
  await pag.locator('input[value="script.js"]').first().fill('estilo.css');
  await pag.keyboard.press('Enter');
  await pag.waitForTimeout(500);

  let projetos = await lerProjetos(pag);
  const renomeado = projetos.find(p => p.id === 'proj-1').files.find(f => f.id === 'f2');
  registrar('renomear para .css troca a linguagem do arquivo junto com o nome',
    renomeado.name === 'estilo.css' && renomeado.language === 'css',
    `${renomeado.name} → language="${renomeado.language}"`);

  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.press('Control+z');
  await pag.waitForTimeout(500);
  projetos = await lerProjetos(pag);
  const desfeito = projetos.find(p => p.id === 'proj-1').files.find(f => f.id === 'f2');
  registrar('Ctrl+Z desfaz a renomeação',
    desfeito.name === 'script.js', `voltou para "${desfeito.name}"`);

  await ctx.close();
}

// ====== 5) Aviso de erro não pode aparecer com cara de sucesso ======
{
  const { pag, ctx } = await abrir({ [CHAVE_PROJETOS]: PROJETOS, [CHAVE_ATIVO]: 'proj-1' });
  // Documento que abre e não fecha: o caminho que marca a entrega como incompleta.
  await pag.evaluate(() => { window.__respostaDaIA = '<!DOCTYPE html>\\n<html>\\n<body>\\n<script>function x(){'; });

  await pag.getByPlaceholder('Descreva a alteração').fill('faz um jogo');
  await pag.getByRole('button', { name: 'Gerar Código' }).click();
  await pag.waitForTimeout(700);

  const temAvisoDeIncompleto = await pag.getByText(/INCOMPLETO/).first().isVisible().catch(() => false);
  // O ícone de sucesso é o único com a animação de pulo; num aviso de erro ele não pode estar lá.
  const temIconeDeSucesso = await pag.locator('.animate-bounce').first().isVisible().catch(() => false);

  registrar('aviso de código incompleto aparece, e SEM o ícone verde de sucesso',
    temAvisoDeIncompleto && !temIconeDeSucesso,
    `aviso=${temAvisoDeIncompleto ? 'sim' : 'não'}, ícone de sucesso=${temIconeDeSucesso ? 'PRESENTE (errado)' : 'ausente'}`);

  await ctx.close();
}

// ====== 6) Projetos criados no preenchimento não compartilham os mesmos arquivos ======
{
  // Só dois projetos guardados: os outros três são preenchidos com os padrões na abertura.
  const { pag, ctx } = await abrir({
    [CHAVE_PROJETOS]: PROJETOS.slice(0, 2),
    [CHAVE_ATIVO]: 'proj-4'
  });

  await pag.locator('textarea.code-editor-textarea').first().click();
  await pag.keyboard.type('/* MARCA DO 4 */');
  await pag.waitForTimeout(600);

  const projetos = await lerProjetos(pag);
  const p4 = projetos.find(p => p.id === 'proj-4');
  const p5 = projetos.find(p => p.id === 'proj-5');
  const vazouParaOutro = JSON.stringify(p5.files).includes('MARCA DO 4');

  registrar('editar um projeto preenchido não vaza para os outros preenchidos',
    JSON.stringify(p4.files).includes('MARCA DO 4') && !vazouParaOutro,
    vazouParaOutro ? 'VAZOU: o 5 recebeu a edição do 4' : 'cada projeto com seus próprios arquivos');

  await ctx.close();
}

await nav.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
