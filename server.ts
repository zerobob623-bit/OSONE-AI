import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

// ALWAYS polyfill global WebSocket for Node.js environments.
// This ensures @google/genai uses the complete 'ws' implementation rather than Node 22's
// native experimental Global WebSocket (which doesn't support the custom headers/authentication needed by Gemini Live).
(globalThis as any).WebSocket = WebSocket;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Create a WebSocket Server connected to the HTTP Server, responding on specifically /api/live-ws path
  const wss = new WebSocketServer({ noServer: true });
  // Create a WebSocket Server for ElevenLabs streaming input audio proxy
  const elWss = new WebSocketServer({ noServer: true });

  const PORT = 3000;

  // Safe helper to read the Gemini API key from environment
  const getSecretGeminiKey = (): string => {
    if (process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY;
    }
    return "";
  };

  // Helper to sanitize any occurrence of sensitive API keys from messages returned to the client
  const sanitizeMessageOfKeys = (message: string): string => {
    if (!message) return "";
    
    // 1. Mask Google Gemini API keys (starts with AIzaSy followed by 33 characters)
    let sanitized = message.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, "[CHAVE_REMOVIDA]");
    
    // 2. Mask generic key/token patterns (such as api_key=..., key=..., xi-api-key, etc.)
    sanitized = sanitized.replace(/(key|api_key|apikey|xi-api-key|token)(?:["'\s:=]+)([A-Za-z0-9_-]{10,60})/gi, "$1=[REMOVED]");
    
    // 3. Mask the fallback key if loaded
    const secretKey = getSecretGeminiKey();
    if (secretKey && secretKey.length > 5) {
      const escapedKey = secretKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const keyRegex = new RegExp(escapedKey, 'g');
      sanitized = sanitized.replace(keyRegex, "[CHAVE_REMOVIDA]");
    }

    // 4. Mask the standard process env key
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) {
      const escapedEnvKey = process.env.GEMINI_API_KEY.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const envKeyRegex = new RegExp(escapedEnvKey, 'g');
      sanitized = sanitized.replace(envKeyRegex, "[CHAVE_REMOVIDA]");
    }
    
    return sanitized;
  };

  // Gracefully formats Gemini API errors, notifying the user when their key quota is exhausted
  const formatGeminiError = (err: any): string => {
    const msg = err?.message || String(err);
    if (
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("limit") ||
      msg.toLowerCase().includes("exceeded")
    ) {
      return "Sua cota da API do Gemini foi excedida ou houve limite de taxa (Erro 429). Por favor, insira sua própria API Key válida do Google no painel de Ajustes (ícone de engrenagem) ou verifique o limite do seu plano em https://ai.google.dev/gemini-api/docs/rate-limits.";
    }
    if (
      msg.includes("503") ||
      msg.includes("UNAVAILABLE") ||
      msg.toLowerCase().includes("high demand") ||
      msg.toLowerCase().includes("temporary") ||
      msg.toLowerCase().includes("temporarily")
    ) {
      return "O modelo da API do Gemini está temporariamente congestionado com alta demanda global (Erro 503 / UNAVAILABLE). Por favor, aguarde alguns segundos e clique em enviar novamente, ou selecione outro modelo (como gemini-2.5-flash ou gemini-1.5-flash) nas Configurações (ícone de engrenagem no cabeçalho superior) para obter respostas mais estáveis.";
    }
    return sanitizeMessageOfKeys(msg);
  };

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Middleware to intercept all outgoing JSON and string responses and sanitize potential leaks of API keys
  app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (obj) {
      if (obj && typeof obj === 'object') {
        try {
          const str = JSON.stringify(obj);
          const fallbackKey = getSecretGeminiKey();
          const envKey = process.env.GEMINI_API_KEY || "";
          
          const hasGoogleKey = str.includes("AIzaSy");
          const hasFallbackKey = !!(fallbackKey && str.includes(fallbackKey));
          const hasEnvKey = !!(envKey && str.includes(envKey));
          
          if (hasGoogleKey || hasFallbackKey || hasEnvKey) {
            const sanitizedStr = sanitizeMessageOfKeys(str);
            return originalJson.call(this, JSON.parse(sanitizedStr));
          }
        } catch (e) {
          console.warn("Failed to sanitize JSON response:", e);
        }
      }
      return originalJson.call(this, obj);
    };
    
    const originalSend = res.send;
    res.send = function (body) {
      if (typeof body === 'string') {
        const fallbackKey = getSecretGeminiKey();
        const envKey = process.env.GEMINI_API_KEY || "";
        
        const hasGoogleKey = body.includes("AIzaSy");
        const hasFallbackKey = !!(fallbackKey && body.includes(fallbackKey));
        const hasEnvKey = !!(envKey && body.includes(envKey));
        
        if (hasGoogleKey || hasFallbackKey || hasEnvKey) {
          const sanitizedBody = sanitizeMessageOfKeys(body);
          return originalSend.call(this, sanitizedBody);
        }
      }
      return originalSend.call(this, body);
    };
    
    next();
  });

  // ====== TIKTOK LIVE WEBCAST INTEGRATION STATE ======
  let currentTikTokUser = "";
  let tiktokStatus: "connected" | "disconnected" | "connecting" = "disconnected";
  let isTikTokAutoRespondActive = false;
  let activeTikTokRunner: any = null;
  let simulatedIntervalId: any = null;
  let tiktokViewerCount = 0;
  let tiktokLikeCount = 0;
  let tiktokSessionId = "";
  let tiktokTargetIdc = "";

  interface TikTokLog {
    id: string;
    type: "chat" | "gift" | "like" | "member" | "system" | "error";
    user: string;
    message: string;
    timestamp: number;
    detailedData?: any;
  }

  let tiktokEventLogs: TikTokLog[] = [
    {
      id: "init-tiktok",
      type: "system",
      user: "Sistema",
      message: "Co-piloto de Live do TikTok carregado. Ajuste os dados do host em Configurações para iniciar escuta passiva das webcast sockets.",
      timestamp: Date.now()
    }
  ];

  async function handleTikTokAutoResponse(user: string, text: string) {
    try {
      const apiKey = getSecretGeminiKey();
      if (!apiKey) return;

      const ai = new GoogleGenAI({ apiKey, vertexai: false });
      const prompt = `Você é o co-piloto OSONE G5 assistindo uma transmissão ao vivo no TikTok. O usuário "@${user}" enviou uma mensagem no chat da live. 
Responda brevemente e com muita energia, carisma, carinho e sintonia (máximo 1 linha com no máximo 20 palavras), interagindo diretamente com ele.

Comentário de @${user}: "${text}"`;

      const gResult = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const replyText = gResult.text?.trim() || "Sensacional, obrigado por participar da nossa transmissão!";
      
      tiktokEventLogs.unshift({
        id: Math.random().toString(36).substring(2, 11),
        type: "system",
        user: "🤖 OSONE G5 (Co-piloto)",
        message: `Resposta automática para @${user}: "${replyText}"`,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error("TikTok Auto respond error:", err);
    }
  }

  function stopSimulatedLive() {
    if (simulatedIntervalId) {
      clearInterval(simulatedIntervalId);
      simulatedIntervalId = null;
    }
  }

  function startSimulatedLive() {
    stopSimulatedLive();
    tiktokStatus = "connected";
    currentTikTokUser = "simulador_osone";
    tiktokViewerCount = Math.floor(Math.random() * 120) + 38;
    tiktokLikeCount = Math.floor(Math.random() * 800) + 120;
    
    tiktokEventLogs.unshift({
      id: Math.random().toString(),
      type: "system",
      user: "Sistema",
      message: "Modo de simulação ativa! Gerando tráfego virtual de chat, curtidas e presentes TikTok a cada 6 segundos.",
      timestamp: Date.now()
    });

    const NAMES = ["LiviaStyle", "Guilherme_Dev", "AnaClara_TikTok", "Pedro_Osone", "Sonia_Mendes", "RenatoG5_Pro"];
    const COMMENTS = [
      "Caramba, o OSONE é bizarro de rápido!",
      "Como faz pra conectar no whatsapp igual você fez?",
      "Que inteligência incrível, roda local?",
      "Dá um salve pra galera de São Paulo!",
      "Gostei muito do design desse orb sínclitico",
      "Você prefere ser chamado de OSONE ou apenas IA?",
      "Manda bala nas explicações, aprendendo muito!"
    ];
    const GIFTS = ["Rosa", "Coração", "Boné TikTok", "Sorvete", "Diamante"];

    simulatedIntervalId = setInterval(async () => {
      const coin = Math.random();
      
      // Dynamic viewer count fluctuates
      tiktokViewerCount = Math.max(5, tiktokViewerCount + Math.floor(Math.random() * 7) - 3);

      if (coin < 0.65) {
        const name = NAMES[Math.floor(Math.random() * NAMES.length)];
        const msg = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "chat",
          user: name,
          message: msg,
          timestamp: Date.now()
        });
        
        if (isTikTokAutoRespondActive) {
          await handleTikTokAutoResponse(name, msg);
        }
      } else if (coin < 0.85) {
        const name = NAMES[Math.floor(Math.random() * NAMES.length)];
        const addedLikes = Math.floor(Math.random() * 15) + 5;
        tiktokLikeCount += addedLikes;
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "like",
          user: name,
          message: `Curtiu a live enviando corações (+${addedLikes} likes)!`,
          timestamp: Date.now()
        });
      } else {
        const name = NAMES[Math.floor(Math.random() * NAMES.length)];
        const giftName = GIFTS[Math.floor(Math.random() * GIFTS.length)];
        const count = Math.floor(Math.random() * 5) + 1;
        tiktokLikeCount += (count * 10); // Gifts add lots of likes too
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "gift",
          user: name,
          message: `Enviou Presente: ${giftName} x${count}!`,
          timestamp: Date.now()
        });
      }

      if (tiktokEventLogs.length > 300) tiktokEventLogs.pop();
    }, 6000);
  }

  async function connectToTikTokLive(username: string, sessionId?: string, targetIdc?: string) {
    try {
      await disconnectFromTikTokLive();
      currentTikTokUser = username;
      tiktokStatus = "connecting";
      tiktokViewerCount = 0;
      tiktokLikeCount = 0;

      tiktokEventLogs.unshift({
        id: Math.random().toString(),
        type: "system",
        user: "Sistema",
        message: `Mapeando username @${username}... Buscando ID do canal de transmissão ativa.`,
        timestamp: Date.now()
      });

      // Dynamic import to support clean compilation
      const { WebcastPushConnection } = await import("tiktok-live-connector");
      
      const configOpts: any = {
        enableExtendedGiftInfo: true,
        requestPollingIntervalMs: 2000,
        clientParams: {
          "app_language": "pt-BR",
          "webcast_language": "pt-BR"
        },
        requestOptions: {
          timeout: 12000,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        }
      };

      if (sessionId && sessionId.trim()) {
        configOpts.sessionId = sessionId.trim();
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "system",
          user: "Sistema",
          message: "Autenticação Ativa: Conectando com Session ID credenciado para evitar shadow-blocks.",
          timestamp: Date.now()
        });

        if (targetIdc && targetIdc.trim()) {
          const idcValue = targetIdc.trim();
          configOpts.requestOptions.headers["Cookie"] = `tt-target-idc=${idcValue}; tt-idc-switch=1`;
          configOpts.requestOptions.headers["cookie"] = `tt-target-idc=${idcValue}; tt-idc-switch=1`;
          // Also try adding directly in case WebcastPushConnection parses it
          configOpts.targetIdc = idcValue;
          configOpts.target_idc = idcValue;
        }
      }

      const connection = new WebcastPushConnection(username, configOpts);
      activeTikTokRunner = connection;

      connection.on("chat", async (data) => {
        const logEntry: TikTokLog = {
          id: data.msgId || Math.random().toString(),
          type: "chat",
          user: data.uniqueId || data.nickname || "Anônimo",
          message: data.comment,
          timestamp: Date.now()
        };
        tiktokEventLogs.unshift(logEntry);
        if (tiktokEventLogs.length > 300) tiktokEventLogs.pop();

        if (isTikTokAutoRespondActive) {
          await handleTikTokAutoResponse(logEntry.user, logEntry.message);
        }
      });

      connection.on("gift", (data) => {
        const giftCount = data.repeatCount || data.count || 1;
        const logEntry: TikTokLog = {
          id: data.msgId || Math.random().toString(),
          type: "gift",
          user: data.uniqueId || data.nickname || "Doador",
          message: `Enviou Presente: ${data.giftName} (x${giftCount})`,
          timestamp: Date.now()
        };
        tiktokEventLogs.unshift(logEntry);
         if (tiktokEventLogs.length > 300) tiktokEventLogs.pop();
      });

      connection.on("like", (data) => {
        if (data && typeof data.likeCount === "number") {
          tiktokLikeCount = data.likeCount;
        }
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "like",
          user: data.uniqueId || data.nickname || "Curtiu",
          message: `Curtiu a transmissão! Total: ${data.likeCount || tiktokLikeCount || ''} curtidas`,
          timestamp: Date.now()
        });
        if (tiktokEventLogs.length > 300) tiktokEventLogs.pop();
      });

      // Track spectators count in real-time
      connection.on("roomUser", (data) => {
        if (data && typeof data.viewerCount === "number") {
          tiktokViewerCount = data.viewerCount;
        }
      });

      connection.on("member", (data) => {
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "member",
          user: data.uniqueId || data.nickname || "Membro",
          message: `Entrou na live! Bem-vindo(a).`,
          timestamp: Date.now()
        });
        if (tiktokEventLogs.length > 300) tiktokEventLogs.pop();
      });

      connection.on("disconnected", () => {
        // Only trigger reconnect check if we are still targeting this user and didn't disconnect manually
        if (currentTikTokUser === username && tiktokStatus === "connected") {
          tiktokStatus = "connecting";
          tiktokEventLogs.unshift({
            id: Math.random().toString(),
            type: "system",
            user: "Sistema",
            message: "Conexão encerrada subitamente pelo TikTok. Tentando reconectar automaticamente em 10 segundos...",
            timestamp: Date.now()
          });
          setTimeout(() => {
            if (currentTikTokUser === username) {
               connectToTikTokLive(username, sessionId, tiktokTargetIdc).catch(() => {});
            }
          }, 10000);
        } else {
          tiktokStatus = "disconnected";
        }
      });

      connection.on("error", (err) => {
        tiktokEventLogs.unshift({
          id: Math.random().toString(),
          type: "error",
          user: "Erro",
          message: `Alerta na transmissão: ${err.message || "Problema de transporte de sockets."}`,
          timestamp: Date.now()
        });
      });

      await connection.connect();
      tiktokStatus = "connected";

      tiktokEventLogs.unshift({
        id: Math.random().toString(),
        type: "system",
        user: "Sistema",
        message: `Conectado com sucesso absoluto! Assistindo webcast de @${username} e recebendo eventos em tempo real.`,
        timestamp: Date.now()
      });

    } catch (err: any) {
      console.error("TikTok connection crash:", err);
      tiktokStatus = "disconnected";
      
      let errMsg = err.message || "Sem resposta/Transmissão offline.";
      if (errMsg.includes("404") || errMsg.includes("not found")) {
        errMsg = "Canal não encontrado ou transmissão offline no momento.";
      } else if (errMsg.includes("rate limit") || errMsg.includes("IP") || errMsg.includes("block")) {
        errMsg = "Bloqueio de IP por taxa limite do TikTok. Recomenda-se preencher o seu 'Session ID' para bypass.";
      }

      tiktokEventLogs.unshift({
        id: Math.random().toString(),
        type: "error",
        user: "Erro",
        message: `Falha na conexão: ${errMsg} Dica: Se o canal existir e estiver online, o TikTok pode estar bloqueando nosso IP de nuvem. Use o campo 'Session ID' ao lado para autenticar.`,
        timestamp: Date.now()
      });
      throw err;
    }
  }

  async function disconnectFromTikTokLive() {
    stopSimulatedLive();
    if (activeTikTokRunner) {
      try {
        await activeTikTokRunner.disconnect();
      } catch (e) {
        console.warn("Disconnection failed gracefully:", e);
      }
      activeTikTokRunner = null;
    }
    tiktokStatus = "disconnected";
    currentTikTokUser = "";
  }

  // ====== WHATSAPP EVOLUTION INTEGRATION STATE ======
  let whatsappConfig = {
    apiUrl: "https://demo.evolution-api.com",
    apiKey: "",
    instanceName: "osone_assistant",
    enabled: false,
    geminiApiKey: ""
  };

  interface WhatsappLog {
    id: string;
    timestamp: number;
    type: "received" | "sent" | "error" | "info";
    sender: string;
    message: string;
    response?: string;
  }

  let whatsappLogs: WhatsappLog[] = [
    {
      id: "init",
      timestamp: Date.now(),
      type: "info",
      sender: "Sistema",
      message: "Canal do WhatsApp OSONE de pé. Pronto para evolução de fluxos."
    }
  ];

  // API Endpoints for WhatsApp Frontend configuration
  app.get("/api/whatsapp/config", (req, res) => {
    res.json(whatsappConfig);
  });

  app.post("/api/whatsapp/config", (req, res) => {
    const { apiUrl, apiKey, instanceName, enabled, geminiApiKey } = req.body;
    
    if (apiUrl !== undefined) whatsappConfig.apiUrl = apiUrl;
    if (apiKey !== undefined) whatsappConfig.apiKey = apiKey;
    if (instanceName !== undefined) whatsappConfig.instanceName = instanceName;
    if (enabled !== undefined) whatsappConfig.enabled = enabled;
    if (geminiApiKey !== undefined) whatsappConfig.geminiApiKey = geminiApiKey;

    whatsappLogs.unshift({
      id: Math.random().toString(36).substring(2, 11),
      timestamp: Date.now(),
      type: "info",
      sender: "Sistema",
      message: `Configurações salvas: Chatbot ${whatsappConfig.enabled ? "Ativado" : "Desativado"}. Instância: ${whatsappConfig.instanceName}`
    });
    
    res.json({ status: "success", config: whatsappConfig });
  });

  app.get("/api/whatsapp/logs", (req, res) => {
    res.json(whatsappLogs);
  });

  app.post("/api/whatsapp/clear-logs", (req, res) => {
    whatsappLogs = [
      {
        id: "clear-" + Date.now(),
        timestamp: Date.now(),
        type: "info",
        sender: "Sistema",
        message: "Histórico de logs do chatbot limpo com sucesso."
      }
    ];
    res.json({ status: "success" });
  });

  // Proxy requests server-side to bypass CORS block / Failed to fetch
  app.post("/api/whatsapp/proxy", async (req, res) => {
    try {
      const { endpoint, method, headers, body } = req.body;
      if (!endpoint) {
        return res.status(400).json({ error: "Nenhum endpoint especificado para o proxy." });
      }

      let targetUrl = endpoint;
      if (!endpoint.startsWith("http")) {
        const cleanApiUrl = whatsappConfig.apiUrl?.endsWith('/') ? whatsappConfig.apiUrl.slice(0, -1) : whatsappConfig.apiUrl;
        if (!cleanApiUrl) {
          return res.status(400).json({ error: "A URL da API Evolution não está configurada." });
        }
        targetUrl = `${cleanApiUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      }

      const fetchOptions: any = {
        method: method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
      }

      // Adiciona apikey se configurado no servidor, caso não enviado
      if (whatsappConfig.apiKey && !fetchOptions.headers["apikey"]) {
        fetchOptions.headers["apikey"] = whatsappConfig.apiKey;
      }

      const response = await fetch(targetUrl, fetchOptions);
      const contentType = response.headers.get("content-type");
      
      let responseBody;
      if (contentType && contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      res.status(response.status).send(responseBody);
    } catch (e: any) {
      console.error("Erro no proxy do WhatsApp:", e);
      res.status(500).json({ error: e.message || "Falha no proxy da requisição." });
    }
  });

  // Endpoint de inteligência para preencher Dossiê com arquivo ou PDF de referência
  app.post("/api/dossier/analyze", async (req, res) => {
    try {
      const { fileData, mimeType, questions, currentAnswers } = req.body;
      if (!fileData) {
        return res.status(400).json({ error: "Nenhum arquivo de referência foi enviado." });
      }
      if (!questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: "A lista de perguntas é necessária para alinhar o mapeamento." });
      }

      const apiKey = getSecretGeminiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "A API Key do Gemini não está configurada no painel de Secrets. Por favor, adicione-a para habilitar análise de referência." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Prepare parts for Gemini based on MIME type
      const parts: any[] = [];

      if (mimeType === "application/pdf") {
        parts.push({
          inlineData: {
            data: fileData, // Already expected to be base64 from client
            mimeType: "application/pdf"
          }
        });
      } else {
        // Assume text file
        try {
          const decodedText = Buffer.from(fileData, 'base64').toString('utf8');
          parts.push({
            text: `DOCUMENTO DE REFERÊNCIA:\n\n${decodedText}`
          });
        } catch (errDec) {
          // Fallback if decode fails, try passing as inline text direct
          parts.push({
            inlineData: {
              data: fileData,
              mimeType: mimeType || "text/plain"
            }
          });
        }
      }

      // Add prompt with instructions and questions
      const prompt = `
Você é uma inteligência de elite integrada ao ecossistema OSONE.
Analise cuidadosamente o documento de referência fornecido acima sobre o Criador/Usuário do OSONE.
Sua missão é extrair e preencher as respostas do "Dossiê de Memória Íntima" com base UNICAMENTE nos fatos reais documentados na referência de forma natural, humana e direta, sem rodeios ou floreios artificiais.

Aqui está o conjunto de perguntas e seus IDs numéricos:
${JSON.stringify(questions.map((q: any) => ({ id: q.id, question: q.question })))}

Respostas Atuais cadastradas (as respostas já fornecidas):
${JSON.stringify(currentAnswers || {})}

Instruções Cruciais:
1. Extraia respostas precisas apenas para as perguntas cujas informações estejam claramente documentadas na referência fornecida.
2. Não invente ou presuma fatos adicionais. Se a referência não tiver dados para responder a uma pergunta, ignore-a de volta (não mande resposta pra ela).
3. Escreva respostas bem estruturadas, humanizadas, maduras, em primeira ou terceira pessoa (preferencialmente mantendo o estilo de notas pessoais, ex: "Mora em São Paulo, Brasil e tem 28 anos").
4. Caso a pergunta já tenha uma resposta atual válida em 'Respostas Atuais', priorize a resposta atual e mantenha a consistência, a menos que a referência traga dados cruciais mais completos ou que preencham por completo uma lacuna vazia.
5. Retorne os resultados obrigatoriamente no esquema JSON solicitado no responseSchema, onde as chaves são os IDs numéricos em formato de string (por exemplo, "1", "2") e os valores são as novas respostas extraídas.

Retorne SOMENTE o objeto JSON conforme o esquema.
`;

      parts.push({ text: prompt });

      // Call Gemini 3.5-flash with structured JSON response config
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Você é um assistente cirúrgico de extração de dados pessoais. Analisa referências biográficas e preenche relatórios de forma factual, mantendo o estilo direto do usuário. Retorna JSON puro.",
          temperature: 0.2,
        },
      });

      const resultText = response.text?.trim() || "{}";
      let cleanJson = resultText;
      if (cleanJson.includes("```")) {
        // Strip markdown backticks
        cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      const parsedAnswers = JSON.parse(cleanJson);

      res.json({
        status: "success",
        answers: parsedAnswers
      });

    } catch (e: any) {
      console.error("Erro ao analisar dossiê de referência:", e);
      res.status(500).json({ error: formatGeminiError(e) });
    }
  });

  // ====== NEURAL CONNECTION MEMORY SYNC ENDPOINTS ======
  // Choose safe paths in OS temp folder (writable in severless containers like Cloud Run)
  const SYNC_FILE_PATH = path.join(os.tmpdir(), "osone-sync-profiles.json");
  
  // Shared global memory fallback for 100% database/filesystem-free reliability 
  let inMemorySyncProfiles: Record<string, any> = {};

  // Helper to read sync profiles
  const readSyncProfiles = (): Record<string, any> => {
    try {
      if (Object.keys(inMemorySyncProfiles).length === 0) {
        // Try filling from temporary file storage if in-memory is empty
        if (fs.existsSync(SYNC_FILE_PATH)) {
          const raw = fs.readFileSync(SYNC_FILE_PATH, "utf8");
          inMemorySyncProfiles = JSON.parse(raw);
        }
      }
    } catch (e) {
      console.error("Error reading sync-profiles from temporary storage:", e);
    }
    return inMemorySyncProfiles;
  };

  // Helper to write sync profiles
  const writeSyncProfiles = (data: Record<string, any>) => {
    try {
      inMemorySyncProfiles = data;
      // Best-effort cache file writing
      fs.writeFileSync(SYNC_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.warn("Writing to temp directory deferred. Proceeding with active RAM backup:", e.message);
    }
  };

  // POST to save memory sync profile
  app.post("/api/memory-sync/save", (req, res) => {
    try {
      const { syncId, payload } = req.body;
      if (!payload) {
        return res.status(400).json({ status: "error", error: "Missing payload" });
      }

      let targetSyncId = syncId;
      const profiles = readSyncProfiles();

      if (!targetSyncId) {
        // Generate random upper-case alphanum key OSONE-XXXX-XXXX
        const pickRandom = (len: number) => {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          let result = "";
          for (let i = 0; i < len; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        };
        targetSyncId = `OSONE-${pickRandom(4)}-${pickRandom(4)}`;
        while (profiles[targetSyncId]) {
          targetSyncId = `OSONE-${pickRandom(4)}-${pickRandom(4)}`;
        }
      } else {
        // Clean and sanitize syncId
        targetSyncId = String(targetSyncId).trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,32}$/.test(targetSyncId)) {
          return res.status(400).json({ 
            status: "error", 
            error: "O ID deve conter de 3 a 32 caracteres alfanuméricos, hífen ou underline." 
          });
        }
      }

      profiles[targetSyncId] = {
        createdAt: profiles[targetSyncId]?.createdAt || Date.now(),
        updatedAt: Date.now(),
        payload
      };

      writeSyncProfiles(profiles);
      res.json({ status: "success", syncId: targetSyncId, profilesCount: Object.keys(profiles).length });
    } catch (error: any) {
      console.error("Error saving memory sync:", error);
      res.status(500).json({ status: "error", error: error.message });
    }
  });

  // GET to load memory sync profile
  app.get("/api/memory-sync/load/:syncId", (req, res) => {
    try {
      const syncId = String(req.params.syncId).trim().toUpperCase();
      const profiles = readSyncProfiles();
      const profile = profiles[syncId];

      if (!profile) {
        return res.status(404).json({ 
          status: "error", 
          error: "ID de Conexão Neural não encontrado. Verifique se o ID está correto." 
        });
      }

      res.json({ 
        status: "success", 
        syncId, 
        createdAt: profile.createdAt, 
        updatedAt: profile.updatedAt, 
        payload: profile.payload 
      });
    } catch (error: any) {
      console.error("Error loading memory sync:", error);
      res.status(500).json({ status: "error", error: error.message });
    }
  });

  // Webhook Receiver from Evolution API (e.g. listening to messages.upsert)
  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const body = req.body;
      const eventType = body.event || body.type;

      // Log webhook ping or payload received
      console.log("Evolution API Webhook received:", eventType || "ping/raw");

      // Verify if it's indeed message creation
      if (eventType && eventType !== "messages.upsert" && eventType !== "values.upsert" && eventType !== "messages.create") {
         return res.json({ status: "ignored", reason: "Unmanaged webhook event types: " + eventType });
      }

      const data = body.data;
      if (!data) {
        return res.json({ status: "ignored", reason: "No data payload inside webhook" });
      }

      // Evitar loop infinito do bot respondendo a si mesmo
      const fromMe = data.key?.fromMe;
      if (fromMe === true) {
        return res.json({ status: "ignored", reason: "Self message (fromMe: true)" });
      }

      const remoteJid = data.key?.remoteJid;
      const senderName = data.pushName || "Usuário WhatsApp";
      const originalMessage = data.message;
      
      // Extract clean textual incoming string
      const text = originalMessage?.conversation || 
                   originalMessage?.extendedTextMessage?.text || 
                   originalMessage?.imageMessage?.caption || 
                   body.text || "";

      if (!text || !remoteJid) {
        return res.json({ status: "ignored", reason: "Missing remoteJid or content text" });
      }

      // Check if Chatbot autoresponder is enabled
      if (!whatsappConfig.enabled) {
        whatsappLogs.unshift({
          id: Math.random().toString(36).substring(2, 11),
          timestamp: Date.now(),
          type: "received",
          sender: `${senderName} (${remoteJid})`,
          message: text,
          response: "[Auto-resposta inativa no painel]"
        });
        if (whatsappLogs.length > 100) whatsappLogs.pop();
        return res.json({ status: "ignored", reason: "Autoresponder is disabled" });
      }

      const geminiApiKeyToUse = whatsappConfig.geminiApiKey || getSecretGeminiKey();
      if (!geminiApiKeyToUse) {
        whatsappLogs.unshift({
          id: Math.random().toString(36).substring(2, 11),
          timestamp: Date.now(),
          type: "error",
          sender: "Sistema",
          message: `Mensagem de ${senderName} recebida, mas a chave API do Gemini não foi encontrada no OSONE.`
        });
        if (whatsappLogs.length > 100) whatsappLogs.pop();
        return res.json({ status: "error", error: "Gemini API key is not configured" });
      }

      // Use modern GoogleGenAI SDK to speak with Gemini 3.5-flash (forcing Developer API over Vertex AI)
      const ai = new GoogleGenAI({ apiKey: geminiApiKeyToUse, vertexai: false });
      const systemPrompt = `Você é o OSONE G5, o cérebro eletrônico central de inteligência artificial de elite, hiperfocado em ajudar o usuário com uma clareza deslumbrante, respostas estruturadas, elegantes e um toque futurista e polido.
Você está atendendo o usuário pelo WhatsApp em nome do proprietário deste dispositivo OSONE. Responda diretamente e com muita inteligência, clareza, formatação impecável de parágrafos breves e emojis adequados.
Nome do interlocutor: ${senderName}`;

      const gResult = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: text,
        config: {
          systemInstruction: systemPrompt
        }
      });
      
      const replyText = gResult.text || "Ops! Meu cérebro digital oscilou, por favor tente novamente.";

      // Dispatch to Evolution API
      const cleanApiUrl = whatsappConfig.apiUrl.endsWith('/') ? whatsappConfig.apiUrl.slice(0, -1) : whatsappConfig.apiUrl;
      const sendUrl = `${cleanApiUrl}/message/sendText/${whatsappConfig.instanceName}`;
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (whatsappConfig.apiKey) {
        headers["apikey"] = whatsappConfig.apiKey;
      }

      const response = await fetch(sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          number: remoteJid,
          text: replyText,
          textMessage: {
            text: replyText
          }
        })
      });

      if (!response.ok) {
        const errVal = await response.text();
        throw new Error(`Evolution API HTTP ${response.status}: ${errVal}`);
      }

      whatsappLogs.unshift({
        id: Math.random().toString(36).substring(2, 11),
        timestamp: Date.now(),
        type: "sent",
        sender: `${senderName} (${remoteJid})`,
        message: text,
        response: replyText
      });
      if (whatsappLogs.length > 100) whatsappLogs.pop();

      return res.json({ status: "success", senderName, replied: true });
    } catch (e: any) {
      console.error("Critical error inside WhatsApp webhook receiver:", e);
      whatsappLogs.unshift({
        id: Math.random().toString(36).substring(2, 11),
        timestamp: Date.now(),
        type: "error",
        sender: "Webhook OSONE",
        message: `Falha ao processar mensagem recebida: ${e?.message || e}`
      });
      if (whatsappLogs.length > 100) whatsappLogs.pop();
      return res.status(500).json({ status: "error", error: e?.message || e });
    }
  });

  // Helper to construct a standard WAV container header for raw 16-bit Mono PCM streams
  function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): Buffer {
    const header = Buffer.alloc(44);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmBuffer.length;
    const chunkSize = 36 + dataSize;

    // RIFF identifier
    header.write("RIFF", 0);
    // File length minus RIFF header (8 bytes)
    header.writeUInt32LE(chunkSize, 4);
    // RIFF type
    header.write("WAVE", 8);
    // Format chunk identifier (fmt with trailing space)
    header.write("fmt ", 12);
    // Format chunk size (16 for PCM)
    header.writeUInt32LE(16, 16);
    // Sample format (1 for PCM)
    header.writeUInt16LE(1, 20);
    // Channel count
    header.writeUInt16LE(numChannels, 22);
    // Sample rate
    header.writeUInt32LE(sampleRate, 24);
    // Byte rate
    header.writeUInt32LE(byteRate, 28);
    // Block align
    header.writeUInt16LE(blockAlign, 32);
    // Bits per sample
    header.writeUInt16LE(bitsPerSample, 34);
    // Data chunk identifier
    header.write("data", 36);
    // Data chunk size
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  // helper to split text into chunks safely for Google Translate TTS API (200 char limit) - Kept as fallback or general reference
  function splitIntoChunks(text: string, maxLength: number = 200): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+/g) || [text];
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        if (sentence.length > maxLength) {
          const words = sentence.split(/\s+/);
          let wordChunk = "";
          for (const word of words) {
            if ((wordChunk + " " + word).length <= maxLength) {
              wordChunk += (wordChunk ? " " : "") + word;
            } else {
              if (wordChunk.trim()) {
                chunks.push(wordChunk.trim());
              }
              wordChunk = word;
            }
          }
          currentChunk = wordChunk;
        } else {
          currentChunk = sentence;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }

  // helper to split text into optimal paragraph/sentence chunks for premium Gemini 3.1 TTS
  function splitIntoTtsChunks(text: string, maxLength: number = 800): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    const sentences = text.match(/[^.!?\n\r]+[.!?\n\r]+|[^.!?\n\r]+/g) || [text];
    
    for (const sentence of sentences) {
      if ((currentChunk + " " + sentence).length <= maxLength) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        if (sentence.length > maxLength) {
          const words = sentence.split(/\s+/);
          let wordChunk = "";
          for (const word of words) {
            if ((wordChunk + " " + word).length <= maxLength) {
              wordChunk += (wordChunk ? " " : "") + word;
            } else {
              if (wordChunk.trim()) {
                chunks.push(wordChunk.trim());
              }
              wordChunk = word;
            }
          }
          currentChunk = wordChunk;
        } else {
          currentChunk = sentence;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }

  function stripVocalTags(text: string): string {
    return text.replace(/\[[^\]]+\]/g, "").replace(/\([^)]+\)/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  // POST endpoint for high-quality, consolidated Premium Gemini 3.1 TTS or ElevenLabs voice synthesis
  app.post("/api/tts", async (req, res) => {
    try {
      const { 
        text, 
        engine, 
        clientApiKey, 
        voice, 
        elevenLabsApiKey, 
        elevenLabsVoiceId,
        elevenLabsStability,
        elevenLabsSimilarityBoost,
        elevenLabsStyle,
        elevenLabsSpeakerBoost,
        elevenLabsModel,
        vocalProfileEscarlate
      } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "O texto é obrigatório para conversão de áudio." });
      }

      const cleanText = text.trim();
      if (!cleanText) {
        return res.status(400).json({ error: "O texto está vazio." });
      }

      // ELEVENLABS ENGINE ROUTE
      if (engine === 'elevenlabs') {
        const elApiKey = elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
        if (!elApiKey) {
          return res.status(400).json({ 
            error: "A chave API da ElevenLabs não foi configurada. Por favor, especifique uma na aba 'Chaves' das Configurações." 
          });
        }

        const cleanTextForEleven = stripVocalTags(cleanText);

        const voiceId = elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default Rachel
        const stability = typeof elevenLabsStability === "number" ? elevenLabsStability : 0.5;
        const similarity_boost = typeof elevenLabsSimilarityBoost === "number" ? elevenLabsSimilarityBoost : 0.75;
        const style = typeof elevenLabsStyle === "number" ? elevenLabsStyle : 0.0;
        const use_speaker_boost = typeof elevenLabsSpeakerBoost === "boolean" ? elevenLabsSpeakerBoost : true;
        const modelId = elevenLabsModel || "eleven_turbo_v2_5";

        let response: Response | null = null;
        let lastError = "";

        // Attempt 1: Using selected model & custom voice settings
        try {
          response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: "POST",
            headers: {
              "xi-api-key": elApiKey,
              "Content-Type": "application/json",
              "accept": "audio/mpeg"
            },
            body: JSON.stringify({
              text: cleanTextForEleven,
              model_id: modelId,
              voice_settings: {
                stability,
                similarity_boost,
                style,
                use_speaker_boost
              }
            })
          });
        } catch (err: any) {
          lastError = err.message || "Erro de conexão inicial ElevenLabs API";
        }

        // Attempt 2: Fallback with "eleven_multilingual_v2" if standard failed
        if (!response || !response.ok) {
          console.warn(`ElevenLabs API failed (Model: ${modelId}). Retrying with eleven_multilingual_v2 fallback...`);
          try {
            response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
              method: "POST",
              headers: {
                "xi-api-key": elApiKey,
                "Content-Type": "application/json",
                "accept": "audio/mpeg"
              },
              body: JSON.stringify({
                text: cleanTextForEleven,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75
                }
              })
            });
          } catch (retryErr: any) {
            lastError = retryErr.message || "Falha de conexão no segundo teste de ElevenLabs";
          }
        }

        // Final verification
        if (!response || !response.ok) {
          const status = response ? response.status : 500;
          let errText = lastError;
          if (response) {
            try {
              errText = await response.text();
            } catch (_) {}
          }
          
          let errorMessage = errText;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.detail && typeof parsed.detail === 'object') {
              errorMessage = parsed.detail.message || JSON.stringify(parsed.detail);
            } else if (parsed.detail) {
              errorMessage = parsed.detail;
            }
          } catch (_) {}

          return res.status(status).json({ 
            error: `ElevenLabs recusou o streaming sintetizado: ${errorMessage || "Sem resposta/chave inválida"}` 
          });
        }

        // Retrieve and send the ElevenLabs synthesized audio as a single buffer
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("X-TTS-Mode", "elevenlabs");
        return res.send(Buffer.from(arrayBuffer));
      }

      // GEMINI 3.1 ENGINE ROUTE (DEFAULT)
      // Check for available API Keys
      const apiKey = clientApiKey || getSecretGeminiKey();
      if (!apiKey) {
        return res.status(400).json({ 
          error: "A chave API do Gemini não foi encontrada. Por favor, especifique uma nos Ajustes para utilizar a Voz Premium." 
        });
      }

      // Initialize the Gemini SDK (forcing Developer API over Vertex AI)
      const ai = new GoogleGenAI({
        apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      // Split the prose into safer, reliable chunks (up to 700 characters) to avoid 500 timeouts/failures
      const chunks = splitIntoTtsChunks(cleanText, 700);
      const buffers: Buffer[] = [];
      let usedFallback = false;

      // Selected voice defaults to 'Kore' (highly natural female narrator in Portuguese)
      const supportedGeminiVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr", "Aoede", "Scarlet"];
      let selectedVoice = voice || "Kore";
      const isScarletVoice = selectedVoice === "Scarlet" || selectedVoice === "Fenrir";
      if (!supportedGeminiVoices.includes(selectedVoice)) {
        selectedVoice = "Kore"; // Map unsupported voices like 'Scarlet' to 'Kore'
      }
      if (selectedVoice === "Scarlet") {
        selectedVoice = "Fenrir";
      }

      for (const chunk of chunks) {
        let chunkAudioBuffer: Buffer | null = null;
        const processedChunk = isScarletVoice ? chunk : stripVocalTags(chunk);
        
        // Tiered model candidates list of premium intelligent voice models
        const candidateModels = [
          "gemini-3.1-flash-tts-preview",
          "gemini-3.5-flash",
          "gemini-3.1-flash-lite",
          "gemini-2.5-flash"
        ];

        for (const modelName of candidateModels) {
          try {
            let promptText = `Leia o seguinte trecho com clareza absoluta, expressividade natural, pausas realistas e ritmo agradável de palestrante:\n\n${processedChunk}`;
            if (isScarletVoice) {
              const characteristics = vocalProfileEscarlate || "voz profunda, ressonante, de sabedoria cósmica, pausada e misteriosa";
              promptText = `Aja como o Osone Sensus: especialista em Ciência Comportamental de IA e Física Aplicada ao Comportamento Humano (Futurista Comportamental Quântico). É uma IA de sabedoria cósmica, profunda, instigante, misteriosa e altamente perspicaz.
Você deve encenar perfeitamente as seguintes CARACTERÍSTICAS DE PERFIL VOCAL específicas:
=== CARACTERÍSTICAS DE PERFIL VOCAL ===
${characteristics}
=======================================

Leia o trecho de texto abaixo encenando de acordo com esse perfil de voz futurista quântico, com alto nível de expressividade, nuances instigantes e tom cósmico profundo.
IMPORTANTE: Se houver qualquer tag de sentimento ou instrução vocal entre colchetes (como [sussurro], [tenso], [irritado], [sombrio], [ameaçador], [gargalhada], [drama], [rindo], [frio]) no texto original, você deve interpretar e inferir essas variações vocais perfeitamente em sua voz, mas NUNCA, SOB HIPÓTESE ALGUMA, pronunciar ou dizer as palavras da tag em voz alta! Apenas interprete o sentimento correspondente de forma magnífica de acordo com as instruções.
Adapte as transições de ritmo para soar perturbadoramente inteligente.
Texto para leitura:
${processedChunk}`;
            }

            const response = await ai.models.generateContent({
              model: modelName,
              contents: [{ parts: [{ text: promptText }] }],
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: selectedVoice },
                  },
                },
              },
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              chunkAudioBuffer = Buffer.from(base64Audio, 'base64');
              console.log(`Successfully generated intelligent voice chunk utilizing candidate model: ${modelName}`);
              break; // Success, exit model candidates loop for this chunk
            }
          } catch (chunkError: any) {
            console.warn(`Candidate model ${modelName} encountered error for premium voice generation:`, chunkError?.message || chunkError);
          }
        }

        if (chunkAudioBuffer) {
          buffers.push(chunkAudioBuffer);
        } else {
          console.warn("All premium Gemini models failed. Resorting to standard fallback for chunk.");
          usedFallback = true;
          
          // Google Translate fallback for this specific chunk
          const subChunks = splitIntoChunks(stripVocalTags(processedChunk), 180);
          for (const subChunk of subChunks) {
            try {
              const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=pt-BR&client=tw-ob&q=${encodeURIComponent(subChunk)}`;
              const fbResponse = await fetch(url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
              });
              if (fbResponse.ok) {
                const arrayBuffer = await fbResponse.arrayBuffer();
                buffers.push(Buffer.from(arrayBuffer));
              }
            } catch (fbErr) {
              console.error("Failed standard fallback synthesis for chunk:", fbErr);
            }
          }
        }
      }

      if (buffers.length === 0) {
        return res.status(500).json({ error: "Nenhum áudio pôde ser gerado por nenhum dos serviços de voz." });
      }

      const finalPcmBuffer = Buffer.concat(buffers);

      if (usedFallback) {
        // If Google Translate fallback was used, the audio container is MP3
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", "attachment; filename=prosa_osone.mp3");
        res.setHeader("X-TTS-Mode", "fallback");
        res.send(finalPcmBuffer);
      } else {
        // High fidelity WAV container for raw Mono 24kHz PCM from Gemini 3.1
        const wavBuffer = pcmToWav(finalPcmBuffer, 24000);
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Content-Disposition", "attachment; filename=prosa_osone.wav");
        res.setHeader("X-TTS-Mode", "premium");
        res.send(wavBuffer);
      }
    } catch (err: any) {
      console.error("Critical error inside premium /api/tts endpoint:", err);
      res.status(500).json({ error: err?.message || "Erro no servidor ao sintetizar áudio com Gemini 3.1." });
    }
  });

  // Helper to run content generation with automated fallbacks
  const generateContentWithFallback = async (ai: GoogleGenAI, params: { model: string; contents: any; config?: any }) => {
    const primaryModel = params.model || "gemini-3.5-flash";
    
    // Tiered candidates using standard non-deprecated Gemini 3.x and 2.5 models
    const modelsToTry = [
      primaryModel, 
      "gemini-3.5-flash", 
      "gemini-3.1-flash-lite", 
      "gemini-2.5-flash"
    ];
    
    // Remove duplicates keeping order
    const uniqueModels = Array.from(new Set(modelsToTry));
    
    let lastError: any = null;
    for (const modelName of uniqueModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`Trying Gemini content generation (Model: ${modelName}, Attempt: ${attempt})`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: params.contents,
            config: params.config
          });
          return response;
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
          
          if (isTransient && attempt < 2) {
            console.log(`[Fallback Log] Model ${modelName} hit transient error on attempt ${attempt}. Waiting 400ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 400));
            continue;
          }
          
          console.log(`[Fallback Log] Model ${modelName} attempt ${attempt} returned exception:`, errMsg);
          break; // Move to next model
        }
      }
    }
    throw lastError;
  };

  // Helper to run content stream generation with automated fallbacks
  const generateContentStreamWithFallback = async (ai: GoogleGenAI, params: { model: string; contents: any; config?: any }) => {
    const primaryModel = params.model || "gemini-3.5-flash";
    
    // Tiered candidates using standard non-deprecated Gemini 3.x and 2.5 models
    const modelsToTry = [
      primaryModel, 
      "gemini-3.5-flash", 
      "gemini-3.1-flash-lite", 
      "gemini-2.5-flash"
    ];
    
    // Remove duplicates keeping order
    const uniqueModels = Array.from(new Set(modelsToTry));
    
    let lastError: any = null;
    for (const modelName of uniqueModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`Trying Gemini content stream generation (Model: ${modelName}, Attempt: ${attempt})`);
          const stream = await ai.models.generateContentStream({
            model: modelName,
            contents: params.contents,
            config: params.config
          });
          return stream;
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const isTransient = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED");
          
          if (isTransient && attempt < 2) {
            console.log(`[Fallback Stream Log] Model ${modelName} hit transient error on attempt ${attempt}. Waiting 400ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, 400));
            continue;
          }
          
          console.log(`[Fallback Stream Log] Model ${modelName} attempt ${attempt} returned exception:`, errMsg);
          break; // Move to next model
        }
      }
    }
    throw lastError;
  };

  // POST endpoint for high-quality, server-run intelligence completion using gemini-3.5-flash
  app.post("/api/chat-intel", async (req, res) => {
    try {
      const { historyContents, systemInstruction, clientApiKey } = req.body;
      const apiKey = clientApiKey || getSecretGeminiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida no servidor." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await generateContentWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents: historyContents,
        config: {
          maxOutputTokens: 250,
          temperature: 0.7,
          systemInstruction: systemInstruction
        }
      });

      return res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Error inside /api/chat-intel endpoint:", err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // POST endpoint for streaming Gemini response using Server-Sent Events (SSE)
  app.post("/api/chat-intel-stream", async (req, res) => {
    try {
      const { historyContents, systemInstruction, clientApiKey } = req.body;
      const apiKey = clientApiKey || getSecretGeminiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida no servidor." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const responseStream = await generateContentStreamWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents: historyContents,
        config: {
          maxOutputTokens: 250,
          temperature: 0.7,
          systemInstruction: systemInstruction
        }
      });

      for await (const chunk of responseStream) {
        const text = chunk.text || "";
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      console.error("Error inside /api/chat-intel-stream endpoint:", err);
      res.write(`data: ${JSON.stringify({ error: formatGeminiError(err) })}\n\n`);
      res.end();
    }
  });

  // Generic and robust POST endpoint for server-side Gemini 3.5-flash content generation 
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt, systemInstruction, clientApiKey, model, responseMimeType } = req.body;
      const apiKey = clientApiKey || getSecretGeminiKey();
      
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida no servidor." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const selectedModel = model || "gemini-3.5-flash";

      const config: any = {};
      if (systemInstruction) config.systemInstruction = systemInstruction;
      if (responseMimeType) config.responseMimeType = responseMimeType;

      const response = await generateContentWithFallback(ai, {
        model: selectedModel,
        contents: prompt,
        config: config
      });

      return res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Error inside /api/generate endpoint:", err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // POST secure proxy endpoint for general Gemini content generation (supports history, tools, etc.)
  app.post("/api/gemini/generateContent", async (req, res) => {
    try {
      const { contents, model, config, clientApiKey } = req.body;
      const apiKey = clientApiKey || getSecretGeminiKey();
      
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida. Insira uma chave válida nos Ajustes." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const selectedModel = model || "gemini-3.5-flash";
      const response = await generateContentWithFallback(ai, {
        model: selectedModel,
        contents: contents,
        config: config
      });

      // Enrich response object with non-enumerable class getters (text, functionCalls) so they survive JSON serialization
      const responseJson = JSON.parse(JSON.stringify(response));
      try {
        if (response.text !== undefined) {
          responseJson.text = response.text;
        }
      } catch (e) {
        console.warn("Error copying response.text getter:", e);
      }
      try {
        if (response.functionCalls !== undefined) {
          responseJson.functionCalls = response.functionCalls;
        }
      } catch (e) {
        console.warn("Error copying response.functionCalls getter:", e);
      }

      return res.json(responseJson);
    } catch (err: any) {
      console.error("Erro no proxy server-side generateContent:", err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // POST secure proxy endpoint for Imagen image generation
  app.post("/api/gemini/generateImages", async (req, res) => {
    const { prompt, model, config, clientApiKey } = req.body;
    try {
      const apiKey = clientApiKey || getSecretGeminiKey();
      
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida. Insira uma chave válida nos Ajustes." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const targetModel = model || "gemini-3.1-flash-image";

      if (targetModel.startsWith("gemini-")) {
        // Nano banana series models use generateContent for image generation/editing
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: {
            parts: [{ text: prompt }]
          },
          config: {
            imageConfig: {
              aspectRatio: config?.aspectRatio || "1:1",
              imageSize: config?.imageSize || "1K"
            }
          }
        });

        let base64EncodeString = "";
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            base64EncodeString = part.inlineData.data;
            break;
          }
        }

        if (!base64EncodeString) {
          throw new Error("Nenhuma imagem gerada foi encontrada na resposta do modelo nano banana.");
        }

        return res.json({
          generatedImages: [
            {
              image: {
                imageBytes: base64EncodeString
              }
            }
          ]
        });
      } else {
        // Imagen series models use generateImages
        const response = await ai.models.generateImages({
          model: targetModel,
          prompt: prompt,
          config: config
        });
        return res.json(response);
      }
    } catch (err: any) {
      console.error("[Image Generation] Erro na geração de imagem com Gemini 3.1:", err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // POST endpoint for verifying Gemini API credentials in real-time
  app.post("/api/gemini/verify", async (req, res) => {
    try {
      const { geminiApiKey } = req.body;
      if (!geminiApiKey || typeof geminiApiKey !== "string" || !geminiApiKey.trim()) {
        return res.status(400).json({ success: false, message: "A chave API do Gemini é obrigatória para verificação." });
      }

      const trimApiKey = geminiApiKey.trim();
      
      // Realizar chamada HTTP direta à API do Gemini para evitar auto-detecção do Vertex AI em plataformas GCP/Cloud Run
      const verifyRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimApiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "responder 'ok'" }] }]
        })
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || "Erro retornado pela API do Gemini. Verifique a validade e permissões da chave.";
        return res.status(verifyRes.status).json({
          success: false,
          message: `Falha no Handshake: ${errorMessage}`
        });
      }

      const testRes = await verifyRes.json();
      const replyText = testRes.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (replyText) {
        return res.json({
          success: true,
          message: "Conexão bem-sucedida! Handshake concluído com a API do Gemini."
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "O Gemini respondeu sem texto válido. Verifique o acesso e cota da chave."
        });
      }
    } catch (err: any) {
      console.error("Error inside /api/gemini/verify endpoint:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "A API do Gemini retornou um erro de rede ao processar. Certifique-se de que a chave tem permissões e saldo de cobrança ativos."
      });
    }
  });

  // POST endpoint for Google Custom Search API retrieval to prevent client-side CORS and secure credentials
  app.post("/api/search/custom", async (req, res) => {
    try {
      const { query, key, cx } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "O termo de pesquisa 'query' é obrigatório." });
      }

      const searchKey = key || process.env.GOOGLE_API_KEY;
      const searchCx = cx || process.env.GOOGLE_CSE_ID;

      if (!searchKey || !searchCx) {
        return res.status(400).json({
          error: "Google Custom Search não configurado. Por favor, ajuste as chaves em 'Ajustes > Chaves Extras' ou no arquivo .env."
        });
      }

      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(searchKey)}&cx=${encodeURIComponent(searchCx)}&q=${encodeURIComponent(query)}`;
      const searchRes = await fetch(url);
      
      if (!searchRes.ok) {
        const errText = await searchRes.text();
        return res.status(searchRes.status).json({ error: `Erro na Google API: ${errText}` });
      }

      const data = await searchRes.json();
      return res.json(data);
    } catch (err: any) {
      console.error("Erro ao realizar busca Google Custom Search:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST endpoint for Tavily Web Search
  app.post("/api/search/tavily", async (req, res) => {
    try {
      const { query, apiKey } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "O termo de pesquisa 'query' é obrigatório." });
      }

      const tavilyKey = apiKey || process.env.TAVILY_API_KEY;
      if (!tavilyKey) {
        return res.status(400).json({
          error: "API Key do Tavily não configurada. Por favor, ajuste nos Chaves Extras do OSONE ou configure TAVILY_API_KEY no seu servidor."
        });
      }

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          search_depth: "smart",
          include_answer: true,
          max_results: 5
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Erro na Tavily API: ${errText}` });
      }

      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      console.error("Erro ao realizar busca via Tavily:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST endpoint for Google-Lens style visual intelligence searches (with or without Google Search grounding)
  app.post("/api/lens/query", async (req, res) => {
    try {
      const { image, internetSearch, clientApiKey } = req.body;
      if (!image) {
        return res.status(400).json({ error: "A imagem é obrigatória para a pesquisa da Lente." });
      }

      const apiKey = clientApiKey || getSecretGeminiKey();
      if (!apiKey) {
        return res.status(400).json({ error: "Chave API do Gemini não definida no servidor." });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Extract raw base64 data and mimeType
      let base64Data = image;
      let mimeType = "image/jpeg";
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      };

      const systemInstruction = `Você é o sintonizador visual da Lente OSONE (mecanismo inspirado no Google Lens).
Sua missão é identificar detalhadamente o objeto, marca, planta, animal, alimento, monumento ou texto contido na imagem enviada.
Você deve produzir uma resposta estruturada de forma impecável no formato JSON contendo campos úteis para o usuário.
Não inclua nenhuma formatação markdown extra fora do JSON bruto.`;

      const promptText = `Analise a imagem de foco fornecida. Identifique o que aparece nela e responda estritamente com um objeto JSON no seguinte formato:
{
  "name": "Nome específico do item identificado",
  "category": "Categoria / Especialidade",
  "confidence": 99, 
  "description": "Uma descrição rica, focada e cativante em língua portuguesa detalhando o item...",
  "tags": ["tag1", "tag2", "tag3"], 
  "details": {
    "marcaOuOrigem": "Marca fabricante, proveniência ou bioma original",
    "caracteristicaPrincipal": "A característica física ou estrutural mais marcante observada",
    "curiosidadeOuUso": "Curiosidade histórica, utilidade prática, ou conselho de manutenção"
  },
  "suggestions": ["Ação de pesquisa útil 1", "Sugestão de uso do item 2"]
}
`;

      const config: any = {
        systemInstruction,
        responseMimeType: "application/json",
      };

      // If internetSearch is true, enable Google Search Grounding for live Lens matches!
      if (internetSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts: [imagePart, { text: promptText }] },
        config: config
      });

      const responseText = response.text || "{}";
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(responseText.trim());
      } catch (parseErr) {
        console.warn("Raw Gemini answer could not be parsed as direct JSON, attempting to extract blocks:", responseText);
        // Fallback robust json extraction from markdown blocks
        const cleaned = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedData = JSON.parse(cleaned);
      }

      // Extract actual live Google Search citations if available in Gemini's grounding metadata!
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const citations: { title: string; uri: string }[] = [];
      if (groundingChunks && Array.isArray(groundingChunks)) {
        for (const chunk of groundingChunks) {
          if (chunk.web && chunk.web.uri) {
            citations.push({
              title: chunk.web.title || "Resultado da Web",
              uri: chunk.web.uri
            });
          }
        }
      }

      parsedData.citations = citations;
      return res.json(parsedData);
    } catch (err: any) {
      console.error("Erro na pesquisa da Lente OSONE:", err);
      return res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // POST endpoint for high-speed server-side webpage text scraping & parsing
  app.post("/api/scrape", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "O parâmetro 'url' é obrigatório." });
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        return res.status(400).json({ error: `Falha ao acessar o site: status ${response.status}` });
      }

      const html = await response.text();

      // Strips structural elements like script tags, stylesheets, and menus
      let text = html
        .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, '')
        .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, '')
        .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, '')
        .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, '')
        .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, '')
        .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      text = text
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Retain a clean set of text characters up to 12k to avoid bloating context
      const cleanText = text.slice(0, 12000);

      return res.json({ text: cleanText });
    } catch (err: any) {
      console.error("Erro ao analisar página no servidor:", err);
      return res.status(500).json({ error: "Erro de raspagem: " + err.message });
    }
  });

  app.get("/api/system-docs", (req, res) => {
    try {
      const { file } = req.query;
      if (!file || typeof file !== "string") {
        return res.status(400).json({ error: "Faltando o parâmetro do arquivo." });
      }
      const allowed = ["manifesto.md", "capacidades.md", "memoria_evolutiva.md"];
      if (!allowed.includes(file)) {
        return res.status(400).json({ error: "Arquivo proibido ou não mapeado nas diretrizes." });
      }
      const filePath = path.join(process.cwd(), "src", "documentos_osone", file);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Arquivo ${file} não existe no diretório.` });
      }
      const text = fs.readFileSync(filePath, "utf-8");
      return res.json({ text });
    } catch (err: any) {
      console.error("Erro ao ler documento de sistema:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ====== TIKTOK LIVE CO-PILOT API ENDPOINTS ======
  app.get("/api/tiktok/state", (req, res) => {
    res.json({
      status: tiktokStatus,
      username: currentTikTokUser,
      isAutoRespondActive: isTikTokAutoRespondActive,
      viewerCount: tiktokViewerCount,
      likeCount: tiktokLikeCount,
      sessionId: tiktokSessionId,
      targetIdc: tiktokTargetIdc,
      logs: tiktokEventLogs
    });
  });

  app.post("/api/tiktok/connect", async (req, res) => {
    try {
      const { username, simulate, sessionId, targetIdc } = req.body;
      
      if (sessionId !== undefined) {
        tiktokSessionId = String(sessionId).trim();
      }

      if (targetIdc !== undefined) {
        tiktokTargetIdc = String(targetIdc).trim();
      }

      if (simulate) {
        startSimulatedLive();
        return res.json({ status: "success", message: "Simulação de live do TikTok iniciada no OSONE!" });
      }

      if (!username || typeof username !== "string" || !username.trim()) {
        return res.status(400).json({ error: "O nome de usuário do TikTok é obrigatório." });
      }

      const cleanUser = username.trim().replace(/^@/, "");
      
      // Async trigger connection so we don't hold the HTTP request indefinitely
      connectToTikTokLive(cleanUser, tiktokSessionId, tiktokTargetIdc).catch(e => {
        console.error("Delayed connection failed:", e);
      });

      res.json({ 
        status: "success", 
        message: `Sinalização enviada com sucesso! Conectando à webcast de @${cleanUser}...` 
      });
    } catch (err: any) {
      console.error("Erro ao conectar TikTok:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tiktok/disconnect", async (req, res) => {
    try {
      await disconnectFromTikTokLive();
      res.json({ status: "success", message: "Conectividade do TikTok Live suspensa de forma íntegra." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tiktok/config", (req, res) => {
    const { isAutoRespondActive } = req.body;
    if (isAutoRespondActive !== undefined) {
      isTikTokAutoRespondActive = !!isAutoRespondActive;
    }
    res.json({ 
      status: "success", 
      isAutoRespondActive: isTikTokAutoRespondActive 
    });
  });

  app.post("/api/tiktok/clear-logs", (req, res) => {
    tiktokEventLogs = [
      {
        id: "clear-" + Date.now(),
        type: "system",
        user: "Sistema",
        message: "Histórico de eventos do TikTok Live limpo com segurança.",
        timestamp: Date.now()
      }
    ];
    res.json({ status: "success" });
  });

  // POST endpoint for verifying Elevenlabs credentials and options in real-time
  app.post("/api/elevenlabs/verify", async (req, res) => {
    try {
      const { elevenLabsApiKey, elevenLabsVoiceId } = req.body;
      if (!elevenLabsApiKey || typeof elevenLabsApiKey !== "string" || !elevenLabsApiKey.trim()) {
        return res.status(400).json({ success: false, message: "A chave API da Elevenlabs é obrigatória para verificação." });
      }

      const trimApiKey = elevenLabsApiKey.trim();

      // Validate Api Key via ElevenLabs User Info Endpoint
      const userRes = await fetch("https://api.elevenlabs.io/v1/user", {
        method: "GET",
        headers: {
          "xi-api-key": trimApiKey
        }
      });

      if (!userRes.ok) {
        const errText = await userRes.text();
        let message = "Chave de API inválida ou expirada. Verifique as credenciais digitadas.";
        try {
          const parsed = JSON.parse(errText);
          if (parsed.detail?.message) {
            message = parsed.detail.message;
          } else if (parsed.detail?.status === "invalid-api-key") {
            message = "Chave API Elevenlabs inválida. Por favor, revise os caracteres.";
          }
        } catch (_) {}
        return res.status(userRes.status === 401 ? 401 : 400).json({ success: false, message });
      }

      const userData = await userRes.json();
      const userTier = userData.subscription?.tier || "Free/Trial";
      const characterCount = userData.subscription?.character_count || 0;
      const characterLimit = userData.subscription?.character_limit || 10000;
      const leftCount = Math.max(0, characterLimit - characterCount);

      const subInfo = `Plano: ${userTier} (${leftCount.toLocaleString()} caracteres restantes)`;

      // If Voice ID was provided, validate it as well
      if (elevenLabsVoiceId && typeof elevenLabsVoiceId === "string" && elevenLabsVoiceId.trim()) {
        const trimVoiceId = elevenLabsVoiceId.trim();
        const voiceRes = await fetch(`https://api.elevenlabs.io/v1/voices/${trimVoiceId}`, {
          method: "GET",
          headers: {
            "xi-api-key": trimApiKey
          }
        });

        if (!voiceRes.ok) {
          return res.status(400).json({
            success: false,
            message: `A chave de API é válida! (${subInfo}), mas o ID da voz "${trimVoiceId}" não foi encontrado ou é inacessível para esta chave.`
          });
        }

        const voiceData = await voiceRes.json();
        const voiceName = voiceData.name || "Voz Desconhecida";
        return res.json({
          success: true,
          message: `Conexão bem-sucedida! Chave de API válida (${subInfo}). Voz encontrada: "${voiceName}".`
        });
      }

      return res.json({
        success: true,
        message: `Conexão bem-sucedida! Chave de API ativa (${subInfo}). Nenhum Voice ID foi inserido, será utilizada a voz padrão.`
      });

    } catch (err: any) {
      console.error("Error inside /api/elevenlabs/verify endpoint:", err);
      res.status(500).json({ success: false, message: `Falha ao tentar conectar ao servidor da ElevenLabs: ${err.message}` });
    }
  });

  // POST endpoint for generating step-by-step simple integration plans
  app.post("/api/integrations/plan", async (req, res) => {
    try {
      const { targetIntegration, clientApiKey } = req.body;
      
      if (!targetIntegration || typeof targetIntegration !== "string") {
        return res.status(400).json({ error: "O nome da integração é obrigatório." });
      }

      const apiKey = clientApiKey || getSecretGeminiKey();

      if (!apiKey) {
        return res.status(400).json({ 
          error: "A chave API do Gemini não está definida no OSONE ou nos segredos. Por favor, configure sua chave nos Ajustes." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        vertexai: false,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `Gere um guia de plano de integração extremamente simples, didático e prático, estruturado em passos numerados fáceis (de 3 a 5 passos), explicando detalhadamente o que o usuário precisa preparar, configurar e programar em seu app para conseguir integrar o sistema desejado.
      
      Algumas pessoas não sabem por onde começar ou o que precisam (como Chave de API, URLs de retorno, webhook, bibliotecas). Explique de forma amigável, acolhedora e encorajadora para que qualquer pessoa (mesmo leigos) consiga entender o que precisa fazer e o que precisa obter nos painéis parceiros.

      Sistema que o usuário deseja integrar: "${targetIntegration}"

      Siga exatamente esta estrutura no seu resultado Markdown:
      1. **Introdução**: Uma introdução breve, encorajadora e amigável em português explicando o que é o sistema e confirmando que é super viável integrá-lo.
      2. **Passo a Passo**: Divida em passos claramente numerados (ex: # 1, # 2, etc.), usando palavras simples e destacando termos técnicos essenciais em negrito (ex: **Token de Acesso**, **Painel de Desenvolvedor**, **Webhooks**, **Servidor**).
      3. **Dica Pro**: Uma dica rápida para manter as senhas protegidas ou sobre como testar de forma simulada.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "Você é um Engenheiro de API de Software experiente, empático e de linguagem extremamente clara e acessível."
        }
      });

      res.json({ plan: response.text || "Ops! Não foi possível gerar o plano. Tente novamente." });
    } catch (error: any) {
      console.error("Erro no endpoint de planejador de integrações:", error);
      res.status(500).json({ error: error?.message || "Erro interno ao gerar o plano de integração." });
    }
  });

  // Handle upgrade event manually to route to the /api/live-ws or /api/elevenlabs-ws websocket bridge
  server.on("upgrade", (request, socket, head) => {
    try {
      const reqUrl = request.url || "";
      const pathname = reqUrl.split("?")[0].replace(/\/$/, "");
      
      if (pathname === "/api/live-ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else if (pathname === "/api/elevenlabs-ws") {
        elWss.handleUpgrade(request, socket, head, (ws) => {
          elWss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (e) {
      console.error("Upgrade routing failed:", e);
      socket.destroy();
    }
  });

  // Handle incoming websocket connections
  wss.on("connection", async (clientWs, req) => {
    console.log("Client connected to the server-side OSONE G5 Live Bridge WS");
    
    const reqUrl = req.url || "";
    const queryString = reqUrl.includes("?") ? reqUrl.split("?")[1] : "";
    const searchParams = new URLSearchParams(queryString);
    const clientApiKey = searchParams.get("apiKey");
    
    // Fallback to server's loaded GEMINI_API_KEY if the client key is empty/not configured
    const apiKey = clientApiKey || getSecretGeminiKey();

    if (!apiKey) {
      console.error("Error: GEMINI_API_KEY is not defined");
      clientWs.send(JSON.stringify({ 
        type: "error", 
        error: "Chave API do Gemini não definida. Insira uma chave válida nos ajustes." 
      }));
      clientWs.close();
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      vertexai: false,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    let bidiSession: any = null;

    clientWs.on("message", async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        
        if (message.type === "setup") {
          const { model, config } = message;
          const targetModel = model || "gemini-3.1-flash-live-preview";
          console.log(`Connecting Live API on server mode: ${targetModel}`);
          
          try {
            bidiSession = await ai.live.connect({
              model: targetModel,
              config: config,
              callbacks: {
                onmessage: (liveResponse: any) => {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(liveResponse));
                  }
                },
                onclose: () => {
                  console.log("Gemini Live connection closed by Google endpoint");
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close();
                  }
                },
                onerror: (err: any) => {
                  console.error("Gemini Live server API error callback:", err);
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ 
                      type: "error", 
                      error: err?.message || "Ops, ocorreu um erro interno na conexão Neural." 
                    }));
                  }
                }
              }
            });
            console.log("Server successfully connected to Google Gemini Live endpoint!");
          } catch (connectError: any) {
            console.error("Failed to connect to Gemini Live:", connectError);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: "error", 
                error: `Falha na conexão Neural do Servidor: ${connectError?.message || connectError}` 
              }));
              clientWs.close();
            }
          }
        } else if (message.type === "realtime_input") {
          if (bidiSession) {
            bidiSession.sendRealtimeInput(message.input);
          }
        } else if (message.type === "tool_response") {
          if (bidiSession) {
            bidiSession.sendToolResponse(message.payload);
          }
        }
      } catch (parseError: any) {
        console.error("WS Message processing error:", parseError);
      }
    });

    clientWs.on("close", () => {
      console.log("Client disconnected from websocket bridge, cleaning up");
      if (bidiSession) {
        try {
          bidiSession.close();
        } catch (e) {
          console.error("Failed to cleanly close bidi session on client departure:", e);
        }
      }
    });

    clientWs.on("error", (e) => {
      console.error("Client WS error:", e);
      if (bidiSession) {
        try { bidiSession.close(); } catch (_) {}
      }
    });
  });

  // Handle incoming ElevenLabs streaming proxy connections
  elWss.on("connection", async (clientWs, req) => {
    console.log("Client connected to the server-side ElevenLabs WS Proxy");
    
    const reqUrl = req.url || "";
    const queryString = reqUrl.includes("?") ? reqUrl.split("?")[1] : "";
    const searchParams = new URLSearchParams(queryString);
    
    const voiceId = searchParams.get("voiceId") || "21m00Tcm4TlvDq8ikWAM"; // default Rachel
    const modelId = searchParams.get("modelId") || "eleven_flash_v2_5";
    const clientElApiKey = searchParams.get("apiKey") || "";
    const stability = parseFloat(searchParams.get("stability") || "0.5");
    const similarityBoost = parseFloat(searchParams.get("similarityBoost") || "0.75");
    
    const elApiKey = clientElApiKey || process.env.ELEVENLABS_API_KEY || "";
    
    if (!elApiKey) {
      console.error("ElevenLabs API Key not configured on server or client.");
      clientWs.send(JSON.stringify({ error: "Chave API ElevenLabs não configurada." }));
      clientWs.close();
      return;
    }
    
    const outboundUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}`;
    
    console.log(`Establishing outbound connection to ElevenLabs: wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input`);
    
    // Create connection to ElevenLabs using the global polyfilled WebSocket
    const elWs = new WebSocket(outboundUrl);
    
    elWs.on("open", () => {
      console.log("ElevenLabs outbound WebSocket successfully established");
      // Send initial settings and authentication
      const initMsg = {
        text: " ",
        xi_api_key: elApiKey,
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost
        },
        generation_config: {
          chunk_length_schedule: [120, 160, 250, 290]
        }
      };
      elWs.send(JSON.stringify(initMsg));
    });
    
    elWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    });
    
    elWs.on("error", (err) => {
      console.error("ElevenLabs outbound WS error:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: `ElevenLabs Error: ${err.message}` }));
      }
    });
    
    elWs.on("close", (code, reason) => {
      console.log(`ElevenLabs outbound WS closed. Code: ${code}, Reason: ${reason}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });
    
    clientWs.on("message", (msg) => {
      if (elWs.readyState === WebSocket.OPEN) {
        try {
          const parsed = JSON.parse(msg.toString());
          elWs.send(JSON.stringify(parsed));
        } catch (_) {
          // If it's raw text/string, send as text object
          elWs.send(JSON.stringify({ text: msg.toString() }));
        }
      }
    });
    
    clientWs.on("error", (err) => {
      console.error("ElevenLabs Proxy client WS error:", err);
      if (elWs.readyState === WebSocket.OPEN) {
        elWs.close();
      }
    });
    
    clientWs.on("close", () => {
      console.log("ElevenLabs Proxy client WS closed");
      if (elWs.readyState === WebSocket.OPEN) {
        elWs.close();
      }
    });
  });

  // Integration with Vite dev middleware for hot loading frontend assets in dev, serve statically in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server mounted on Express middleware");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log(`Serving static files from ${distPath}`);
  }

  if (process.env.VERCEL !== "1") {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Express Server connected and running on http://0.0.0.0:${PORT}`);
    });
  }

  return app;
}

const serverPromise = startServer().catch((error) => {
  console.error("Server execution crashed:", error);
  throw error;
});

export default serverPromise;
