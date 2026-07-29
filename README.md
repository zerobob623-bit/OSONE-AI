# OSONE - Sua Inteligência Artificial Geral & AUTOMAÇÃO

Este projeto integra o OSONE (baseado em React, Express e Google Gemini) com a plataforma oficial **Tuya Cloud IoT Platform (Tuya OpenAPI)** para controle seguro de dispositivos físicos reais.

---

## ⚡ Configuração de Variáveis de Ambiente (Tuya Cloud API)

A integração com a Tuya Cloud roda **exclusivamente no backend** (`server.ts` / `tuyaService.ts`). Nenhuma chave ou secret é exposta ao navegador/frontend.

### 🔑 As 4 Variáveis Obrigatórias
- `TUYA_CLIENT_ID`: Access ID do seu Cloud Project na Tuya.
- `TUYA_CLIENT_SECRET`: Access Secret do seu Cloud Project na Tuya.
- `TUYA_BASE_URL`: URL base do endpoint OpenAPI da sua região (ex: `https://openapi.tuyaus.com` para Américas, `https://openapi.tuyacn.com` para Europa, `https://openapi.tuyacn.com` para Ásia).
- `TUYA_USER_UID`: UID da sua conta vinculada no app Smart Life / Tuya Smart.

---

### 💻 Como Rodar Localmente

1. Copie o arquivo de exemplo para o seu ambiente local:
   ```bash
   cp .env.example .env.local
   ```
2. Abra o arquivo `.env.local` e preencha as variáveis obtidas no painel da **Tuya IoT Platform** ([iot.tuya.com](https://iot.tuya.com)):
   - **Access ID & Access Secret**: Acesse `Cloud` > `Development` > `Cloud Project` > `Overview`.
   - **User UID**: Acesse `Devices` > `Link Tuya App Account` no seu projeto Cloud para copiar o UID do usuário.
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

> 🚨 **ATENÇÃO DE SEGURANÇA CRÍTICA:**  
> O arquivo `.env.local` contém credenciais e segredos reais e **NUNCA DEVE SER COMMITADO AO GIT**. Ele já está devidamente listado no arquivo `.gitignore`.

---

### 🚀 Como Configurar no Deploy da Vercel

Ao implantar este projeto na **Vercel**, você **NÃO** precisa enviar nenhum arquivo `.env`.

1. Acesse o painel da sua aplicação na Vercel.
2. Navegue até **Project Settings** > **Environment Variables**.
3. Adicione as 4 variáveis de ambiente:
   - `TUYA_CLIENT_ID`
   - `TUYA_CLIENT_SECRET`
   - `TUYA_BASE_URL` (ex: `https://openapi.tuyaus.com`)
   - `TUYA_USER_UID`
4. Salve e re-faça o deploy. A Vercel injetará automaticamente as variáveis no `process.env` do ambiente serverless.

---

### ⚠️ Limitação Conhecida: Voz em Tempo Real (Gemini Live / ElevenLabs) na Vercel

A Vercel roda `server.ts` como uma função serverless (`api/index.ts`), que **não suporta conexões WebSocket de longa duração**. Isso afeta diretamente os proxies `/api/live-ws` (Gemini Live) e `/api/elevenlabs-ws` (ElevenLabs), além da função "Transferir para Celular" (handoff), que dependem desse tipo de conexão.

- **ElevenLabs**: já resolvido. Se o usuário configurar sua **própria chave da ElevenLabs** em Configurações do app, o navegador conecta **direto** na ElevenLabs (`wss://api.elevenlabs.io/...`), sem passar pelo nosso backend — funciona normalmente na Vercel. Sem chave própria, o app cai no proxy do backend usando a `ELEVENLABS_API_KEY` do `.env`/Vercel, que só funciona em hospedagem com servidor persistente (local, Electron, ou self-host fora da Vercel).
- **Gemini Live**: já resolvido, com o mesmo princípio. Com **chave própria do Gemini** configurada em Configurações, o navegador conecta direto na API do Gemini (`src/lib/live-bridge.ts`) e funciona em qualquer hospedagem, inclusive Vercel. Sem chave própria, cai no proxy `/api/live-ws` do backend usando a `GEMINI_API_KEY` do servidor — só funciona com servidor persistente (não na Vercel). **Importante**: o backend nunca devolve a chave do servidor para o navegador em nenhum dos dois casos — se você não configurar sua própria chave, a voz em tempo real simplesmente não fica disponível na Vercel, em vez de expor a chave do `.env` para qualquer visitante do app.
- **Handoff entre dispositivos** ("Transferir para Celular"): ainda depende do proxy WebSocket do backend e **não funciona quando deployado na Vercel** — funciona normalmente local, no Electron, ou em qualquer hospedagem com servidor Node persistente.
