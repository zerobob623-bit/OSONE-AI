import express from 'express';
import { registerBillingApi, registerBillingWebhook } from '../src/billingService';

/**
 * Função serverless pequena e exclusiva da cobrança.
 *
 * Importar o servidor inteiro do OSONE para abrir o Checkout carregava WebSocket, WhatsApp,
 * ffmpeg, Vite e o Agente Local dentro de uma função efêmera da Vercel. Além de desnecessário,
 * qualquer incompatibilidade de um desses módulos derrubava também `/api/billing/config` com
 * FUNCTION_INVOCATION_FAILED. Esta função carrega somente Stripe e Firebase Admin.
 */
const billingApp = express();
registerBillingWebhook(billingApp);
billingApp.use(express.json({ limit: '1mb' }));
registerBillingApi(billingApp);

export default function handler(req: any, res: any) {
  // O rewrite /api/billing/:path* -> /api/billing preserva o curinga em `path`. Reconstruímos a
  // URL que o router Express já usa localmente; chamadas diretas mantêm a URL original.
  const queryPath = req.query?.path ?? new URL(req.url || '/', 'http://osone.local').searchParams.get('path');
  const capturedPath = Array.isArray(queryPath) ? queryPath.join('/') : queryPath;
  if (capturedPath) req.url = `/api/billing/${String(capturedPath).replace(/^\/+/, '')}`;
  return billingApp(req, res);
}
