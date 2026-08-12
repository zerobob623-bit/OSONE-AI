/**
 * Regressão do caminho voz -> OSONE CODE.
 *
 * O defeito original era sutil: a ferramenta chamava handleCodeWorkspacePrompt diretamente. A
 * Promise devolvia o código corretamente, mas somente o editor sabe em qual arquivo aplicá-lo;
 * como o retorno era ignorado, a escrita aparecia por alguns instantes e sumia sem alterar nada.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');

const ferramentas = [...app.matchAll(/(?:call\.name === ['"]send_code_prompt['"])[\s\S]{0,1800}/g)]
  .map(resultado => resultado[0]);

assert.equal(ferramentas.length, 2, 'chat e Gemini Live precisam tratar send_code_prompt');
for (const trecho of ferramentas) {
  assert.match(trecho, /enfileirarPedidoDeVozDoCode\(promptText\)/,
    'a ferramenta deve entregar o pedido à fila do editor');
  assert.doesNotMatch(trecho, /handleCodeWorkspacePrompt\(promptText\)/,
    'a ferramenta não pode ignorar o código devolvido pelo gerador');
}

assert.match(app, /comandoDeVoz=\{pedidosDeVozDoCode\[0\]\}/,
  'a troca de aba deve entregar o primeiro pedido ao CodeWorkspace');
assert.match(app, /aoConcluirComandoDeVoz=\{concluirPedidoDeVozDoCode\}/,
  'o editor deve conseguir liberar o próximo pedido da fila');
assert.match(editor, /handleSendAIPrompt\(comandoDeVoz\.prompt\)\.finally/,
  'o pedido de voz precisa passar pelo mesmo caminho que grava e cria o Ctrl+Z');
assert.match(editor, /processandoComandoDeVozRef\.current/,
  'dois pedidos de voz não podem editar o mesmo arquivo simultaneamente');
assert.match(editor, /catch \(e: any\)[\s\S]{0,500}O pedido ficou na caixa/,
  'falha de rede deve ficar visível e preservar o pedido');

console.log('7/7 conferências da voz no OSONE CODE passaram.');
