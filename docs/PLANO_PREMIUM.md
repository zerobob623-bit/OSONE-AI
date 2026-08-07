# PLANO DE MONETIZAÇÃO DO OSONE — VIP / PREMIUM

## DECISÃO IMPLEMENTADA — AGOSTO DE 2026

As propostas históricas abaixo permanecem como estudo, mas o catálogo ativo do aplicativo é:

| Plano | Mensal | Anual | Recursos pagos |
|---|---:|---:|---|
| **Grátis** | R$ 0 | R$ 0 | Núcleo completo: chat, voz, Hands-Free, CODE e Agente Local para controlar o PC |
| **Plus** | R$ 39,90 | R$ 399 | OSONE HEAR + OSONE COWORK (cliques e escrita no navegador) |
| **Pro** | R$ 69,90 | R$ 699 | Tudo do Plus + OSONE ZAP |

O controle local comum (`controlar_pc`) continua gratuito. Apenas o laço autônomo COWORK de
navegador é pago. A implementação usa Stripe Checkout/Customer Portal, Firebase Authentication,
webhook assinado e `entitlements/{uid}` sem permissão de escrita pelo cliente. Os valores e a
distribuição desta seção substituem preços e combinações exploratórias que aparecem mais abaixo.

Como transformar o OSONE em produto com mensalidade: o que vender, como o dinheiro chega até
você, e o que precisa ser construído dentro do app.

> **Sobre os números deste documento:** preços de gateway, teto do MEI e regras de Pix mudam com
> frequência. Todo valor aqui é ordem de grandeza para você decidir a estratégia — confirme cada
> um no site do provedor antes de assinar contrato ou anunciar preço.

---

## 1. O ponto de partida: três fatos do código que decidem tudo

Antes de escolher plano ou preço, é preciso encarar como o OSONE funciona hoje. Estes três fatos
não são detalhe técnico: eles determinam o que dá e o que não dá para vender.

### 1.1. O servidor roda na máquina do usuário

`electron/main.js:203` carrega o `dist/server.cjs` **dentro do processo principal do Electron**. O
Express, as rotas `/api/*`, o WhatsApp, o Tuya — tudo roda no computador de quem instalou.

**Consequência:** qualquer `if (usuarioEhPremium)` escrito no `server.ts` ou no `App.tsx` roda em
hardware que o usuário controla. Ele pode editar o bundle. Isso não é motivo para desistir — é
motivo para escolher direito **o que** vira premium (ver seção 2).

### 1.2. A chave da IA é do usuário (BYOK)

O app manda `clientApiKey: apiKeys.gemini` em toda chamada (16 lugares no `App.tsx`, 24 no
`server.ts`). O `GEMINI_API_KEY` do servidor é só reserva.

**Consequência boa:** hoje seu custo por usuário é **zero**. Mil usuários gratuitos não te custam
nada.
**Consequência ruim:** exigir que a pessoa crie uma conta no Google AI Studio, gere uma chave e
cole nas configurações é a maior barreira de entrada que existe. A maioria das pessoas desiste
aí. **Isso é a sua melhor oportunidade de venda** — ver plano VIP.

### 1.3. Já existe conta, e já existe nuvem por usuário

`Firebase Auth` (login Google) + Firestore em `users/{uid}`, com sincronização de chaves, memória
e histórico (`src/App.tsx:3116`). **A infraestrutura de identidade que uma assinatura precisa já
está pronta.** Você não começa do zero: começa de um app que já sabe quem é cada pessoa.

### 1.4. E um problema de segurança que precisa ser resolvido ANTES

O `firestore.rules` atual dá **escrita completa** ao próprio usuário:

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Está correto para o que existe hoje (são os dados dele). Mas se você gravar `plano: "premium"`
nesse mesmo documento, **qualquer pessoa se promove sozinha pelo console do navegador**, em uma
linha. A assinatura precisa morar em um documento que o usuário **lê mas não escreve** (seção 6).

---

## 2. A decisão mais importante: o que exatamente é "premium"

Existem dois caminhos, e a diferença entre eles é a diferença entre um negócio que funciona e um
que vaza.

### ❌ Caminho A — travar o que já roda na máquina dele

"O Enxame OSONE CODE agora é só para assinantes." O código do Enxame está no computador da
pessoa, usando a chave dela, gastando a cota dela. A trava é uma linha de `if`. Quem quiser
burlar, burla; quem não souber, fica irritado com uma função que já funcionava.

Serve como **complemento** (a maioria paga em vez de mexer no bundle), nunca como base.

### ✅ Caminho B — premium é aquilo que VOCÊ hospeda

Se a função depende de um servidor **seu**, com uma chave **sua**, a cobrança se cumpre sozinha:
sem assinatura ativa, o servidor simplesmente não responde. Não há o que burlar, porque o valor
não está na máquina do cliente.

**Este é o eixo do plano.** Cada função paga abaixo foi escolhida por ser algo que só existe se
você hospedar.

| Função premium | Por que ela se cobra sozinha |
|---|---|
| **IA sem chave própria** | A chave é sua, no seu servidor, com sua cota |
| **OSONE ZAP 24h** | O WhatsApp fica no seu servidor, não no PC dele (que ele desliga à noite) |
| **Vozes premium (ElevenLabs)** | Conta e cota ElevenLabs suas |
| **Backup e projetos na nuvem** | Armazenamento seu |
| **Acesso remoto / celular ↔ PC** | Ponte pelo seu servidor |
| **Geração de imagem e vídeo** | Cota paga sua |

---

## 3. Os planos

### 🆓 OSONE LIVRE — R$ 0

Exatamente o que o app é hoje. Nada é tirado de quem já usa — isso é inegociável, tirar função de
graça queima a reputação que você já construiu.

- Tudo roda na máquina, com **chave própria** do usuário
- OSONE CODE completo (5 projetos, Enxame, Hunter, preview, Python)
- Casa inteligente, TikTok Live, voz local (Piper), imagem, biblioteca, memória
- Agente local passo a passo (abrir programa, criar pasta — uma ação por vez, com confirmação)
- **Amostra** de OSONE COWORK e OSONE ZAP — ver seção 3-B
- Sincronização básica de configurações

**Papel no negócio:** é o seu marketing. Um usuário livre não te custa nada e é quem experimenta,
gosta e converte.

### ⭐ OSONE VIP — R$ 39/mês (ou R$ 390/ano)

**A promessa em uma frase: funciona sem você precisar de chave nenhuma.**

- ✅ **IA incluída** — sem criar conta no AI Studio, sem colar chave, sem cota que acaba
  (cota generosa: ~1.500 gerações/mês, o suficiente para uso pessoal intenso)
- ✅ **Vozes premium ElevenLabs** incluídas (~100 mil caracteres/mês)
- ✅ **Backup na nuvem** de todos os projetos do OSONE CODE, com histórico de versões
- ✅ **Geração de imagem e vídeo** com cota mensal
- ✅ **Selo VIP** na interface e suporte prioritário

**Por que R$ 39:** é o preço de "um streaming a mais", a faixa em que a pessoa decide sozinha sem
pedir autorização para ninguém. E é 3–4× o seu custo de IA por usuário ativo.

### 💎 OSONE PREMIUM — R$ 149/mês (ou R$ 1.490/ano)

**A promessa: o OSONE trabalha mesmo com seu computador desligado.**

Tudo do VIP, mais:

- ✅ **OSONE ZAP hospedado 24/7** — o número de WhatsApp atende sozinho, dia e noite, no seu
  servidor. **Esta é a função que mais vende**, porque é a única com retorno financeiro direto e
  óbvio para quem compra: um vendedor que não dorme.
- ✅ **Até 3 números** de WhatsApp
- ✅ **Cota de IA 5× maior**
- ✅ **Acesso remoto** — abrir o OSONE de qualquer lugar, com os projetos e a memória lá
- ✅ **Casa inteligente sempre ligada** (ponte Google Home no seu servidor, não no PC dele)
- ✅ **Relatórios de atendimento** do ZAP

### 🏢 OSONE BUSINESS — a partir de R$ 499/mês

Para quem vende com o OSONE, não só usa.

- Múltiplos usuários na mesma conta
- Base de conhecimento compartilhada entre a equipe
- Nota fiscal, contrato, SLA
- Onboarding assistido

---

## 3-B. O mapa grátis × pago (decisão: COWORK e ZAP são pagos)

### 3-B.1. Por que essas duas são a escolha certa

A seção 2 diz que premium deveria ser o que você hospeda. COWORK e ZAP rodam na máquina do
usuário — então a trava neles é frouxa (seção 3-B.4). Ainda assim **são as duas melhores escolhas
do app**, por um motivo que pesa mais que a trava:

**São as únicas duas funções que dão dinheiro ou tempo de volta para quem compra.**

| Função | O que a pessoa ganha | Ela paga? |
|---|---|---|
| OSONE ZAP | Um vendedor que atende 24h e não dorme | **Sim** — se fechar um cliente a mais no mês, já se pagou |
| OSONE COWORK | Uma sequência de trabalho repetitivo feita sozinha | **Sim** — é hora de trabalho devolvida toda semana |
| OSONE CODE | Um editor com IA muito bom | Difícil — tem alternativa grátis conhecida em todo lugar |
| Casa inteligente | Conveniência | Não — é bonito, não é dor |

Ninguém assina por conveniência. Assina por **dor** e por **retorno**. ZAP e COWORK são as duas
únicas do OSONE com dor clara e retorno mensurável. A escolha está certa.

E tem um segundo motivo, que é de produto: são funções **avançadas**. Quem está conhecendo o app
não sente falta delas. Cobrar por elas não estraga a primeira impressão de ninguém — enquanto
cobrar pelo OSONE CODE ou pelo chat estragaria.

### 3-B.2. ⚠️ O erro a não cometer: tirar o que já está solto

**As duas já estão publicadas e funcionando de graça.** Quem instalou o OSONE hoje tem as duas.

Transformar uma função existente em paga da noite para o dia é a forma mais rápida de queimar a
confiança que você levou meses construindo. Quem já usava vai sentir que perdeu algo, e essa
pessoa é justamente a que mais falaria bem do seu app.

**Três saídas, e a terceira é a boa:**

1. ❌ Bloquear para todo mundo — queima quem já está com você
2. 🟡 Liberar para sempre quem já instalou (*grandfathering*) — justo, mas você não sabe quem é
   "quem já instalou", e complica o código para sempre
3. ✅ **Amostra generosa, sem data para acabar** — a função continua existindo para todos, com
   limite mensal. Ninguém perde nada; quem usa de verdade bate no limite e assina.

### 3-B.3. O mapa

#### 🆓 Continua grátis para sempre

| Função | Por quê |
|---|---|
| Chat, voz, memória, handoff PC↔celular | É o coração. Cobrar aqui mata o app. |
| **OSONE CODE inteiro** (Enxame, Hunter, Python, preview, busca) | É o que atrai e o que te diferencia. É a vitrine. |
| Casa inteligente (Tuya, Google Home) | Conveniência: ninguém paga, e o custo é zero |
| TikTok Live | Nicho pequeno; não sustenta plano |
| Geração de imagem | Já é grátis hoje e documentado assim |
| Biblioteca, Wellness, Lousa, Dossiê | Complementos; sozinhos não vendem |
| Agente local **passo a passo** | Abrir programa, criar pasta, uma ação por vez com confirmação |

#### 💰 Vira pago — com amostra

| Função | Amostra grátis (mensal) | No plano pago |
|---|---|---|
| **OSONE COWORK** | **5 sequências automáticas/mês** | Ilimitado |
| **OSONE ZAP** | **1 número, 30 mensagens/dia** | Ilimitado, até 3 números, base de conhecimento maior, relatórios |
| **Geração de vídeo (Veo)** | 3 vídeos curtos/mês | Cota mensal maior |

**Por que a amostra precisa ser generosa nestas duas em especial:** COWORK e ZAP são funções que
só se entendem **vendo funcionar**. Descrever "o agente executa uma sequência sozinho" não vende
nada; ver o computador fazendo dez cliques certos sozinho vende na hora. Um muro seco na frente
disso ("assine para usar") desperdiça o melhor argumento de venda que você tem.

5 sequências e 30 mensagens/dia são o bastante para a pessoa **ver o valor** e não o bastante para
ela **operar um negócio**. É exatamente essa a linha.

> Sobre o vídeo: o `FEATURES.md` registra que a geração custa ~US$ 0,03/s de verdade. Essa é a
> única função do app que já hoje gasta dinheiro real por uso — ela **precisa** de limite,
> independente de plano.

#### 📦 O plano que junta tudo

**OSONE PRO — R$ 49/mês**: COWORK ilimitado + ZAP ilimitado + vídeo com cota.

Este plano **não depende de CNPJ nem de servidor hospedado**. É o primeiro que dá para lançar, e
convive com os planos VIP/PREMIUM da seção 3 quando eles chegarem (o VIP resolve chave de API; o
PRO libera automação — quem quiser os dois, assina o PREMIUM).

### 3-B.4. Sendo honesto sobre a trava

COWORK e ZAP rodam no computador do usuário. Então:

- Um `if` na interface, sozinho, qualquer um contorna
- Mesmo a trava no `server.ts` roda na máquina dele, e o bundle pode ser editado

**O que fazer com isso: aceitar, e encarecer o contorno o suficiente.**

| Nível | Como | Esforço para burlar |
|---|---|---|
| Só na interface | `if (plano === 'pro')` no React | Trivial — console do navegador |
| **+ no servidor local** | O contador de cota vive no `server.ts`, e as rotas recusam | Precisa editar `dist/server.cjs` |
| **+ licença assinada** | Token JWT assinado com **sua chave privada**, conferido offline | Precisa editar o binário **e** entender o formato |

O terceiro nível é o alvo, e não é caro de fazer: a chave privada nunca sai do seu servidor, então
ninguém *fabrica* uma licença — só consegue arrancar a verificação editando o programa. **Quem
sabe fazer isso não ia pagar de qualquer jeito.** O que importa é que a pessoa comum, que quer
usar e não quer mexer em binário, tenha um caminho claro e barato para pagar.

A única trava realmente inviolável seria hospedar o cérebro do ZAP no seu servidor (seção 2) — e
isso continua valendo como próximo passo, para quando houver CNPJ e VPS.

### 3-B.5. O que dá para construir agora, sem CNPJ

Você não precisa de gateway, CNPJ nem servidor para deixar isto pronto. O que dá para fazer hoje:

1. **Um catálogo de planos** (`src/lib/planos.ts`) — um arquivo só que declara o que é grátis, o
   que é pago e qual a amostra de cada função. Fonte única da verdade.
2. **Contagem de uso local** — quantas sequências COWORK e quantas mensagens ZAP este mês. Serve
   de amostra depois, e **desde já te diz quanto as pessoas realmente usam** — que é a informação
   que define se 5 sequências é pouco ou muito.
3. **O portão desligado** — o componente que explica a função e mostra o botão de assinar, com uma
   chave de configuração `COBRANCA_ATIVA = false`. Tudo continua liberado; no dia do lançamento
   vira `true`.

O item 2 é o mais valioso agora: **você está definindo preço e limite no escuro.** Um mês de
contagem real e você decide com dado em vez de palpite.

---

## 4. Como o dinheiro chega até você

### 4.1. O que você precisa ter antes de qualquer código

| Item | Detalhe |
|---|---|
| **CNPJ** | MEI já basta para começar. Atenção ao **teto anual de faturamento** do MEI — passando dele, é preciso migrar para ME/Simples Nacional. Confirme o valor vigente. |
| **Conta PJ** | Nubank PJ, Inter PJ, Cora, Asaas — todas gratuitas |
| **Contador** | ~R$ 150–300/mês. Vale a partir do momento em que houver faturamento recorrente |
| **Nota fiscal** | Serviço digital recorrente exige emissão. Alguns gateways emitem automaticamente |
| **Termos de uso + política de privacidade** | Obrigatório: você vai processar dados pessoais (LGPD), e o app já sincroniza memória e conversas |

> ⚠️ **Não sou contador nem advogado.** Trate esta seção como roteiro do que perguntar a um
> profissional, não como orientação fiscal ou jurídica.

### 4.2. Qual gateway usar

| Gateway | Cartão recorrente | Pix | Precisa CNPJ? | Observação |
|---|---|---|---|---|
| **Stripe** | ✅ Excelente | ✅ | Sim | Melhor documentação e webhooks do mercado. Portal do assinante pronto. |
| **Mercado Pago** | ✅ | ✅ | Aceita CPF | Mais fácil de começar. Confiança alta do brasileiro. |
| **Asaas** | ✅ | ✅ | Sim | Feito para recorrência no Brasil. Emite NF. Taxa de Pix baixa. |
| **Pagar.me / Iugu** | ✅ | ✅ | Sim | Boas taxas em volume, integração mais trabalhosa |
| **Hotmart / Kiwify** | ✅ | ✅ | Aceita CPF | Zero código, mas taxa bem alta (~10%) e cara de infoproduto |

**Recomendação: Stripe.** O motivo não é a taxa — é que o fluxo que você precisa (assinatura +
webhook confiável + portal onde o cliente cancela e troca cartão sozinho) já vem pronto e
documentado, e isso economiza semanas. Se o CNPJ ainda não existir, comece no **Mercado Pago** e
migre depois.

**Sobre taxas:** gire em torno de **3–5% + taxa fixa** por transação no cartão, e bem menos no
Pix. Confirme os valores atuais de cada provedor — eles mudam e variam por volume.

### 4.3. Cartão, Pix ou boleto?

- **Cartão de crédito** — a espinha dorsal. É o único meio em que a cobrança se repete sozinha
  todo mês há décadas, sem o cliente fazer nada. **Comece por aqui.**
- **Pix Automático** — o Banco Central habilitou débito recorrente via Pix. Como boa parte dos
  brasileiros não tem cartão de crédito, isso pode ampliar bastante seu público. **Verifique a
  disponibilidade no seu gateway** e adicione como segunda opção.
- **Pix avulso anual** — o mais simples de todos e ótimo para caixa: R$ 390 de uma vez, você
  ativa 12 meses, e no fim do período manda um lembrete. Sem webhook complicado, sem chargeback.
  **Ofereça desde o primeiro dia.**
- **Boleto** — evite para recorrência. Inadimplência alta, compensação lenta, e a cobrança não se
  repete sozinha.

### 4.4. A grande vantagem que você tem

O OSONE é distribuído por **instalador próprio** (GitHub Releases, `electron-builder`), não pela
App Store nem pela Play Store. **Você não paga os 30% das lojas.** Uma assinatura de R$ 39 rende
para você quase R$ 37 líquidos, contra R$ 27 se fosse por loja de aplicativos.

---

## 5. Como funciona dentro do app

### 5.1. O fluxo completo, passo a passo

```
1. Pessoa clica em "Assinar VIP" no app
        ↓
2. O app abre o CHECKOUT NO NAVEGADOR EXTERNO (shell.openExternal),
   com o uid do Firebase na URL: ?client_reference_id=<uid>
        ↓
3. Ela paga (cartão ou Pix) no site do gateway
        ↓
4. O GATEWAY chama o SEU servidor: POST /webhook/assinatura
        ↓
5. Seu servidor confere a assinatura do webhook e grava no Firestore,
   com o Admin SDK, em: assinaturas/{uid}
        ↓
6. O app, que já está OUVINDO esse documento com onSnapshot,
   recebe a mudança em ~1 segundo
        ↓
7. A interface DESBLOQUEIA SOZINHA, sem a pessoa reiniciar nada
```

**O passo 2 tem um porquê:** em Electron, checkout precisa abrir no navegador do sistema, não
numa janela do app. Dentro do app, o cliente não vê o cadeado de segurança do navegador, o
autocompletar do cartão não funciona, e o 3-D Secure do banco costuma quebrar. Fora isso, você
não quer o número de cartão de ninguém passando perto do seu processo — se ele nunca toca o seu
código, o problema nunca é seu.

**O passo 6 é o que dá a sensação de mágica:** a pessoa paga no navegador, volta para o app, e
ele **já está desbloqueado**. Sem "reinicie o programa", sem "clique aqui para atualizar". Você já
usa `onSnapshot` no `firebase.ts` — a peça existe.

### 5.2. O que a pessoa vê

- **Ao tentar usar função paga sem assinar:** nunca um erro seco. Um painel que explica o que
  aquela função faz, com um botão de assinar. Função bloqueada é a melhor propaganda que existe —
  desde que ela explique o valor em vez de só dizer "não".
- **Cota chegando ao fim:** aviso em 80% ("restam 300 gerações este mês"), não só quando acaba.
  Ninguém deve descobrir o limite batendo nele.
- **Cancelar:** um link para o portal do gateway. **Cancelamento fácil reduz chargeback** — o
  cliente que não consegue cancelar não desiste, ele abre disputa no cartão, e aí você perde o
  valor e ainda leva penalidade.
- **Pagamento falhou:** 7 dias de tolerância antes de bloquear, com aviso no app. Cartão vencido
  é a causa nº 1 de cancelamento involuntário, e quase sempre a pessoa quer continuar.

---

## 6. Arquitetura técnica

### 6.1. A regra de segurança — o primeiro código a escrever

```
// firestore.rules
match /assinaturas/{userId} {
  // O app LÊ para desbloquear a interface na hora.
  allow read: if request.auth != null && request.auth.uid == userId;
  // NINGUÉM escreve pelo cliente. Só o Admin SDK, no servidor, a partir do
  // webhook do gateway — e o Admin SDK ignora estas regras por definição.
  // Sem esta linha, qualquer pessoa se promove a premium pelo console.
  allow write: if false;
}
```

Documento gravado pelo webhook:

```jsonc
// assinaturas/{uid}
{
  "plano": "vip",                          // livre | vip | premium | business
  "situacao": "ativa",                     // ativa | atrasada | cancelada
  "validoAte": "2026-09-05T00:00:00Z",
  "gateway": "stripe",
  "idAssinaturaExterna": "sub_1234",
  "cotas": { "geracoesIA": 1500, "caracteresVoz": 100000 },
  "consumo": { "geracoesIA": 213, "caracteresVoz": 4820 },
  "atualizadoEm": "2026-08-05T12:00:00Z"
}
```

### 6.2. As duas metades da verificação

Isto é o centro do desenho, e vale entender a diferença:

**Metade 1 — a interface (trava frouxa, e tudo bem).** O app lê `assinaturas/{uid}` e desabilita
botões. Serve para a experiência ser clara. Um usuário técnico contorna, e **isso não importa**,
porque nada de valor está aqui.

**Metade 2 — o seu servidor (trava real).** Toda função paga chama o **seu** servidor hospedado.
Ele verifica o Firebase ID Token que veio no cabeçalho, olha a assinatura no Firestore com o
Admin SDK, e **só então** usa a sua chave da IA. Sem assinatura ativa, responde 402 e não gasta
nada. Aqui não há o que contornar: a chave nunca sai do seu servidor.

```
Aplicativo (máquina do usuário)          SEU servidor (hospedado)
─────────────────────────────            ────────────────────────
lê assinaturas/{uid}          ─────►     confere ID Token
desabilita botões                        confere assinatura (Admin SDK)
         │                               confere cota do mês
         │                                        │
         └── chama /api/vip/gerar ───────►  usa a SUA chave Gemini
                                           debita a cota
             (trava frouxa)                    (trava real)
```

### 6.3. Onde hospedar

O `FEATURES.md` já registra que **Gemini Live e o proxy ElevenLabs precisam de servidor
persistente** e não funcionam em serverless na Vercel. O OSONE ZAP (Baileys) então é ainda mais
exigente: precisa manter WebSocket e sessão vivos indefinidamente.

| Peça | Onde | Custo aproximado |
|---|---|---|
| Site e checkout | Vercel (já usado) | Grátis |
| Webhook + API VIP | Railway, Render, Fly.io ou Cloud Run | ~US$ 5–20/mês |
| OSONE ZAP hospedado | VPS dedicada (Hetzner, Contabo, DigitalOcean) | ~US$ 6–20/mês por lote de clientes |
| Banco e auth | Firebase (já usado) | Grátis até volume alto |

**Comece com uma VPS de ~US$ 6.** Ela aguenta as primeiras dezenas de assinantes com folga, e
trocar depois é barato.

### 6.4. Arquivos a criar

```
server.ts
  + POST /api/webhook/assinatura     — recebe do gateway, valida assinatura HMAC, grava
  + GET  /api/assinatura/minha       — situação e cota da conta autenticada
  + POST /api/vip/gerar              — geração com a SUA chave (verifica plano e cota)

src/lib/assinatura.ts                — lê assinaturas/{uid} com onSnapshot; expõe podeUsar()
src/components/ModalDePlanos.tsx     — comparação dos planos e botão de assinar
src/components/SeloDoPlano.tsx       — selo VIP/PREMIUM no cabeçalho
src/components/PortaoPremium.tsx     — envolve função paga; explica o valor em vez de só travar

firestore.rules                      — coleção assinaturas/ com write: false
scripts/conferir-assinatura.mjs      — conferidor: promoção indevida, cota, tolerância, webhook
```

Uma observação sobre o último arquivo: este repositório já tem 22 conferidores
(`scripts/conferir-*.mjs`). Cobrança é exatamente o tipo de código em que uma falha silenciosa
custa dinheiro real — em qualquer direção. Vale conferir pelo menos: usuário não consegue se
promover sozinho; cota esgotada bloqueia mesmo; pagamento atrasado respeita a tolerância; webhook
repetido não credita duas vezes.

---

## 7. Roteiro de implementação

### Fase 0 — Fundação (1 semana)
- [ ] Abrir MEI e conta PJ
- [ ] Criar conta no gateway
- [ ] **Corrigir o `firestore.rules`** com a coleção `assinaturas/` (seção 6.1) — antes de tudo
- [ ] Escrever termos de uso e política de privacidade

### Fase 1 — Cobrar (2 semanas) 🎯 *Primeiro dinheiro entra aqui*
- [ ] Webhook do gateway gravando no Firestore
- [ ] `src/lib/assinatura.ts` com `onSnapshot`
- [ ] Modal de planos + selo + portão premium
- [ ] **Lançar só o VIP**, com apenas duas funções: IA sem chave própria e backup na nuvem

### Fase 2 — A função que vende sozinha (3 semanas)
- [ ] OSONE ZAP hospedado 24/7 em VPS
- [ ] Lançar o plano PREMIUM
- [ ] Painel de atendimentos

### Fase 3 — Escala (contínuo)
- [ ] Vozes premium, imagem e vídeo com cota
- [ ] Acesso remoto
- [ ] Plano Business e anual com desconto

**Por que lançar o VIP com só duas funções:** você descobre em duas semanas se as pessoas pagam,
em vez de descobrir em três meses. Se ninguém assinar por "IA sem precisar de chave", o problema
é de posicionamento ou preço — e é muito melhor saber disso antes de construir o ZAP hospedado.

---

## 8. Os números

### Custo por assinante VIP (estimativa mensal)

| Item | Custo |
|---|---|
| IA (~1.500 gerações, modelo flash) | R$ 5 – 12 |
| Vozes ElevenLabs (100 mil caracteres) | R$ 3 – 8 |
| Armazenamento e infra | R$ 1 – 2 |
| Taxa do gateway (~4%) | R$ 1,60 |
| **Total** | **≈ R$ 12 – 24** |
| **Receita** | **R$ 39** |
| **Margem** | **≈ 40 – 65%** |

### Cenários

| Assinantes | Receita/mês | Custo/mês | Sobra |
|---|---|---|---|
| 10 VIP | R$ 390 | ~R$ 180 | ~R$ 210 |
| 50 VIP | R$ 1.950 | ~R$ 900 | ~R$ 1.050 |
| 100 VIP + 20 PREMIUM | R$ 6.880 | ~R$ 2.600 | ~R$ 4.280 |
| 300 VIP + 80 PREMIUM | R$ 23.620 | ~R$ 8.500 | ~R$ 15.120 |

**O ponto que importa nesta tabela:** a cota é o que separa margem de prejuízo. Sem limite por
assinante, um único usuário pesado consome o lucro de vinte. **A cota não é mesquinharia, é o que
mantém o preço baixo para todo mundo** — e é por isso que ela precisa estar no servidor, contada
a cada chamada, e não numa variável do app.

---

## 9. Riscos, e o que fazer com cada um

| Risco | Gravidade | O que fazer |
|---|---|---|
| **Usuário se promove editando o Firestore** | 🔴 Alta | `allow write: if false` na coleção de assinaturas. Resolve por completo. |
| **Bundle do Electron adulterado** | 🟡 Média | Aceitar. Só afeta travas frouxas; o que é hospedado continua protegido. |
| **Um assinante consome cota de vinte** | 🔴 Alta | Cota contada no servidor, a cada chamada. Nunca no cliente. |
| **Webhook repetido credita duas vezes** | 🟡 Média | Guardar o id do evento; ignorar id já processado (idempotência). |
| **Chargeback** | 🟡 Média | Cancelamento em um clique; cobrança com nome reconhecível na fatura; e-mail antes de cada renovação. |
| **Google muda preço ou cota da API** | 🟡 Média | Manter o BYOK vivo no plano livre: é a sua rota de fuga se o custo da IA explodir. |
| **Banimento do WhatsApp (Baileys não é oficial)** | 🔴 Alta | Deixar **explícito nos termos** que o ZAP usa conexão não oficial e há risco de bloqueio do número. Para o plano Business, avaliar migrar para a API oficial (Cloud API da Meta). |
| **LGPD** | 🟡 Média | Política de privacidade, consentimento no primeiro acesso, e um caminho para apagar a conta. |

---

## 10. Resumo em cinco linhas

1. **Cobre por dor e retorno, não por conveniência.** COWORK e ZAP são as duas únicas funções do
   OSONE que devolvem dinheiro ou tempo — por isso são as certas para o primeiro plano pago.
2. **Não tire o que já está solto.** As duas já estão publicadas: use amostra generosa
   (5 sequências/mês, 30 mensagens/dia) em vez de muro, porque elas só se vendem sendo vistas.
3. **A maior dor do seu usuário hoje é a chave da API.** Resolver isso é o plano VIP, e ele exige
   servidor seu — fica para depois do CNPJ.
4. **Comece pelo Stripe com cartão**, adicione Pix anual no primeiro dia e Pix Automático depois.
5. **Antes de qualquer código de cobrança, conserte o `firestore.rules`.** É a única falha aqui
   que custa dinheiro de verdade.

### E o que fazer nesta semana, sem CNPJ

Contar o uso real de COWORK e ZAP (seção 3-B.5). Você está prestes a definir preço e limite no
escuro; um mês de contagem transforma palpite em dado.
