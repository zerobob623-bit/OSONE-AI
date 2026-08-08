import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarCapturaAtual } from '../src/lib/capturaAtual';
import { lerEnsinamentoAssimilado } from '../src/lib/ensinoDoCowork';
import { guardarAutomacaoEnsinada, limparHistorico, pistasDaAutomacao, semelhancaDeObjetivos } from '../src/lib/historicoDoCowork';

const dados = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (chave: string) => dados.get(chave) ?? null,
  setItem: (chave: string, valor: string) => dados.set(chave, valor),
  removeItem: (chave: string) => dados.delete(chave)
};

const imagem = 'data:image/png;base64,QUJD';
assert.equal(validarCapturaAtual(
  { image: imagem, captureId: 'frame-2', requestId: 'pedido-2', capturedAt: 2_000 },
  { requestId: 'pedido-2', iniciadoEm: 1_900, agora: 2_050, ultimoCaptureId: 'frame-1' }
), null);
console.log('  ok  aceita somente frame identificado produzido depois do pedido');

assert.match(validarCapturaAtual(
  { image: imagem, captureId: 'frame-1', requestId: 'pedido-2', capturedAt: 2_000 },
  { requestId: 'pedido-2', iniciadoEm: 1_900, agora: 2_050, ultimoCaptureId: 'frame-1' }
) || '', /repetiu/i);
assert.match(validarCapturaAtual(
  { image: imagem, captureId: 'frame-3', requestId: 'pedido-antigo', capturedAt: 2_000 },
  { requestId: 'pedido-2', iniciadoEm: 1_900, agora: 2_050 }
) || '', /outro pedido/i);
console.log('  ok  rejeita frame repetido e resposta fora de ordem');

const assimilado = lerEnsinamentoAssimilado('```json\n' + JSON.stringify({
  resumo: 'Abrir os vídeos curtos',
  passos: [{ acao: 'clicar', alvo: 'Conteúdo', quandoUsar: 'menu lateral do YouTube Studio', comoConfirmar: 'lista de vídeos aparece' }]
}) + '\n```');
assert.equal(assimilado.passos[0].alvo, 'Conteúdo');
console.log('  ok  lê os passos semânticos assimilados pelo modelo');

assert.ok(semelhancaDeObjetivos('olhar meu último vídeo curto no YouTube', 'ver último vídeo curto do YouTube') >= 0.5);
assert.equal(guardarAutomacaoEnsinada({
  objetivo: 'ver último vídeo curto do YouTube', treinamentoId: 'treino-1', passos: assimilado.passos
}), true);
const pista = pistasDaAutomacao('olhar meu último vídeo curto no YouTube');
assert.match(pista, /PROCEDIMENTO ENSINADO/);
assert.match(pista, /Conteúdo|YouTube Studio/);
assert.doesNotMatch(pista, /\bx\s*=\s*\d|\by\s*=\s*\d|\(\s*\d+\s*,\s*\d+\s*\)/i);
console.log('  ok  reencontra um ensino com objetivo equivalente e nunca cria macro por coordenadas');

limparHistorico();
assert.match(pistasDaAutomacao('olhar meu último vídeo curto no YouTube'), /PROCEDIMENTO ENSINADO/);
console.log('  ok  limpar tarefas antigas não apaga um treinamento demonstrado pela pessoa');

const componente = fs.readFileSync(new URL('../src/components/CoworkTeachingPanel.tsx', import.meta.url), 'utf8');
assert.match(componente, /getDisplayMedia/);
assert.match(componente, /criarReconhecedor/);
assert.match(componente, /salvarTreinamentoDoCowork/);
assert.match(componente, /IndexedDB|quadros locais/);
console.log('  ok  a interface compartilha tela, transcreve e salva fala + quadros localmente');

const agente = fs.readFileSync(new URL('../src/localAgentService.ts', import.meta.url), 'utf8');
assert.match(agente, /no-store, no-cache/);
assert.match(agente, /captureId: crypto\.randomUUID/);
assert.match(agente, /requestId: String\(req\.query/);
console.log('  ok  o Agente Local marca toda captura e proíbe cache');

const ponte = fs.readFileSync(new URL('../src/hooks/useLocalAgent.ts', import.meta.url), 'utf8');
assert.match(ponte, /cache:\s*'no-store'/);
assert.match(ponte, /sequencia\s*<\s*sequenciaAceitaRef\.current/);
assert.match(ponte, /45_000/);
console.log('  ok  o cliente rejeita captura atrasada, desativa cache e limita o tempo de decisão');

console.log('8/8 conferências do ensino do COWORK passaram.');
