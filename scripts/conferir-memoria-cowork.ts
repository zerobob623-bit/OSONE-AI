import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  aprenderAutomacao, guardarSkillTextualDoCowork,
  limparHistorico, passosDaSkillTextualDoCowork, pistasDaAutomacao
} from '../src/lib/historicoDoCowork';
import { resumirOQueJaFoiFeito } from '../src/hooks/useLocalAgent';
import type { RelatorioDoAgente } from '../src/lib/agenteAutonomo';

const dados = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (chave: string) => dados.get(chave) ?? null,
  setItem: (chave: string, valor: string) => dados.set(chave, valor),
  removeItem: (chave: string) => dados.delete(chave)
};

const relatorio: RelatorioDoAgente = {
  motivo: 'concluido', resumo: 'feito', duracaoTotalMs: 10, historico: {} as any, anotacoes: [],
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

const skill = `
1. Abra o YouTube Studio.
2. Clique em Conteúdo perto de x=123 y=456.
3. Digite senha: segredo-total se aparecer login.
4. No filtro, escolha Shorts e abra o vídeo mais recente.
5. Clique no menu de três pontos para procurar baixar.
`;
const passosDaSkill = passosDaSkillTextualDoCowork(skill);
assert.equal(passosDaSkill.length, 5);
assert.equal(passosDaSkill[1].acao, 'clicar');
assert.doesNotMatch(JSON.stringify(passosDaSkill), /123|456|segredo-total/);
assert.match(JSON.stringify(passosDaSkill), /\[omitido\]/);
console.log('  ok  skill textual vira passos semânticos sem coordenadas nem segredo óbvio');

assert.equal(guardarSkillTextualDoCowork({
  objetivo: 'ver último vídeo curto do YouTube',
  skillId: 'skill-youtube-shorts',
  nome: 'YouTube Shorts',
  conteudo: skill
}), true);
const pistasSkill = pistasDaAutomacao('olhar meu último short youtube');
assert.match(pistasSkill, /SKILL IMPORTADA/);
assert.match(pistasSkill, /YouTube Studio/);
assert.match(pistasSkill, /três pontos/);
assert.doesNotMatch(pistasSkill, /123|456|segredo-total/);
limparHistorico();
assert.match(pistasDaAutomacao('ver ultimo video curto youtube'), /SKILL IMPORTADA/);
console.log('  ok  skill importada entra como pista manual e sobrevive a limpar histórico');

// ====== PESQUISA TAMBÉM VIRA MEMÓRIA ======
/**
 * O buraco que estes casos fecham: enquanto "pistaSegura" só conhecia cliques e teclas, uma
 * pesquisa concluída com sucesso não deixava pista NENHUMA — o "default: null" descartava tudo. A
 * mesma pergunta na semana seguinte recomeçava do zero, redescobrindo as mesmas páginas.
 */
limparHistorico();
const pesquisa: RelatorioDoAgente = {
  motivo: 'concluido', resumo: 'R$ 49,90', duracaoTotalMs: 10, historico: {} as any,
  anotacoes: [{ fato: 'plano básico R$ 49,90', fonte: 'https://exemplo.test/precos', quando: 1 }],
  voltas: [
    { indice: 0, pensamento: 'onde está', acao: 'procurar', args: { consulta: 'preço plano básico exemplo' }, ok: true, relato: 'achei', duracaoMs: 1, mudancaDaTela: 0 },
    { indice: 1, pensamento: 'ler', acao: 'ler_pagina', args: { url: 'https://exemplo.test/precos?sessao=SEGREDO123#top' }, ok: true, relato: 'li', duracaoMs: 1, mudancaDaTela: 0 },
    { indice: 2, pensamento: 'anotar', acao: 'anotar', args: { fato: 'R$ 49,90', fonte: 'https://exemplo.test/precos' }, ok: true, relato: 'anotei', duracaoMs: 1, mudancaDaTela: 0 },
    { indice: 3, pensamento: 'fim', acao: 'concluir', args: { resposta: 'R$ 49,90' }, ok: true, relato: 'pronto', duracaoMs: 1, mudancaDaTela: 0 }
  ]
};
assert.equal(aprenderAutomacao('quanto custa o plano basico', pesquisa), true);
const pistasDaPesquisa = pistasDaAutomacao('quanto custa o plano basico');
assert.match(pistasDaPesquisa, /pesquisar por "preço plano básico exemplo"/);
assert.match(pistasDaPesquisa, /ler https:\/\/exemplo\.test\/precos/);
console.log('  ok  uma pesquisa concluída vira caminho aprendido, e não desaparece');

// O caminho é guardado; o VALOR não. Preço muda, e devolver o número velho como se fosse o de
// agora seria pior do que não lembrar de nada.
assert.doesNotMatch(pistasDaPesquisa, /49,90/);
assert.doesNotMatch(pistasDaPesquisa, /SEGREDO123/);
console.log('  ok  guarda o caminho e a fonte, nunca o valor lido nem a sessão da URL');

// ====== O TEXTO DA PÁGINA NÃO PODE ENTUPIR O CONTEXTO ======
/**
 * A leitura devolve a página inteira, e o histórico manda os relatos das últimas 12 voltas ao
 * modelo a cada rodada. Sem compressão, três páginas lidas viravam dezenas de milhares de
 * caracteres repetidos em toda decisão — e o sintoma seria cruel: quanto MAIS ele pesquisasse,
 * pior ele decidiria, porque o objetivo sairia do campo de visão.
 */
const paginaGrande = 'CONTEUDO-'.repeat(1200);
const comDuasLeituras = resumirOQueJaFoiFeito([
  { indice: 0, pensamento: 'li a primeira', acao: 'ler_pagina', args: { url: 'https://a.test/1' }, ok: true, relato: `Li https://a.test/1. ${paginaGrande}`, duracaoMs: 1, mudancaDaTela: 0 },
  { indice: 1, pensamento: 'li a segunda', acao: 'ler_pagina', args: { url: 'https://a.test/2' }, ok: true, relato: `Li https://a.test/2. ${paginaGrande}`, duracaoMs: 1, mudancaDaTela: 0 }
] as any);
const quantasVezesOTextoAparece = comDuasLeituras.split('CONTEUDO-').length - 1;
assert.equal(quantasVezesOTextoAparece <= 1200, true);
assert.match(comDuasLeituras, /https:\/\/a\.test\/1 — o conteúdo já saiu do seu contexto/);
assert.match(comDuasLeituras, /https:\/\/a\.test\/2\. CONTEUDO-/);
console.log('  ok  só a página mais recente vai por extenso; as anteriores viram uma linha');


const ponte = fs.readFileSync(new URL('../src/hooks/useLocalAgent.ts', import.meta.url), 'utf8');
assert.match(ponte, /const memoriaDaAutomacao = pistasDaAutomacao\(objetivo\)/);
assert.match(ponte, /memoriaDaAutomacao[\s\S]*Qual é a PRÓXIMA ação/);
assert.match(ponte, /aprenderAutomacao\(objetivo, relatorio\)/);
console.log('  ok  a memória entra em cada decisão e o sucesso volta para o aprendizado');

/**
 * A CAPACIDADE PRECISA TER POR ONDE SER PEDIDA.
 *
 * O agente aprendeu a pesquisar, e a tela continuou exigindo escolher uma janela para começar —
 * uma parede na frente do caso mais comum ("pesquisa isso e me traz"), que não usa janela nenhuma.
 * Uma capacidade sem botão é uma capacidade que não existe, e nenhum teste do motor pegaria isso,
 * porque do lado do motor estava tudo funcionando.
 */
const tela = fs.readFileSync(new URL('../src/components/CoworkSection.tsx', import.meta.url), 'utf8');
assert.match(tela, /disabled=\{!objetivo\.trim\(\)\}/);
assert.doesNotMatch(tela, /disabled=\{!objetivo\.trim\(\) \|\| \(!janelaDeTrabalho/);
assert.match(ponte, /VOCÊ NÃO TEM JANELA DE TRABALHO/);
console.log('  ok  dá para pedir uma pesquisa sem escolher janela, e o agente sabe o que pode fazer');


console.log('11/11 conferências da memória segura do COWORK passaram.');
