/** Confere contratos que vivem na ligação UI -> useLocalAgent, fora do motor puro. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const hook = fs.readFileSync(new URL('../src/hooks/useLocalAgent.ts', import.meta.url), 'utf8');
const tela = fs.readFileSync(new URL('../src/components/CoworkSection.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(hook, /if \(!janelaRef\.current && !areaRef\.current\?\.ligada\)\s*\{\s*return \{ error: 'Escolha em qual janela/,
  'a ligação não pode recusar pesquisa antes de o agente decidir');
assert.match(tela, /Sem janela escolhida — vou trabalhar só pesquisando e lendo páginas/,
  'a tela deve explicar o modo sem janela');
assert.match(hook, /validarContextoDeExecucaoDoCowork/,
  'a execução deve consultar a política de alvo seguro');
assert.match(hook, /procurar: \(consulta\) => procurarNaWeb/,
  'a busca web deve continuar ligada ao agente');
assert.match(hook, /lerPagina: \(url\) => lerPaginaDaWeb/,
  'a leitura web deve continuar ligada ao agente');

const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cowork-contexto-'));
const saida = path.join(temporario, 'contexto.mjs');
await build({
  entryPoints: [new URL('../src/lib/contextoDoCowork.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', outfile: saida, logLevel: 'silent'
});
const { validarContextoDeExecucaoDoCowork } = await import(pathToFileURL(saida).href);

assert.match(
  validarContextoDeExecucaoDoCowork({ temJanela: false, areaParalelaLigada: false }),
  /nenhuma janela foi escolhida/,
  'sem janela e sem tela paralela, tocar no computador deve ser recusado'
);
assert.equal(validarContextoDeExecucaoDoCowork({ temJanela: true, areaParalelaLigada: false }), null,
  'uma janela escolhida fornece alvo seguro');
assert.equal(validarContextoDeExecucaoDoCowork({ temJanela: false, areaParalelaLigada: true }), null,
  'a tela paralela também fornece alvo seguro');

console.log('8/8 conferências da integração do COWORK passaram.');
