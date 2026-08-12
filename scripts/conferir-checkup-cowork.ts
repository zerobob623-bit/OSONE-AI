import assert from 'node:assert/strict';
import { montarCheckupDasEtapas } from '../src/hooks/useLocalAgent';
import { lerDecisao } from '../src/lib/agenteAutonomo';
import { readFileSync } from 'node:fs';

const historico: any[] = [
  { ok: true, acao: 'abrir', args: { caminho: 'https://example.com' }, relato: 'Abri e passei a olhar a página.', pensamento: 'Vou abrir a página.' },
  { ok: true, acao: 'clicar', args: { alvo: 'imagem' }, relato: 'Cliquei na imagem.', pensamento: 'Vou ampliar a imagem.' },
  { ok: false, acao: 'verificar_download', args: {}, relato: 'Nenhum arquivo novo apareceu em Downloads.', erro: 'arquivo não apareceu', pensamento: 'Vou confirmar o download.' }
];

const checkup = montarCheckupDasEtapas(historico as any);
assert.match(checkup, /\[FEITO E CONFIRMADO\] Abri/);
assert.match(checkup, /\[EM ANDAMENTO — NÃO ABANDONAR\].*confirmar o download/s);

const decisao = lerDecisao(JSON.stringify({
  pensamento: 'Vou conferir se o arquivo realmente chegou ao disco.',
  acao: 'verificar_download', args: { nomeContem: 'foto' }, esperaDaTela: 'qualquer'
}));
assert.equal(decisao.decisao?.acao, 'verificar_download');

const motor = readFileSync(new URL('../src/lib/agenteAutonomo.ts', import.meta.url), 'utf8');
assert.match(motor, /tarefaDeDownload[\s\S]*!downloadConfirmado[\s\S]*NÃO CONCLUÍ/);

console.log('4/4 conferências do checkup operacional do COWORK passaram.');
