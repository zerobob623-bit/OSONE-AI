/**
 * Conferência estática do suporte fullstack/pastas no OSONE CODE.
 *
 * O bug aqui não aparece como erro óbvio: o usuário vê "frontend/index.html" na tela, mas o
 * exportador pode achatar para "index.html" ou o preview pode resolver "./app.js" contra a raiz.
 * Este script garante que as três pontas continuam ligadas: UI, preview e export.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const casos = [];
const registrar = (nome, passou, detalhe = '') => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};

const workspace = ler('src/components/CodeWorkspace.tsx');
const preview = ler('src/lib/montarPreview.ts');
const exportador = ler('src/lib/exportarProjeto.ts');
const caminhos = ler('src/lib/caminhosDoCode.ts');
const fullstack = ler('src/lib/fullstackDoCode.ts');
const features = ler('FEATURES.md');

registrar('há biblioteca única para caminhos do OSONE CODE',
  caminhos.includes('normalizarCaminhoDoCode')
    && caminhos.includes('resolverCaminhoRelativo')
    && caminhos.includes('caminhoDisponivel'),
  'normalização + resolução + nome livre');

registrar('a UI aceita exemplos de caminhos fullstack',
  workspace.includes('frontend/app.js')
    && workspace.includes('server/api.js')
    && workspace.includes('criarEstruturaFullstack'),
  'prompt e botão fullstack presentes');

registrar('há preparo explícito para rodar fullstack fora do iframe',
  workspace.includes('prepararExecucaoFullstack')
    && workspace.includes('Rodar fullstack')
    && fullstack.includes('montarPackageJsonFullstack')
    && fullstack.includes('npm run dev')
    && fullstack.includes('RODAR_FULLSTACK.md'),
  'package.json + guia + comandos');

registrar('a lista do repositório é agrupada por pasta',
  workspace.includes('agruparArquivosPorPasta')
    && workspace.includes('arquivosAgrupados.map')
    && workspace.includes('pastaDoCaminho(file.name)'),
  'árvore visual em vez de lista totalmente plana');

registrar('o preview resolve caminhos relativos a partir do arquivo de origem',
  preview.includes('resolverCaminhoRelativo(origemReal.name')
    && preview.includes('resolverImports(arquivo.content || \'\', conteudoDe, [arquivo.id], 0, arquivo)')
    && preview.includes('frontend/index.html'),
  'frontend/index.html + ./app.js + imports aninhados');

registrar('projeto fullstack prioriza o frontend no preview',
  preview.includes('projetoPareceFullstack')
    && preview.includes('principalDoFrontend')
    && workspace.includes('entradaFrontendPreferidaDoCode')
    && workspace.includes('f.id === entrada.id ? { ...f, isMain: true } : { ...f, isMain: false }'),
  'não roda um index.html antigo da raiz quando há frontend/index.html');

registrar('o exportador preserva pastas seguras no zip',
  exportador.includes('caminhoSeguroNoPacote')
    && exportador.includes('normalizarCaminhoDoCode')
    && exportador.includes('arquivosDeSuporteFullstack')
    && !exportador.includes('split(/[/\\\\]/).pop()!'),
  'sem achatar caminhos úteis e com suporte fullstack');

registrar('FEATURES.md registra o suporte fullstack',
  /fullstack/i.test(features) && /frontend\/.*server\/.*shared\//is.test(features),
  'documentação de preservação atualizada');

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
