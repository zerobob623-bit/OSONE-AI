import fs from 'node:fs';

const ler = caminho => fs.readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const app = ler('src/App.tsx');
const gate = ler('src/components/LegalConsentGate.tsx');
const regras = ler('firestore.rules');
const workflow = ler('.github/workflows/release.yml');

const testes = [
  ['porta legal envolve o app autenticado', app.includes('<LegalConsentGate user={user}')],
  ['versão legal é explícita', gate.includes("LEGAL_VERSION = '2026-08-08'")],
  ['termos e privacidade exigem aceites separados', gate.includes('termosAceitos') && gate.includes('privacidadeAceita')],
  ['aceite usa horário do servidor', gate.includes('acceptedAt: serverTimestamp()')],
  ['cotas externas são explicadas', gate.includes('O fim de uma cota externa não significa')],
  ['plano pago não é vendido como crédito de API', gate.includes('não vende cotas, créditos ou capacidade dessas APIs')],
  ['movimentação financeira pelo agente continua proibida', gate.includes('não conclui pagamentos, PIX, transferências')],
  ['regra permite somente criação do próprio aceite', regras.includes('match /legalAcceptances/{userId}/versions/{version}') && regras.includes('allow update, delete: if false')],
  ['horário precisa coincidir com request.time', regras.includes('request.resource.data.acceptedAt == request.time')],
  ['release exige as quatro variáveis legais', [
    'VITE_OSONE_LEGAL_PROVIDER_NAME',
    'VITE_OSONE_LEGAL_PROVIDER_REGISTRATION',
    'VITE_OSONE_LEGAL_PROVIDER_ADDRESS',
    'VITE_OSONE_LEGAL_CONTACT',
  ].every(nome => workflow.includes(nome))],
  ['nenhum CPF foi gravado no fonte', !/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test([app, gate, regras, workflow].join('\n'))],
];

let falhas = 0;
for (const [nome, passou] of testes) {
  console.log(`${passou ? '✓' : '✗'} ${nome}`);
  if (!passou) falhas += 1;
}
if (falhas) process.exit(1);
console.log(`\n${testes.length}/${testes.length} verificações legais passaram.`);
