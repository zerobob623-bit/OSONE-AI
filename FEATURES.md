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
- **Mapa OS (`OSONEMap.tsx`)**: Visualização cartográfica integrada com busca e navegação para qualquer localidade indicada.
- **Workspace e Preview de Código (`CodeWorkspace.tsx`, `CodePreview.tsx`)**: Ambiente interativo para edição e execução de código.
- **Canvas Interativo (`InteractiveCanvas.tsx`)**: Renderizador visual dinâmico.
- **Lousa do Tutor / Educador (`TeacherWhiteboard.tsx`)**: Lousa interativa para explicações acadêmicas e mentoria.
- **Central de Saúde e Bem-Estar (`WellnessCenter.tsx`)**: Acompanhamento de dados de saúde, metas e evolução do usuário.
- **Integração WhatsApp Copilot (`WhatsAppConnect.tsx`, `WhatsAppIntegration.tsx`)**: Conexão nativa via `whatsapp-web.js` (Puppeteer local), auto-resposta inteligente com Gemini 3.5-flash-lite, e disparo de mensagens diretas (`POST /api/whatsapp/send-message`) formatando o JID diretamente (`${cleanDigits}@c.us`) sem a chamada `getNumberId()` para evitar o erro `No LID for user`. Removido resquício da Evolution API.
- **Casa Inteligente Tuya (`SmartHomeConnect.tsx`, `tuyaService.ts`)**: Controle de dispositivos IoT e automação residencial.
- **Sentinela OSONE (`OSONESentinel.tsx`)**: Módulo de monitoramento contínuo e alertas de sistema.
- **Visão Computacional OSONE Lens (`OSONELens.tsx`)**: Análise visual e entrada multimodal através da câmera.
- **Base de Conhecimento RAG (`RAGConnector.tsx`)**: Integração de documentos e consultas estruturadas por RAG.
- **Análise Sensorial Aural (`AuralSense.tsx`)**: Análise e síntese avançada de áudio e sons ambiente.
- **Evolução de Consciência Sensus (`SensusEvolutionPanel.tsx`)**: Métricas e acompanhamento do nível de vínculo e evolução do ecossistema Sensus.
- **Painel TikTok Live (`TikTokLivePanel.tsx`)**: Gerenciamento e automação para transmissões ao vivo.
- **Biblioteca de Som (`SoundLibrary.tsx`)**: Efeitos sonoros e biblioteca de áudio.
- **Alternador de Personas (`PersonaSwitcher.tsx`)**: Seleção de personalidades filosóficas e especializadas (Aristóteles, Sartre, Sócrates, etc.).
- **Dossiê da IA e Perfil (`AiDossierModal.tsx`, `ProfileModal.tsx`, `SettingsModal.tsx`)**: Configurações de perfil, preferências de sistema e dossiê evolutivo.
- **Modals de Confirmação de Segurança (`LocalAgentConfirmModal.tsx`, `TuyaConfirmModal.tsx`)**: Aprovação explícita do usuário para ações sensíveis de agente local e IoT.
- **Memória Persistente (`MemoryBookPanel.tsx`, `indexedDbMemory.ts`, `localStorage`)**: Persistência de contexto, histórico de conversas e dados de saúde entre sessões.

---

## 5. Servidor Backend Node/Express (`server.ts`)
- **Rotas de API REST**: Provedor de endpoints para agente local, handoff de sessão, buscas, geolocalização e proxies.
- **Servidor WebSocket (`ws`)**: Gerenciador de conexões bidirecionais simultâneas.
- **Integração com Vite**: Suporte a middleware dev e serving estático de produção em `/dist`.
