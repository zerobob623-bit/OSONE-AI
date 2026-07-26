# OSONE - Inteligência Artificial & Automação Tuya Cloud

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
