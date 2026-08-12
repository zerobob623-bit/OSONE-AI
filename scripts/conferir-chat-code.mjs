import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');
const features = readFileSync(new URL('../FEATURES.md', import.meta.url), 'utf8');

const checks = [
  ['toggle Implementar/Conversar', workspace.includes("setSessaoDaIa('implementar')") && workspace.includes("setSessaoDaIa('conversar')")],
  ['chat não usa o caminho que grava arquivos', workspace.includes('onCodeChatRequest(pergunta, montarContextoDoProjetoParaChat(), historicoAnterior)')],
  ['histórico isolado e persistente por projeto', workspace.includes("osone_code_chat_v1") && workspace.includes('[activeProjectId]')],
  ['retrato contém todos os arquivos', workspace.includes('filesRef.current.map(arquivo =>')],
  ['texto deixa claro que chat não edita', app.includes('Esta sessão é estritamente consultiva')],
  ['geração repete o portão Pro', app.includes("if (!requestPaidFeature('osone_code')) return null;")],
  ['voz possui ferramenta de contexto', app.includes('get_osone_code_chat_context') && app.includes('contextoDoChatCodeParaVozRef.current')],
  ['voz recusa contexto sem Pro', app.includes('seu contexto não foi disponibilizado')],
  ['recurso registrado no mapa', features.includes('Implementar × Conversar')]
];

for (const [nome, passou] of checks) assert.ok(passou, `Falhou: ${nome}`);
console.log(`${checks.length}/${checks.length} conferências do chat do OSONE CODE passaram.`);
