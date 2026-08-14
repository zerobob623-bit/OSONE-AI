import { CodeRepositoryFile } from '../types';
import { chaveDeCaminho, normalizarCaminhoDoCode } from './caminhosDoCode';

/**
 * Inteligência pequena, mas importante, sobre projetos fullstack dentro do OSONE CODE.
 *
 * O preview do navegador executa muito bem frontend, HTML, módulos React/TSX e runtimes leves.
 * Backend é outra natureza: Express/Node precisa de processo, porta e sistema de arquivos. Em vez
 * de fingir que isso roda dentro do iframe, esta camada prepara o projeto para sair do OSONE já
 * testável com `npm install` + `npm run dev`.
 */

export interface AnaliseFullstackDoCode {
  temFrontend: boolean;
  temBackend: boolean;
  temShared: boolean;
  temFullstack: boolean;
  temPackageJson: boolean;
  temGitignore: boolean;
  temGuiaDeExecucao: boolean;
  entradaFrontend?: string;
  entradaBackend?: string;
  comandoInstalar: string;
  comandoRodar: string;
  urlLocal: string;
}

export interface ArquivoDeSuporteFullstack {
  name: string;
  language: string;
  content: string;
}

const PORTA_PADRAO_FULLSTACK = 3001;

function existe(arquivos: CodeRepositoryFile[], caminho: string): boolean {
  const alvo = chaveDeCaminho(caminho);
  return arquivos.some(a => chaveDeCaminho(a.name || '') === alvo);
}

function primeiroCaminho(arquivos: CodeRepositoryFile[], candidatos: string[]): string | undefined {
  for (const candidato of candidatos) {
    const achado = arquivos.find(a => chaveDeCaminho(a.name || '') === chaveDeCaminho(candidato));
    if (achado) return normalizarCaminhoDoCode(achado.name || candidato);
  }
  return undefined;
}

function primeiroPorPadrao(arquivos: CodeRepositoryFile[], padrao: RegExp): string | undefined {
  const achado = arquivos.find(a => padrao.test(a.name || ''));
  return achado ? normalizarCaminhoDoCode(achado.name || '') : undefined;
}

export function analisarFullstackDoCode(arquivos: CodeRepositoryFile[]): AnaliseFullstackDoCode {
  const lista = Array.isArray(arquivos) ? arquivos : [];

  const entradaFrontend = primeiroCaminho(lista, [
    'frontend/index.html',
    'public/index.html',
    'src/main.tsx',
    'src/main.ts',
    'src/main.jsx',
    'src/main.js',
    'src/App.tsx',
    'src/App.jsx',
    'index.html'
  ]) || primeiroPorPadrao(lista, /(^|\/)index\.html?$/i);

  const entradaBackend = primeiroCaminho(lista, [
    'server/api.js',
    'server/index.js',
    'server/server.js',
    'api/index.js',
    'server.ts',
    'server.js',
    'app.ts',
    'app.js'
  ]) || primeiroPorPadrao(lista, /^(server|api)\/.*\.(ts|js|mjs)$/i);

  const temFrontend = !!entradaFrontend || lista.some(a => /^(frontend|public|src)\//i.test(a.name || ''));
  const temBackend = !!entradaBackend || lista.some(a => /^(server|api)\//i.test(a.name || ''));
  const temShared = lista.some(a => /^shared\//i.test(a.name || ''));
  const temPackageJson = existe(lista, 'package.json');
  const temGitignore = existe(lista, '.gitignore');
  const temGuiaDeExecucao = existe(lista, 'RODAR_FULLSTACK.md');

  return {
    temFrontend,
    temBackend,
    temShared,
    temFullstack: temBackend || (temFrontend && temShared),
    temPackageJson,
    temGitignore,
    temGuiaDeExecucao,
    entradaFrontend,
    entradaBackend,
    comandoInstalar: 'npm install',
    comandoRodar: 'npm run dev',
    urlLocal: `http://localhost:${PORTA_PADRAO_FULLSTACK}`
  };
}

function slugDoProjeto(nomeDoProjeto: string): string {
  const limpo = (nomeDoProjeto || 'osone-code-app')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return limpo || 'osone-code-app';
}

export function montarPackageJsonFullstack(
  nomeDoProjeto: string,
  analise: AnaliseFullstackDoCode
): string {
  const entrada = analise.entradaBackend || 'server/api.js';
  const usaTypeScript = /\.(ts|tsx)$/i.test(entrada);
  const pacote: Record<string, any> = {
    name: slugDoProjeto(nomeDoProjeto),
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: usaTypeScript ? `tsx ${entrada}` : `node ${entrada}`,
      start: usaTypeScript ? `tsx ${entrada}` : `node ${entrada}`
    },
    dependencies: {
      express: '^4.21.2'
    }
  };

  if (usaTypeScript) pacote.devDependencies = { tsx: '^4.21.0', typescript: '^5.8.2' };
  return `${JSON.stringify(pacote, null, 2)}\n`;
}

export function montarGuiaDeExecucaoFullstack(
  nomeDoProjeto: string,
  analise: AnaliseFullstackDoCode
): string {
  const frontend = analise.entradaFrontend || 'frontend/index.html';
  const backend = analise.entradaBackend || 'server/api.js';
  return `# Rodar o projeto fullstack

Projeto: ${nomeDoProjeto || 'Projeto OSONE CODE'}

## O que o OSONE CODE faz aqui

- O preview do OSONE roda o frontend diretamente: \`${frontend}\`.
- O backend Node/Express fica em \`${backend}\`.
- Ao exportar/publicar no GitHub, as pastas reais são preservadas.

## Como testar fora do OSONE

Depois de baixar o ZIP, descompacte a pasta e rode:

\`\`\`bash
${analise.comandoInstalar}
${analise.comandoRodar}
\`\`\`

Depois abra:

\`\`\`text
${analise.urlLocal}
\`\`\`

Observação honesta: backend não roda dentro do iframe do preview, porque precisa de processo Node
e porta local. O OSONE prepara o pacote para rodar no seu PC, instalador, AppImage ou GitHub.
`;
}

export function arquivosDeSuporteFullstack(
  arquivos: CodeRepositoryFile[],
  nomeDoProjeto: string
): ArquivoDeSuporteFullstack[] {
  const analise = analisarFullstackDoCode(arquivos);
  if (!analise.temBackend) return [];

  const suporte: ArquivoDeSuporteFullstack[] = [];

  if (!analise.temPackageJson) {
    suporte.push({
      name: 'package.json',
      language: 'json',
      content: montarPackageJsonFullstack(nomeDoProjeto, analise)
    });
  }

  if (!analise.temGitignore) {
    suporte.push({
      name: '.gitignore',
      language: 'markdown',
      content: `node_modules/
dist/
.env
.env.local
npm-debug.log*
`
    });
  }

  if (!analise.temGuiaDeExecucao) {
    suporte.push({
      name: 'RODAR_FULLSTACK.md',
      language: 'markdown',
      content: montarGuiaDeExecucaoFullstack(nomeDoProjeto, analise)
    });
  }

  return suporte;
}
