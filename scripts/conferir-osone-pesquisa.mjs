import fs from 'node:fs';

const componente = fs.readFileSync('src/components/OsoneResearchWorkspace.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const planos = fs.readFileSync('src/lib/planos.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

const checks = [
  ['aba existe e é carregada sob demanda', app.includes('OsoneResearchWorkspace') && app.includes("workspaceMode === 'web_research'")],
  ['plano Max protege a aba', planos.includes("mode === 'research' || mode === 'web_research'") && planos.includes("'agentic_research'")],
  ['histórico local de pesquisa existe', componente.includes('HistoricoPesquisa') && componente.includes('historicoPesquisas')],
  ['controle de tempo oferece 1, 2 e 5 minutos', componente.includes('60_000') && componente.includes('120_000') && componente.includes('300_000')],
  ['controle de quantidade de fontes existe', componente.includes('OPCOES_MAX_FONTES') && componente.includes('maxFontesPesquisa')],
  ['modo profundo cria múltiplas consultas', componente.includes('consultasDeInvestigacao') && componente.includes('fontes confiáveis') && componente.includes('críticas limitações')],
  ['pesquisa para ao atingir prazo e preserva achados', componente.includes('tempo_limite') && componente.includes('Tempo limite atingido')],
  ['resposta natural remove markdown decorativo', componente.includes('limparRespostaNatural') && componente.includes('Não use markdown decorativo')],
  ['fontes ficam em painel superior único', componente.includes('fontesPanelAberto') && componente.includes('Fontes do book') && !componente.includes('Selecionar fontes')],
  ['voz da pesquisa usa toggle global', componente.includes('onToggleLiveVoice') && componente.includes('isVoiceActive') && app.includes('onToggleLiveVoice={handleVoiceToggle}')],
  ['Tavily aceita profundidade e quantidade', server.includes('searchDepth === "advanced"') && server.includes('maxResults')],
  ['Google Custom Search aceita num por rodada', server.includes('Number(num)') && server.includes('&num=${maxResults}')]
];

let falhas = 0;
for (const [nome, ok] of checks) {
  if (ok) {
    console.log(`  ok  ${nome}`);
  } else {
    falhas += 1;
    console.error(`ERRO ${nome}`);
  }
}

if (falhas) {
  console.error(`${falhas} verificação(ões) da OSONE PESQUISA falharam.`);
  process.exit(1);
}

console.log(`${checks.length}/${checks.length} verificações da OSONE PESQUISA passaram.`);
