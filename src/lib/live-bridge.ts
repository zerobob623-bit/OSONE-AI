import { GoogleGenAI } from "@google/genai";

export interface LiveBridgeSession {
  sendRealtimeInput: (input: any) => void;
  sendToolResponse: (payload: any) => void;
  close: () => void;
}

/**
 * Conexão universal para a API Gemini Live Multimodal
 * Suporta servidor Express local (via WebSocket proxy /api/live-ws) 
 * e ambientes Serverless / Vercel (via conexão direta client-side @google/genai).
 */
/**
 * O nome de um modelo não é uma verdade que dê para assumir do lado do cliente.
 *
 * Modelos de pré-visualização entram e saem de catálogo, e cada conta tem acesso a um conjunto
 * diferente deles. Fixar um único nome significa que, no dia em que ele sair do ar (ou não
 * estiver liberado para aquela chave), a voz simplesmente para de funcionar — sem alternativa.
 *
 * Por isso `model` aceita uma LISTA em ordem de preferência: a conexão tenta o primeiro, e só
 * desce para o próximo se a API recusar aquele nome. O último da lista deve ser sempre o mais
 * conservador, o que se sabe que funciona.
 */
export async function connectToLiveBridge(options: {
  model: string | string[];
  config: any;
  callbacks: {
    onopen?: () => void;
    onmessage?: (message: any) => void;
    onclose?: () => void;
    onerror?: (error: any) => void;
  };
  apiKey: string;
}): Promise<LiveBridgeSession> {
  // 1. Resolver Chave de API. Usamos SOMENTE a chave que o próprio usuário configurou nos
  // ajustes do OSONE — nunca buscamos a chave do servidor aqui, pois isso a exporia em texto
  // puro para qualquer visitante do app (a chave do servidor só é usada server-side, dentro
  // do proxy WebSocket /api/live-ws, que nunca a devolve ao cliente).
  const effectiveApiKey = options.apiKey?.trim();

  const modelosCandidatos = (Array.isArray(options.model) ? options.model : [options.model])
    .map(m => String(m || '').trim())
    .filter(Boolean);
  const modeloPreferido = modelosCandidatos[0] || "gemini-3.1-flash-live-preview";

  /**
   * Um erro de "modelo não existe / sem acesso" merece a próxima tentativa; um erro de rede,
   * cota ou chave inválida, não — insistir nos outros nomes só multiplicaria a mesma falha e
   * atrasaria a mensagem certa para o usuário.
   */
  const pareceModeloIndisponivel = (erro: any): boolean => {
    const texto = `${erro?.message || erro?.error?.message || erro || ''}`.toLowerCase();
    const status = erro?.status ?? erro?.code ?? erro?.error?.code;
    if (status === 404 || status === 400) return true;
    return texto.includes('not found') ||
           texto.includes('not_found') ||
           texto.includes('is not supported') ||
           texto.includes('does not exist') ||
           texto.includes('unsupported model') ||
           texto.includes('invalid model') ||
           texto.includes('não encontrado');
  };

  // 2. Detectar se está rodando em ambiente Serverless/Vercel
  const isVercelServerless = 
    typeof window !== "undefined" && 
    (window.location.hostname.includes("vercel.app") || 
     window.location.hostname.includes("vercel.dev") ||
     window.location.hostname.includes("now.sh") ||
     window.location.search.includes("serverless=true"));

  // Função interna para conexão direta do Gemini Live no cliente (Vercel / Fallback)
  const connectDirectlyToGeminiLive = async (key: string): Promise<LiveBridgeSession> => {
    console.log("OSONE G5 Client: Conectando diretamente ao Gemini Live API (Modo Serverless / Vercel)...");
    
    if (!key) {
      const err = new Error("Chave API do Gemini não fornecida. Nesta hospedagem, insira sua própria chave do Gemini nos ajustes do OSONE para usar a voz em tempo real.");
      if (options.callbacks?.onerror) options.callbacks.onerror(err);
      throw err;
    }

    const ai = new GoogleGenAI({ apiKey: key, vertexai: false });

    /**
     * Percorre os candidatos até um conectar. É aqui que a preferência por um modelo de áudio
     * nativo (que canta, assobia e sustenta melodia) deixa de ser um palpite e vira um teste
     * de verdade: se a conta tiver acesso a ele, ele é usado; se não, cai no seguinte sem que
     * o usuário perceba nada além da voz continuar funcionando.
     */
    const conectarComCandidatos = async () => {
      let ultimoErro: any = null;
      for (let i = 0; i < modelosCandidatos.length; i++) {
        const nomeDoModelo = modelosCandidatos[i];
        try {
          return await tentarConectar(nomeDoModelo);
        } catch (erro: any) {
          ultimoErro = erro;
          const aindaHaAlternativa = i < modelosCandidatos.length - 1;
          if (aindaHaAlternativa && pareceModeloIndisponivel(erro)) {
            console.warn(`OSONE G5 Client: modelo "${nomeDoModelo}" indisponível para esta chave. Tentando "${modelosCandidatos[i + 1]}"...`);
            continue;
          }
          throw erro;
        }
      }
      throw ultimoErro || new Error("Nenhum modelo de voz disponível.");
    };

    const tentarConectar = async (targetModel: string) => {
      const directSession = await ai.live.connect({
        model: targetModel,
        config: options.config,
        callbacks: {
          onmessage: (data: any) => {
            const isGoAway = data?.goAway || 
                             data?.goaway || 
                             data?.serverContent?.goAway || 
                             data?.serverContent?.goaway;
            if (isGoAway) {
              console.warn("OSONE G5 Client: Sinal GoAway recebido da API Gemini Live.");
              try { directSession.close(); } catch (_) {}
              if (options.callbacks?.onclose) options.callbacks.onclose();
              return;
            }

            if (options.callbacks?.onmessage) {
              options.callbacks.onmessage(data);
            }
          },
          onclose: () => {
            console.log("OSONE G5 Client: Sessão Gemini Live direta encerrada.");
            if (options.callbacks?.onclose) options.callbacks.onclose();
          },
          onerror: (err: any) => {
            console.error("OSONE G5 Client: Erro na sessão Gemini Live direta:", err);
            if (options.callbacks?.onerror) options.callbacks.onerror(err);
          }
        }
      });

      console.log(`OSONE G5 Client: Conexão Gemini Live direta estabelecida com o modelo "${targetModel}"!`);
      if (options.callbacks?.onopen) {
        options.callbacks.onopen();
      }

      return {
        sendRealtimeInput: (input: any) => {
          try {
            if (directSession && typeof directSession.sendRealtimeInput === "function") {
              directSession.sendRealtimeInput(input);
            }
          } catch (e) {
            console.error("Erro ao enviar input realtime direto:", e);
          }
        },
        sendToolResponse: (payload: any) => {
          try {
            if (directSession && typeof directSession.sendToolResponse === "function") {
              directSession.sendToolResponse(payload);
            }
          } catch (e) {
            console.error("Erro ao enviar resposta de ferramenta direta:", e);
          }
        },
        close: () => {
          try {
            if (directSession && typeof directSession.close === "function") {
              directSession.close();
            }
          } catch (_) {}
        }
      };
    };

    try {
      return await conectarComCandidatos();
    } catch (directErr: any) {
      console.error("OSONE G5 Client: Falha na conexão direta do Gemini Live:", directErr);
      if (options.callbacks?.onerror) {
        options.callbacks.onerror(directErr);
      }
      throw directErr;
    }
  };

  // Se estiver explicitamente no Vercel / Serverless, faz a conexão direta imediata sem tentar o WebSocket Proxy
  if (isVercelServerless) {
    return await connectDirectlyToGeminiLive(effectiveApiKey || "");
  }

  // Tenta conexão via WebSocket Proxy Local com Fallback Automático para Conexão Direta
  return new Promise<LiveBridgeSession>((resolve) => {
    let hasFallbackTriggered = false;
    /**
     * O fallback só existe enquanto o proxy AINDA NÃO entregou uma sessão.
     *
     * Sem esta trava, um erro no socket DEPOIS de a conexão ter aberto (queda de rede, servidor
     * reiniciando) caía no fallback e abria uma segunda sessão direta no Gemini — que ninguém
     * recebia, porque a Promise já tinha sido resolvida com a sessão do proxy. O resultado eram
     * duas coisas ruins ao mesmo tempo: uma sessão fantasma consumindo cota e despejando áudio
     * pelos callbacks sem que o app pudesse fechá-la, e o onclose nunca sendo avisado — a voz
     * morria enquanto a interface continuava mostrando "conectado".
     */
    let proxyJaEntregouSessao = false;

    const triggerFallback = async () => {
      if (hasFallbackTriggered || proxyJaEntregouSessao) return;
      hasFallbackTriggered = true;
      console.warn("OSONE G5 Client: Proxy local indisponível. Ativando fallback para conexão direta com Gemini Live...");
      try {
        const session = await connectDirectlyToGeminiLive(effectiveApiKey || "");
        resolve(session);
      } catch (err) {
        resolve({
          sendRealtimeInput: () => {},
          sendToolResponse: () => {},
          close: () => {}
        });
      }
    };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/live-ws${effectiveApiKey ? `?apiKey=${encodeURIComponent(effectiveApiKey)}` : ''}`;

    console.log("OSONE G5 Client: Tentando conectar via proxy WebSocket local:", wsUrl);
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      triggerFallback();
      return;
    }

    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        console.warn("OSONE G5 Client: Timeout ao conectar no proxy local. Usando fallback direto...");
        try { ws.close(); } catch (_) {}
        triggerFallback();
      }
    }, 2500);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log("OSONE G5 Client: Canal WebSocket estabelecido via servidor local!");
      if (ws) {
        // O proxy fala com um modelo por vez. Vai o preferido; se ele não existir para esta
        // chave, o erro volta pelo canal e o app cai na conexão direta, que sabe percorrer a
        // lista inteira de candidatos.
        ws.send(JSON.stringify({
          type: "setup",
          model: modeloPreferido,
          candidatos: modelosCandidatos,
          config: options.config
        }));
      }

      if (options.callbacks?.onopen) {
        options.callbacks.onopen();
      }

      proxyJaEntregouSessao = true;
      resolve({
        sendRealtimeInput: (input: any) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "realtime_input", input }));
          }
        },
        sendToolResponse: (payload: any) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "tool_response", payload }));
          }
        },
        close: () => {
          try { ws?.close(); } catch (e) {}
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const liveResponse = JSON.parse(event.data);
        if (liveResponse.type === "error") {
          console.error("OSONE G5 Client neural error via proxy:", liveResponse.error);
          if (options.callbacks?.onerror) {
            options.callbacks.onerror(new Error(liveResponse.error));
          }
          return;
        }

        const isGoAway = liveResponse?.goAway || 
                         liveResponse?.goaway || 
                         liveResponse?.serverContent?.goAway || 
                         liveResponse?.serverContent?.goaway;

        if (isGoAway) {
          console.warn("OSONE G5 Client: Sinal GoAway recebido. Encerrando sessão de voz.");
          try { ws?.close(); } catch (_) {}
          if (options.callbacks?.onclose) options.callbacks.onclose();
          return;
        }

        if (options.callbacks?.onmessage) {
          options.callbacks.onmessage(liveResponse);
        }
      } catch (e) {
        console.error("OSONE G5 Client: Erro ao decodificar mensagem do proxy websocket:", e);
      }
    };

    ws.onclose = () => {
      clearTimeout(connectionTimeout);
      if (!hasFallbackTriggered) {
        console.log("OSONE G5 Client: Conexão via proxy encerrada.");
        if (options.callbacks?.onclose) options.callbacks.onclose();
      }
    };

    ws.onerror = (err) => {
      clearTimeout(connectionTimeout);
      console.warn("OSONE G5 Client: Erro na conexão com o proxy local:", err);
      triggerFallback();
    };
  });
}
