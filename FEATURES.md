# MAPA DE FUNCIONALIDADES E RECURSOS — OSONE G5 (FEATURES.md)

Este documento registra todas as funcionalidades, rotas e módulos ativos no ecossistema **OSONE G5**. Ele deve ser lido e verificado **antes de qualquer alteração no código**, garantindo que nenhuma funcionalidade existente seja removida ou corrompida acidentalmente.

---

## 1. Agente Local & Automação de Sistema (`src/localAgentService.ts`)
- **Abertura de Aplicativos (`POST /api/agent/open-app`)**: Executa e abre aplicativos autorizados no sistema operacional local do usuário.
- **Fechamento de Aplicativos (`POST /api/agent/close-app`)**: Encerra processos e fecha aplicativos no sistema operacional local.
- **Criação de Pastas (`POST /api/agent/create-folder`)**: Cria novos diretórios respeitando a lista de pastas permitidas (`allowedFolders`).
- **Escrita de Arquivos (`POST /api/agent/write-file`)**: Cria e sobrescreve arquivos de texto dentro de pastas permitidas (`allowedFolders`), registrando logs de auditoria (`FILE_CREATE` e `FILE_OVERWRITE`).
- **Validação de Segurança & Jail contra Path Traversal**: Uso rigoroso de `resolveSafePath()` e middleware com autenticação Bearer Token.
- **Log de Auditoria Auditor (`logAudit()`)**: Log estruturado de todas as ações de sistema executadas localmente.

---

## 2. Transferência de Sessão entre Dispositivos (PC <-> Mobile Handoff)
- **Estado Global de Handoff (`/api/session/handoff`)**: Sincroniza qual dispositivo (PC ou Celular) está ativo na sessão de voz/conversação.
- **Sincronização em Tempo Real via WebSocket (`/api/live-ws`)**: Dispara mensagens `session:handoff` e `session:handoff_state` para alternar o foco do microfone e propagar o histórico de mensagens entre dispositivos simultaneamente.
- **Desativação Automática de Microfone Inativo**: Desliga o microfone e interrompe a sessão de voz no dispositivo secundário para evitar duplicação ou conflitos de áudio.

---

## 3. Comunicação de Voz & IA Multimodal (Gemini Live & ElevenLabs)
- **Integração Gemini Live WebSocket Proxy (`/api/live-ws`)**: Comunicação bidirecional de áudio e texto com o modelo `gemini-3.1-flash-live-preview`.
- **ElevenLabs Conversational AI (`/api/elevenlabs-ws`)**: Conexão com agentes conversacionais de voz da ElevenLabs.
- **Suporte a Wake Word**: Detecção de palavra de ativação para início mãos-livres.
- **Perfis e Alternador de Vozes (`VoiceSwitcher.tsx`)**: Configuração de tom e personalidade vocal (Escarlate, Fenrir, etc.).

---

## 4. Modulos e Componentes do Ecossistema UI/UX
- **Home Workspace Modular (`HomeWorkspaceSection.tsx`)**: Refatoração e modularização do workspace principal da Home extraído de `App.tsx` para seu próprio componente dedicado, reduzindo a carga visual e melhorando o tempo de build do Vite sem alterar nenhum comportamento existente.
- **Mapa OS (`OSONEMap.tsx`)**: Visualização cartográfica integrada com busca e navegação para qualquer localidade indicada.
- **Workspace e Preview de Código (`CodeWorkspace.tsx`, `CodePreview.tsx`)**: Ambiente interativo para edição e execução de código.
  - **Sistema de 5 Projetos Isolados ("Em qual projeto você quer codar?")**: Gerenciamento de até 5 projetos independentes ("Projeto 1" a "Projeto 5") com renomeação individual, onde cada projeto mantém seus próprios arquivos e estado isolados no localStorage (`osone_code_projects_v2`).
  - **Botão "Desfazer" (Undo / Ctrl+Z)**: Histórico completo de snapshots de código que permite reverter edições, exclusões e adições de arquivos instantaneamente com botão no cabeçalho e atalho global Ctrl+Z.
  - **Agentes Swarm & Hunter Agêntico**: Agentes especializados em loop autônomo e analisador de código com auto-implementação.
- **Canvas Interativo (`InteractiveCanvas.tsx`)**: Renderizador visual dinâmico.
- **Lousa do Tutor / Educador (`TeacherWhiteboard.tsx`)**: Lousa interativa para explicações acadêmicas e mentoria.
- **Central de Saúde e Bem-Estar (`WellnessCenter.tsx`)**: Acompanhamento de dados de saúde, metas e evolução do usuário.
- **Integração OSONE ZAP (`WhatsAppConnect.tsx`, `WhatsAppIntegration.tsx`)**: Conexão nativa via `whatsapp-web.js` (Puppeteer local), auto-resposta inteligente com Gemini 3.5-flash-lite, e disparo de mensagens diretas (`POST /api/whatsapp/send-message`) com validação estrita do objeto `pupPage`.
  - **Barra de 5 Abas Estruturadas (Tema Emerald Green)**: "1. Conectar & Disparar", "2. Histórico de Mensagens", "3. Lista de Contatos", "4. Documentação & Base do Produto" e "5. Ajustes de IA".
  - **Histórico Real de Conversas & Feed de Auditoria**: Leitura de mensagens enviadas e recebidas gravadas no servidor (`conversations.json`) lado a lado com o feed de logs e auditoria em tempo real (`logs`).
  - **Agenda e Leitura de Contatos do WhatsApp (`GET /api/whatsapp/wa-contacts`, `POST /api/whatsapp/import-contacts`)**: Busca direta via `wwebjsClient.getContacts()` trazendo nome e número real da conta pareada, gravando em `contacts.json` com tag visual ("WhatsApp" vs "Manual") e atalho direto para disparo real e histórico.
  - **Base de Conhecimento RAG do Produto & Extração de URL**: Campo para texto de conhecimento do produto/regras comerciais e importador de links via Cheerio (`POST /api/whatsapp/import-url`), armazenados em `knowledge-base.json`.
  - **Integração 100% Real**: Sem simulador fictício ou testes simulados — apenas envio e auto-resposta real via WhatsApp Web.
- **Criador de Conteúdo Neural (`ContentCreator.tsx`, `AudiovisualSection.tsx`)**: Roteiros virais de retenção cognitiva e estúdio de mídia audiovisual.
  - **Aba "Conteúdo Audiovisual"**:
    - **Geração de Imagens (Ativa & Gratuita)**: Prompt de texto, proporções (1:1, 16:9, 9:16, 4:3), salvamento local automático em `generated-content/images/` com timestamp, galeria em grid com lightbox, download direto e exclusão do disco. Contador de gerações diárias com reset automático à meia-noite.
    - **Geração de Vídeo (Arquitetura Plugável & Trava de Segurança de Custo)**: Suporte a Texto-para-Vídeo e Imagem-para-Vídeo via interface `VideoProvider` plugável (`VeoVideoProvider` usando Google Veo `veo-3.1-lite`), salvamento local em `generated-content/videos/`, modal de confirmação explícita de custo (~US$0,03/s) com trava manual obrigatória antes da execução, e player HTML5 com download e exclusão.
- **Casa Inteligente Tuya (`SmartHomeConnect.tsx`, `tuyaService.ts`)**: Controle de dispositivos IoT e automação residencial.
- **Removidos a pedido do usuário**: OSONE Sentinel (`OSONESentinel.tsx`) e OSONE Lens (`OSONELens.tsx`).
- **Base de Conhecimento RAG (`RAGConnector.tsx`)**: Integração de documentos e consultas estruturadas por RAG.
- **Análise Sensorial Aural (`AuralSense.tsx`)**: Análise e síntese avançada de áudio e sons ambiente.
- **Evolução de Consciência Sensus (`SensusEvolutionPanel.tsx`)**: Métricas e acompanhamento do nível de vínculo e evolução do ecossistema Sensus.
- **Painel TikTok Live (`TikTokLivePanel.tsx`)**: Gerenciamento e automação para transmissões ao vivo.
- **Biblioteca de Som (`SoundLibrary.tsx`)**: Integração completa com a API pública do Freesound (`GET /api/library/search`) para busca de sons, músicas e efeitos sonoros gratuitos com filtros por palavra-chave, categorias (Música, Efeito Sonoro, Ambiente) e licenças (Creative Commons 0 e Atribuição). Inclui player de áudio inline, download direto, modal de cópia de aviso de atribuição de licença e seção de "Favoritos" persistida em `favorites.json` (`/api/library/favorites`).
- **Alternador de Personas (`PersonaSwitcher.tsx`)**: Seleção de personalidades filosóficas e especializadas (Aristóteles, Sartre, Sócrates, etc.).
- **Dossiê da IA e Perfil (`AiDossierModal.tsx`, `ProfileModal.tsx`, `SettingsModal.tsx`)**: Configurações de perfil, preferências de sistema e dossiê evolutivo.
- **Modals de Confirmação de Segurança (`LocalAgentConfirmModal.tsx`, `TuyaConfirmModal.tsx`)**: Aprovação explícita do usuário para ações sensíveis de agente local e IoT.
- **Memória Persistente (`MemoryBookPanel.tsx`, `indexedDbMemory.ts`, `localStorage`)**: Persistência de contexto, histórico de conversas e dados de saúde entre sessões.

---

## 5. Servidor Backend Node/Express (`server.ts`)
- **Rotas de API REST**: Provedor de endpoints para agente local, handoff de sessão, buscas, geolocalização e proxies.
- **Servidor WebSocket (`ws`)**: Gerenciador de conexões bidirecionais simultâneas.
- **Integração com Vite**: Suporte a middleware dev e serving estático de produção em `/dist`.

---

## 6. Aplicativo Desktop Electron (`electron/main.js`)
- **Empacotamento Multiplataforma (Electron + electron-builder)**: Arquitetura Desktop que carrega a interface OSONE G5 e executa o servidor backend Express (`dist/server.cjs`) como um processo interno na máquina do usuário, sem necessidade de inicialização manual via terminal.
- **Gerador de Instaladores Nativos (`npm run build:desktop`)**: Configuração para geração automatizada de instaladores .exe (NSIS para Windows) e .AppImage (Linux) no diretório `dist-desktop/` utilizando o ícone customizado (`build/icon.png`).
- **Persistência Segura no Disco do Sistema (`app.getPath('userData')`)**: Redirecionamento dinâmico do diretório de dados em ambiente empacotado para a pasta de dados do aplicativo no SO (AppData / Application Support), garantindo que arquivos como `knowledge-base.json`, `contacts.json`, `favorites.json`, sessões do WhatsApp (`.wwebjs_auth`) e mídias geradas (`generated-content/`) continuem funcionando normalmente sem restrições de permissão.
