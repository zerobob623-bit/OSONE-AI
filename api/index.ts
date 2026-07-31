import { createRequire } from "module";

// Usa require() (CommonJS de verdade) em vez de "import ... from '../server'" por dois
// motivos, ambos confirmados como causa real de falha em produção na Vercel:
//
// 1. "../server" apontava pro arquivo-fonte TypeScript (server.ts). Como este projeto tem
//    "type": "module" no package.json, o runtime da Vercel trata o import como ESM nativo —
//    que exige extensão explícita nos imports relativos. Sem ela, o resolvedor do Node falha
//    com ERR_MODULE_NOT_FOUND ("Cannot find module '/var/task/server'") antes mesmo de rodar
//    uma linha do servidor, derrubando TODAS as rotas da API (não só WhatsApp/Agente Local).
// 2. dist/server.cjs (gerado por "npm run build") é o bundle CommonJS já testado e usado pelo
//    app desktop/self-host. Importar esse arquivo via "import" ESM nativo (em vez de
//    require()) causa um problema diferente: o Node encapsula todo o module.exports do
//    CommonJS dentro de mais um ".default", resultando em "appPromise" apontando pro objeto
//    errado. require() devolve exports.default diretamente, sem essa camada extra.
// Bundle gerado por "npm run build:vercel" numa pasta separada de "dist" de propósito: "dist"
// é o outputDirectory público servido como arquivo estático pela Vercel — se o bundle do
// servidor caísse lá dentro, qualquer pessoa poderia baixar todo o código do backend
// acessando a URL diretamente (ex: seusite.vercel.app/server.cjs).
const require = createRequire(import.meta.url);
const serverModule = require("../server-build/server.cjs");
const appPromise: Promise<any> = serverModule.default;

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}
