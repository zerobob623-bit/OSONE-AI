import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aprenderAutomacao, limparHistorico, pistasDaAutomacao } from '../src/lib/historicoDoCowork';
import type { RelatorioDoAgente } from '../src/lib/agenteAutonomo';

const dados = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (chave: string) => dados.get(chave) ?? null,
  setItem: (chave: string, valor: string) => dados.set(chave, valor),
  removeItem: (chave: string) => dados.delete(chave)
};

const relatorio: RelatorioDoAgente = {
  motivo: 'concluido', resumo: 'feito', duracaoTotalMs: 10, historico: {} as any,
  voltas: [
    { indice: 0, pensamento: 'abrir', acao: 'abrir', args: { caminho: 'https://exemplo.test/painel?token=segredo#parte' }, ok: true, relato: 'abriu', duracaoMs: 1, mudancaDaTela: 1 },
    { indice: 1, pensamento: 'clicar', acao: 'clicar', args: { alvo: 'botão Entrar', x: 999, y: 888 }, ok: true, relato: 'clicou', duracaoMs: 1, mudancaDaTela: 1 },
    { indice: 2, pensamento: 'digitar', acao: 'digitar', args: { texto: 'senha-super-secreta' }, ok: true, relato: 'digitou', duracaoMs: 1, mudancaDaTela: 1 },
    { indice: 3, pensamento: 'fim', acao: 'concluir', args: { resposta: 'feito' }, ok: true, relato: 'feito', duracaoMs: 1, mudancaDaTela: 0 }
  ]
};

assert.equal(aprenderAutomacao('Entrar no painel', relatorio), true);
const pistas = pistasDaAutomacao('  entrar   no PAINEL ');
assert.match(pistas, /botão Entrar/);
assert.match(pistas, /conteúdo omitido por privacidade/);
assert.doesNotMatch(pistas, /senha-super-secreta|token=segredo|999|888/);
assert.match(pistas, /confira a foto atual/i);
console.log('  ok  aprende alvos sem guardar texto digitado, query secreta ou coordenadas');

assert.equal(aprenderAutomacao('tarefa falha', { ...relatorio, motivo: 'falhas-seguidas' }), false);
assert.equal(pistasDaAutomacao('tarefa falha'), '');
console.log('  ok  execução incompleta não vira aprendizado');

assert.equal(aprenderAutomacao('Entrar no painel', relatorio), true);
assert.match(pistasDaAutomacao('Entrar no painel'), /2 vez\(es\)/);
console.log('  ok  sucessos repetidos atualizam a memória da mesma automação');

limparHistorico();
assert.equal(pistasDaAutomacao('Entrar no painel'), '');
console.log('  ok  limpar histórico também apaga o aprendizado');

const ponte = fs.readFileSync(new URL('../src/hooks/useLocalAgent.ts', import.meta.url), 'utf8');
assert.match(ponte, /const memoriaDaAutomacao = pistasDaAutomacao\(objetivo\)/);
assert.match(ponte, /memoriaDaAutomacao[\s\S]*Qual é a PRÓXIMA ação/);
assert.match(ponte, /aprenderAutomacao\(objetivo, relatorio\)/);
console.log('  ok  a memória entra em cada decisão e o sucesso volta para o aprendizado');

console.log('5/5 conferências da memória segura do COWORK passaram.');
