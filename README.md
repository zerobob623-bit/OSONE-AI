# OSONE - Sua Inteligência Artificial Geral & AUTOMAÇÃO

Este projeto integra o OSONE (baseado em React, Express e Google Gemini) com a plataforma oficial **Tuya Cloud IoT Platform (Tuya OpenAPI)** para controle seguro de dispositivos físicos reais, e faz a ponte desses mesmos aparelhos com o **Google Assistente / Google Home**.

---

## 🏠 OSONE HOME — a aba da casa

Tudo que é automação residencial vive na aba **OSONE HOME**. Ela tem quatro seções:

| Seção | O que faz |
| --- | --- |
| **Aparelhos** | Os aparelhos reais da sua conta Tuya, com o estado lido do próprio aparelho. Liga/desliga, brilho e cor aparecem só em quem realmente os tem. |
| **Cenas** | Guarda o estado atual dos aparelhos e o repõe depois, com comandos reais. |
| **Google Home** | Estado do vínculo com o Assistente, as URLs para colar no Actions on Google, a lista exata do que o Assistente enxerga e o motivo de cada aparelho que ficou de fora. |
| **Organizar PC** | Gera o script Python de organização de arquivos do computador. |

O mesmo aparelho responde no painel, no chat de texto, na voz do OSONE e no Google Assistente — os quatro caminhos passam pela **mesma** tradução de comandos (`src/lib/tuyaDispositivos.ts`), então nenhum deles promete um recurso que o aparelho não tem.

> 🔒 **Fechaduras**: nunca são acionadas por voz e nunca são entregues ao Google Assistente. No chat de texto, exigem confirmação humana explícita num modal. Um toque no painel também não as aciona.

---

## 🔑 Onde colocar as credenciais

Há **dois caminhos**, e o que você preenche pela tela **ganha** da variável de ambiente (apagar o campo devolve o valor do ambiente, se houver).

### 1. Pela tela do app — o caminho normal

**Configurações (⚙️) > Automação**. Cada serviço tem o seu cartão, com os seus campos:

- **Tuya Cloud IoT Platform** — Access ID, Access Secret, endereço da região e UID da conta.
- **Google Home** — Client ID e Client Secret (opcional; só se você quiser comandar por voz do Google).

Clique em **Salvar** e pronto: **vale na hora, sem reiniciar o OSONE**. O botão "Verificar Configuração Tuya" testa a conexão de verdade ali mesmo, e o do Google Home percorre a corrente inteira (credenciais → Tuya → vínculo) e para no primeiro elo que falta.

Onde os valores ficam:
- Gravados em `credenciais-osone.json`, **do lado do servidor**, com permissão `0600` (só o dono lê). No app instalado, na pasta de dados do usuário; rodando pelo código, na pasta do projeto. Está no `.gitignore`.
- **O segredo nunca volta para o navegador.** A tela recebe apenas "está preenchido" e os últimos 4 caracteres.
- As rotas `/api/credenciais` respondem **só à própria máquina**. Numa hospedagem remota (Vercel) a tela avisa e manda usar as variáveis de ambiente do provedor, que é o lugar certo delas ali.

### 2. Por variável de ambiente — para deploy

Use quando o OSONE roda numa hospedagem (Vercel, servidor próprio), onde não há uma "própria máquina" para preencher pela tela.

---

## ⚡ As Variáveis de Ambiente (Tuya Cloud API)

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

## 🗣️ Google Home / Google Assistente

A ponte é real: o Assistente fala com as rotas deste servidor, que por sua vez comandam os **mesmos** aparelhos Tuya do painel. Não há simulação em nenhum ponto.

### O que o Assistente recebe

O OSONE lê os pontos de dados de cada aparelho e anuncia **só o que ele realmente aceita**:

| Recurso do aparelho | Trait entregue ao Google | Exemplo de comando |
| --- | --- | --- |
| liga/desliga | `OnOff` | "Ok Google, acende a sala" |
| brilho | `Brightness` | "Ok Google, põe a sala em 30%" |
| cor | `ColorSetting` (`colorModel: hsv`) | "Ok Google, deixa a sala azul" |

Ficam **de fora**, com o motivo visível na aba Google Home: fechaduras (regra de segurança), aparelhos sem um liga/desliga que o OSONE saiba usar (sensores e afins) e aparelhos cujo estado não foi possível ler.

### Como vincular

Esta parte só pode ser feita por você — criar projeto no Google não é algo que o código faça.

1. Crie um projeto em [console.actions.google.com](https://console.actions.google.com) e escolha o tipo **Smart Home**.
2. Em **Account Linking**, invente um Client ID e um Client Secret (eles são *seus*, não emitidos pelo Google) e cole as 3 URLs que a aba **OSONE HOME > Google Home** mostra:
   - Authorization URL: `https://SEU-DOMINIO/api/google-home/authorize`
   - Token URL: `https://SEU-DOMINIO/api/google-home/token`
   - Fulfillment URL: `https://SEU-DOMINIO/api/google-home/fulfillment`
3. Cole esse mesmo par em **Configurações > Automação > Google Home** (ou defina `GOOGLE_HOME_CLIENT_ID` / `GOOGLE_HOME_CLIENT_SECRET`).
4. Habilite a **HomeGraph API** no projeto do Google Cloud vinculado.
5. No app Google Home do celular: **+ > Configurar dispositivo > "Funciona com o Google"**, procure seu projeto de teste e autorize.
6. Volte à aba Google Home e clique em **Reconferir** — o cartão passa a dizer "Vinculada".

> ⚠️ **O Google só alcança endereço público em HTTPS.** Ele não entra em `localhost` nem na sua rede local, então o vínculo exige o OSONE publicado num domínio (a Vercel serve) ou exposto por um túnel. O painel, o chat e a voz do próprio OSONE funcionam localmente de qualquer jeito.

### Limites conhecidos desta ponte

- **Sem Report State**: quando alguém aperta o interruptor na parede, o OSONE não avisa o Google por conta própria — isso exigiria uma chave de conta de serviço do Google Cloud que só você pode emitir. Por isso os aparelhos são anunciados com `willReportState: false`, o que faz o Assistente **perguntar** o estado antes de responder, em vez de repetir um valor guardado.
- **Sem temperatura de cor**: a Tuya não informa a faixa de Kelvin do aparelho, e mapear isso seria adivinhação. O painel também não oferece, então os dois seguem iguais.
- **Vínculo em disco**: os tokens ficam em `google-home-tokens.json` (modo `0600`, no `.gitignore`), ao lado dos outros dados locais. Numa hospedagem com disco efêmero, o vínculo pode precisar ser refeito após um redeploy.

### Conferindo sem aparelho nenhum

```bash
node scripts/conferir-google-home.mjs   # o que o Assistente recebe e consegue mandar
node scripts/conferir-casa.mjs          # o que o painel e o chat mandam ao aparelho
node scripts/conferir-credenciais.mjs   # preenchimento pela tela e sigilo do segredo
```

---

### ⚠️ Limitação Conhecida: Voz em Tempo Real (Gemini Live / ElevenLabs) na Vercel

A Vercel roda `server.ts` como uma função serverless (`api/index.ts`), que **não suporta conexões WebSocket de longa duração**. Isso afeta diretamente os proxies `/api/live-ws` (Gemini Live) e `/api/elevenlabs-ws` (ElevenLabs), além da função "Transferir para Celular" (handoff), que dependem desse tipo de conexão.

- **ElevenLabs**: já resolvido. Se o usuário configurar sua **própria chave da ElevenLabs** em Configurações do app, o navegador conecta **direto** na ElevenLabs (`wss://api.elevenlabs.io/...`), sem passar pelo nosso backend — funciona normalmente na Vercel. Sem chave própria, o app cai no proxy do backend usando a `ELEVENLABS_API_KEY` do `.env`/Vercel, que só funciona em hospedagem com servidor persistente (local, Electron, ou self-host fora da Vercel).
- **Gemini Live**: já resolvido, com o mesmo princípio. Com **chave própria do Gemini** configurada em Configurações, o navegador conecta direto na API do Gemini (`src/lib/live-bridge.ts`) e funciona em qualquer hospedagem, inclusive Vercel. Sem chave própria, cai no proxy `/api/live-ws` do backend usando a `GEMINI_API_KEY` do servidor — só funciona com servidor persistente (não na Vercel). **Importante**: o backend nunca devolve a chave do servidor para o navegador em nenhum dos dois casos — se você não configurar sua própria chave, a voz em tempo real simplesmente não fica disponível na Vercel, em vez de expor a chave do `.env` para qualquer visitante do app.
- **Handoff entre dispositivos** ("Transferir para Celular"): ainda depende do proxy WebSocket do backend e **não funciona quando deployado na Vercel** — funciona normalmente local, no Electron, ou em qualquer hospedagem com servidor Node persistente.
