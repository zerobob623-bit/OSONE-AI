/**
 * Conexão segura via proxy WebSocket local para a API Gemini Live Multimodal
 */
export async function connectToLiveBridge(options: {
  model: string;
  config: any;
  callbacks: {
    onopen?: () => void;
    onmessage?: (message: any) => void;
    onclose?: () => void;
    onerror?: (error: any) => void;
  };
  apiKey: string;
}) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/api/live-ws${options.apiKey ? `?apiKey=${encodeURIComponent(options.apiKey)}` : ''}`;
  
  console.log("OSONE G5 Client: Conectando à ponte neural via proxy WebSocket local:", wsUrl);
  
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log("OSONE G5 Client: Canal WebSocket estabelecido de forma segura!");
    // Envia a mensagem de setup inicial que o proxy espera na linha 626 do server.ts
    ws.send(JSON.stringify({
      type: "setup",
      model: options.model,
      config: options.config
    }));
    
    if (options.callbacks?.onopen) {
      options.callbacks.onopen();
    }
  };
  
  ws.onmessage = (event) => {
    try {
      const liveResponse = JSON.parse(event.data);
      
      // Se for uma conexão de erro reportada pelo proxy
      if (liveResponse.type === "error") {
        console.error("OSONE G5 Client neural error:", liveResponse.error);
        if (options.callbacks?.onerror) {
          options.callbacks.onerror(new Error(liveResponse.error));
        }
        return;
      }
      
      // Captura o sinal de GoAway / limites se houver e repassa
      const isGoAway = liveResponse?.goAway || 
                       liveResponse?.goaway || 
                       liveResponse?.serverContent?.goAway || 
                       liveResponse?.serverContent?.goaway ||
                       (liveResponse?.serverContent?.modelTurn?.parts?.some((p: any) => p.text && p.text.toLowerCase().includes("goaway")));
      
      if (isGoAway) {
        console.warn("OSONE G5 Client: Sinal GoAway recebido. Encerrando sessão de voz.");
        ws.close();
        if (options.callbacks?.onclose) {
          options.callbacks.onclose();
        }
        return;
      }
      
      if (options.callbacks?.onmessage) {
        options.callbacks.onmessage(liveResponse);
      }
    } catch (e) {
      console.error("OSONE G5 Client: Error decoding proxy websocket message:", e);
    }
  };
  
  ws.onclose = () => {
    console.log("OSONE G5 Client: Conexão neural via proxy encerrada.");
    if (options.callbacks?.onclose) {
      options.callbacks.onclose();
    }
  };
  
  ws.onerror = (err) => {
    console.error("OSONE G5 Client: Erro na conexão com o proxy local:", err);
    if (options.callbacks?.onerror) {
      options.callbacks.onerror(err);
    }
  };
  
  return {
    sendRealtimeInput: (input: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "realtime_input",
          input: input
        }));
      }
    },
    sendToolResponse: (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "tool_response",
          payload: payload
        }));
      }
    },
    close: () => {
      try {
        ws.close();
      } catch (e) {}
    }
  };
}
