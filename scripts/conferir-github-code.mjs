import assert from 'node:assert/strict';
import fs from 'node:fs';

const painel = fs.readFileSync(new URL('../src/components/CodeGithubPanel.tsx', import.meta.url), 'utf8');
const lib = fs.readFileSync(new URL('../src/lib/githubDoCode.ts', import.meta.url), 'utf8');
const code = fs.readFileSync(new URL('../src/components/CodeWorkspace.tsx', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../FEATURES.md', import.meta.url), 'utf8');

assert.match(lib, /const GITHUB_API = 'https:\/\/api\.github\.com'/);
assert.match(lib, /X-GitHub-Api-Version/);
assert.match(lib, /export async function publicarProjetoNoGithub/);
assert.match(lib, /\/git\/trees/);
assert.match(lib, /\/git\/commits/);
assert.match(lib, /\/pulls/);
console.log('  ok  publicação usa REST/Git Data API oficial para branch, commit e PR');

assert.match(lib, /export async function importarProjetoDoGithub/);
assert.match(lib, /recursive=1/);
assert.match(lib, /DIRETORIOS_IGNORADOS/);
assert.match(lib, /node_modules\|dist\|build/);
assert.match(painel, /Importar estado atual do GitHub/);
assert.match(painel, /onImportFiles/);
assert.match(code, /importarArquivosDoGithubParaCode/);
console.log('  ok  repo existente pode ser importado para o projeto atual do OSONE CODE');

assert.match(lib, /export function auditarSegredosNosArquivos/);
assert.match(lib, /Stripe secret key/);
assert.match(lib, /GitHub token/);
assert.match(lib, /Google\/Firebase API key/);
assert.match(painel, /Auditoria rápida de chaves vazadas/);
assert.match(painel, /prévia sempre mascarada|Prévia sempre mascarada/i);
console.log('  ok  auditoria local encontra padrões de segredo sem exibir chave completa');

assert.match(painel, /const TOKEN_KEY = 'osone_code_github_token'/);
assert.match(painel, /localStorage\.setItem\(TOKEN_KEY/);
assert.doesNotMatch(painel, /syncUserDataToCloud|from ['"]firebase|firestore\(/i);
console.log('  ok  token GitHub fica local no aparelho e não sincroniza para nuvem');

assert.match(painel, /Sem API paga/);
assert.match(painel, /GitHub Actions.*cota grátis/s);
assert.match(features, /API do GitHub não tem cobrança própria/);
console.log('  ok  interface informa custo zero da API e alerta sobre Actions privados');

assert.match(painel, /window\.confirm/);
assert.match(painel, /fazerMergeDoPullRequestGithub/);
assert.match(lib, /merge_method: 'squash'/);
console.log('  ok  merge exige confirmação explícita e usa squash');

assert.match(code, /CodeGithubPanel/);
assert.match(code, /setIsGithubPanelOpen\(true\)/);
/**
 * O que importa é EXISTIR o caminho até o painel do GitHub, não o rótulo escrito ao lado do ícone.
 *
 * Esta linha exigia o texto ">GitHub</span>" e ficou vermelha silenciosamente quando a barra
 * superior do CODE virou só ícones (o nome passou para o "title", que é o que aparece ao parar o
 * mouse). Um conferidor preso à marcação exata quebra a cada ajuste visual e, pior, treina a
 * pessoa a ignorar a suíte — que era exatamente o estado em que ele estava.
 */
assert.match(code, /setIsGithubPanelOpen\(true\)/);
assert.match(code, /title=\{?["`][^"`]*GitHub/);
console.log('  ok  painel GitHub está acessível dentro do OSONE CODE');

console.log('7/7 conferências GitHub do OSONE CODE passaram.');
