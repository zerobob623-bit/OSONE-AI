import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const painel = readFileSync(new URL('../src/components/CoworkSection.tsx', import.meta.url), 'utf8');
const ponte = readFileSync(new URL('../src/hooks/useLocalAgent.ts', import.meta.url), 'utf8');
const agenteLocal = readFileSync(new URL('../src/localAgentService.ts', import.meta.url), 'utf8');

assert.match(
  painel,
  /if \(!areaParalela\?\.ligada \|\| trabalhando\) return;/,
  'o preview decorativo deve parar enquanto o motor trabalha'
);
assert.doesNotMatch(
  painel,
  /setInterval\(puxar,\s*trabalhando\s*\?\s*1000/,
  'o painel não pode manter polling de 1s concorrendo com as capturas operacionais'
);
assert.match(
  painel,
  /const ultimaFoto = trabalhando\s*\?\s*\(ultimaFotoDoTrabalho \|\| fotoDaArea\)/,
  'durante a tarefa, a foto operacional mais nova deve ter prioridade no quadro'
);

assert.match(
  ponte,
  /focus=\$\{garantirFoco \? '1' : '0'\}&geometry=\$\{medirGeometria \? '1' : '0'\}/,
  'a ponte deve informar ao agente local quais capturas são passivas'
);
assert.match(
  ponte,
  /garantirFoco: primeiraAssinatura,[\s\S]*?medirGeometria: false/,
  'só a primeira assinatura da tarefa deve garantir foco'
);
assert.match(
  ponte,
  /intervalosDeSondagem = \[250, 450, 700, 1000, 1500, 1500\]/,
  'a abertura deve começar a procurar cedo e preservar um prazo longo'
);
assert.match(
  ponte,
  /j\.id === idDaJanelaAnterior && j\.titulo !== antes\.get\(j\.id\)\?\.titulo/,
  'abrir deve reconhecer uma aba ou pasta que reutilizou a janela atual'
);

assert.match(
  agenteLocal,
  /if \(deveFocar\) \{[\s\S]*?await new Promise\(r => setTimeout\(r, 250\)\);/,
  'a pausa de redesenho deve existir somente quando o foco foi solicitado'
);
assert.match(
  agenteLocal,
  /platform === 'win32' \|\| deveMedirGeometria/,
  'no Linux, captura passiva não deve relistar janelas para obter geometria sem uso'
);

console.log('9/9 conferências de desempenho do COWORK passaram.');
