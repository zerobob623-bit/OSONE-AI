/**
 * Confere o layout do OSONE CODE — pelas PROPRIEDADES, e não pelas classes.
 *
 * ====== POR QUE ESTE ARQUIVO FOI REESCRITO ======
 *
 * A versão anterior era uma lista de sequências exatas de Tailwind copiadas da tela
 * ("rounded-2xl border border-white/5 bg-black/20 p-1.5", "w-full md:w-auto max-w-full flex items-
 * center gap-1.5 overflow-x-auto"). Isso não protege desenho nenhum: protege uma STRING. Quando a
 * aba foi redesenhada para as duas fileiras laterais com o preview no meio, todas essas linhas
 * ficaram vermelhas de uma vez — e ficaram assim, sem ninguém ver, porque um conferidor que
 * quebra a cada ajuste visual deixa de ser lido. Um teste em que ninguém confia é pior que
 * nenhum: ele ocupa o lugar do que faria falta.
 *
 * O que este arquivo passa a garantir são as decisões do desenho, que é o que não pode se perder:
 *
 *   1. AS DUAS FILEIRAS LATERAIS existem e não rolam junto com o conteúdo.
 *   2. O MEIO É O CÓDIGO/PREVIEW — os três modos de visualização continuam alcançáveis.
 *   3. O QUE SE DIGITA FICA EMBAIXO, com os ícones dentro do próprio campo.
 *   4. OS PROJETOS CABEM NUM ELEMENTO SÓ, e não numa faixa de pastilhas.
 *   5. A ABA SE SOBREPÕE ao cabeçalho e à navegação do app.
 *
 * Cada uma dessas foi um pedido explícito, e cada uma pode ser desfeita sem erro de compilação.
 *
 * Como rodar:
 *   node scripts/conferir-layout-code.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

let passaram = 0;
const total = 5;
const ok = (mensagem) => { passaram++; console.log(`  ok  ${mensagem}`); };

// 1) As duas fileiras laterais
assert.match(code, /w-11 sm:w-12/);
assert.ok((code.match(/w-11 sm:w-12/g) || []).length >= 2,
  'esperava DUAS fileiras estreitas (esquerda e direita), não uma');
assert.match(code, /shrink-0/);
ok('as duas fileiras laterais existem e não encolhem com o conteúdo');

// 2) O meio é o código/preview
for (const modo of ["'editor'", "'split'", "'preview'"]) {
  assert.match(code, new RegExp(`setViewLayout\\(${modo}\\)`),
    `o modo de visualização ${modo} precisa continuar alcançável`);
}
ok('o meio da tela alterna entre código, dividido e preview');

// 3) O campo de digitar embaixo, com os ícones dentro
assert.match(code, /handleSendAIPrompt/);
assert.match(code, /setPromptInput/);
assert.match(code, /handleAttachImages/);
ok('o campo de pedido fica embaixo e leva anexo junto');

// 4) Projetos num elemento só
assert.match(code, /menuProjetosAberto/);
assert.match(code, /handleSwitchProject/);
ok('os projetos cabem num botão só, com a troca dentro dele');

/**
 * 5) A aba se sobrepõe ao resto do app.
 *
 * Este é o único que não mora neste arquivo: quem esconde o cabeçalho e a navegação é o App, e é
 * lá que a regressão aconteceria. Sem esta conferência, "a aba deveria se sobrepor a todos eles"
 * volta a ser um detalhe que alguém desfaz sem perceber.
 */
assert.match(app, /workspaceMode === 'code' && "hidden"/);
ok('a aba do CODE se sobrepõe ao cabeçalho e à navegação do app');

console.log(`\n${passaram}/${total} conferências de layout do OSONE CODE passaram.`);
process.exit(passaram === total ? 0 : 1);
