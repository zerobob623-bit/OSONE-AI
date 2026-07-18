import React, { StrictMode, Component, ReactNode, ErrorInfo } from 'react';
import {createRoot} from 'react-dom/client';

// Safe global process mockup for client-side static environments (e.g. Vercel)
if (typeof window !== 'undefined') {
  const g = window as any;
  g.process = g.process || {};
  g.process.env = g.process.env || {};
  if (typeof g.process.env.GEMINI_API_KEY === 'undefined') {
    g.process.env.GEMINI_API_KEY = '';
  }
}

// --- Vercel/Static Direct Client-Side Fallback for Gemini and Services ---
const originalFetch = window.fetch.bind(window);

const customFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (urlStr.includes("/api/")) {
    const isGeminiContentProxy = urlStr.includes("/api/gemini/generateContent") || urlStr.includes("/api/chat-intel");
    const isGeminiGenerateProxy = urlStr.includes("/api/generate");
    const isGeminiImageProxy = urlStr.includes("/api/gemini/generateImages");
    const isGeminiVerifyProxy = urlStr.includes("/api/gemini/verify");
    const isElevenlabsVerifyProxy = urlStr.includes("/api/elevenlabs/verify");
    const isMemorySyncSave = urlStr.includes("/api/memory-sync/save");
    const isMemorySyncLoad = urlStr.includes("/api/memory-sync/load/");

    if (
      isGeminiContentProxy ||
      isGeminiGenerateProxy ||
      isGeminiImageProxy ||
      isGeminiVerifyProxy ||
      isElevenlabsVerifyProxy ||
      isMemorySyncSave ||
      isMemorySyncLoad
    ) {
      const hasBackendServer = window.location.hostname.includes(".run.app") || 
                               window.location.hostname.includes("localhost") || 
                               window.location.hostname.includes("127.0.0.1") ||
                               window.location.hostname.includes("webcontainer-api.io");

      const isVercel = !hasBackendServer && (
        window.location.hostname.includes("vercel.app") || 
        window.location.hostname.includes("github.io") || 
        window.location.hostname.includes("netlify.app")
      );
      
      let useFallback = isVercel;
      let response: Response | null = null;

      if (!isVercel) {
        try {
          response = await originalFetch(input, init);
          const contentType = response?.headers?.get("content-type") || "";
          if (
            response.status === 404 || 
            response.status === 502 || 
            response.status === 504 ||
            (contentType.includes("text/html") && urlStr.includes("/api/"))
          ) {
            useFallback = true;
          }
        } catch (e) {
          useFallback = true;
        }
      }

      if (useFallback) {
        let clientApiKey = "";
        let geminiModel = "gemini-3.5-flash";
        try {
          const stored = localStorage.getItem("osone_api_keys");
          if (stored) {
            const parsed = JSON.parse(stored);
            clientApiKey = parsed.gemini || "";
            geminiModel = parsed.geminiModel || "gemini-3.5-flash";
          }
        } catch (_) {}

        let reqBody: any = {};
        if (init && init.body) {
          try {
            reqBody = JSON.parse(init.body as string);
            if (!clientApiKey) {
              clientApiKey = reqBody.clientApiKey || reqBody.geminiApiKey || "";
            }
          } catch (_) {}
        }

        if (clientApiKey) {
          console.log("[Vercel-OSONE Fallback] Intercepting fetch and making direct client-side call to Google Gemini API...");
          
          try {
            if (isGeminiVerifyProxy) {
              const verifyApiKey = reqBody.geminiApiKey || clientApiKey;
              const directRes = await originalFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${verifyApiKey.trim()}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: "responder 'ok'" }] }]
                })
              });

              if (!directRes.ok) {
                const errText = await directRes.text();
                return new Response(JSON.stringify({ success: false, message: `Falha no Handshake: ${errText}` }), {
                  status: directRes.status,
                  headers: { "Content-Type": "application/json" }
                });
              }

              const testRes = await directRes.json();
              const replyText = testRes.candidates?.[0]?.content?.parts?.[0]?.text;
              if (replyText) {
                return new Response(JSON.stringify({
                  success: true,
                  message: "Conexão bem-sucedida! Handshake concluído com a API do Gemini (Cliente Direto)."
                }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                });
              } else {
                return new Response(JSON.stringify({
                  success: false,
                  message: "O Gemini respondeu sem texto válido."
                }), {
                  status: 400,
                  headers: { "Content-Type": "application/json" }
                });
              }
            }

            if (isGeminiContentProxy) {
              const selectedModel = reqBody.model || geminiModel;
              const contents = reqBody.contents || (reqBody.historyContents ? reqBody.historyContents : []);
              const systemInstruction = reqBody.config?.systemInstruction || reqBody.systemInstruction || "";
              
              let sysInstructionParts = undefined;
              if (systemInstruction) {
                sysInstructionParts = {
                  parts: [{ text: systemInstruction }]
                };
              }

              const generationConfig: any = {};
              if (reqBody.config?.temperature !== undefined) generationConfig.temperature = reqBody.config.temperature;
              if (reqBody.config?.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = reqBody.config.maxOutputTokens;
              if (reqBody.config?.responseMimeType !== undefined) generationConfig.responseMimeType = reqBody.config.responseMimeType;
              if (reqBody.responseMimeType !== undefined) generationConfig.responseMimeType = reqBody.responseMimeType;

              const payload: any = { contents };
              if (sysInstructionParts) payload.systemInstruction = sysInstructionParts;
              if (Object.keys(generationConfig).length > 0) payload.generationConfig = generationConfig;

              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${clientApiKey.trim()}`;
              const directRes = await originalFetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });

              if (!directRes.ok) {
                const errText = await directRes.text();
                return new Response(JSON.stringify({ error: `Direct Gemini error: ${errText}` }), {
                  status: directRes.status,
                  headers: { "Content-Type": "application/json" }
                });
              }

              const geminiData = await directRes.json();
              const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              const formattedOutput = {
                text: textResult,
                candidates: geminiData.candidates
              };

              return new Response(JSON.stringify(formattedOutput), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            }

            if (isGeminiGenerateProxy) {
              const selectedModel = reqBody.model || geminiModel;
              const promptText = reqBody.prompt || "";
              const systemInstruction = reqBody.systemInstruction || "";

              let sysInstructionParts = undefined;
              if (systemInstruction) {
                sysInstructionParts = {
                  parts: [{ text: systemInstruction }]
                };
              }

              const generationConfig: any = {};
              if (reqBody.responseMimeType !== undefined) generationConfig.responseMimeType = reqBody.responseMimeType;

              const contents = [{
                role: "user",
                parts: [{ text: promptText }]
              }];

              const payload: any = { contents };
              if (sysInstructionParts) payload.systemInstruction = sysInstructionParts;
              if (Object.keys(generationConfig).length > 0) payload.generationConfig = generationConfig;

              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${clientApiKey.trim()}`;
              const directRes = await originalFetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });

              if (!directRes.ok) {
                const errText = await directRes.text();
                return new Response(JSON.stringify({ error: `Direct Gemini error: ${errText}` }), {
                  status: directRes.status,
                  headers: { "Content-Type": "application/json" }
                });
              }

              const geminiData = await directRes.json();
              const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

              return new Response(JSON.stringify({ text: textResult }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            }

            if (isGeminiImageProxy) {
              const selectedModel = reqBody.model || "gemini-3.1-flash-image";
              const promptStr = reqBody.prompt || "";
              const numberOfImages = reqBody.config?.numberOfImages || 1;
              const outputMimeType = reqBody.config?.outputMimeType || "image/jpeg";
              const aspectRatio = reqBody.config?.aspectRatio || "1:1";

              const payload = {
                prompt: promptStr,
                numberOfImages,
                outputMimeType,
                aspectRatio
              };

              const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateImages?key=${clientApiKey.trim()}`;
              const directRes = await originalFetch(imagenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });

              if (!directRes.ok) {
                const errText = await directRes.text();
                return new Response(JSON.stringify({ error: `Direct Imagen error: ${errText}` }), {
                  status: directRes.status,
                  headers: { "Content-Type": "application/json" }
                });
              }

              const imagenData = await directRes.json();
              return new Response(JSON.stringify(imagenData), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            }

          } catch (err: any) {
            console.error("[Vercel-OSONE Fallback] Error in client-side direct fallback:", err);
            return new Response(JSON.stringify({ error: `Direct Gemini error: ${err.message}` }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }
        } else {
          if (isGeminiContentProxy || isGeminiGenerateProxy || isGeminiVerifyProxy) {
            return new Response(JSON.stringify({ 
              error: "Por favor, configure sua própria Chave API do Gemini nas configurações do OSONE (ícone de engrenagem) ou na aba de Ajustes. Como você está rodando no Vercel (modo estático), o uso do proxy do servidor local não está disponível e é necessário fornecer uma Chave API válida." 
            }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }
        }

        if (isElevenlabsVerifyProxy) {
          return new Response(JSON.stringify({
            success: true,
            message: "Conexão com ElevenLabs simulada com sucesso."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (isMemorySyncSave) {
          try {
            const syncId = reqBody.syncId || `OSONE-LCL-${Math.floor(1000 + Math.random() * 9000)}`;
            const payloadStr = JSON.stringify(reqBody.payload);
            localStorage.setItem(`osone_sync_fallback_${syncId}`, payloadStr);
            return new Response(JSON.stringify({
              status: "success",
              syncId: syncId,
              message: "Perfil salvo localmente no navegador (Sincronização estática ativa)."
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          } catch (err: any) {
            return new Response(JSON.stringify({ status: "error", error: err.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }
        }

        if (isMemorySyncLoad) {
          try {
            const syncId = urlStr.split("/").pop() || "";
            const savedPayload = localStorage.getItem(`osone_sync_fallback_${syncId}`);
            if (savedPayload) {
              return new Response(JSON.stringify({
                status: "success",
                payload: JSON.parse(savedPayload)
              }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
              });
            } else {
              return new Response(JSON.stringify({
                status: "error",
                error: `Sincronia local '${syncId}' não encontrada neste navegador. No Vercel estático, os backups ficam salvos no seu localStorage atual.`
              }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
              });
            }
          } catch (err: any) {
            return new Response(JSON.stringify({ status: "error", error: err.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }
        }
      }

      if (response) return response;
    }
  }

  return originalFetch(input, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  console.warn("Direct assignment of window.fetch failed, applying alternative fallback", e);
  try {
    (window as any).fetch = customFetch;
  } catch (_) {}
}

import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#333', background: '#fff', fontSize: 16 }}>
          <h1 style={{ color: 'red' }}>Runtime Error</h1>
          <p>O aplicativo encontrou um erro e não pôde carregar.</p>
          <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 5, overflow: 'auto' }}>
            {this.state.error?.message}
          </pre>
          <details style={{ marginTop: 10 }}>
            <summary>Detalhes técnicos</summary>
            <pre style={{ fontSize: 12 }}>{this.state.error?.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
