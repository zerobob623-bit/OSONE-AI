import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Minimize, Maximize, RefreshCw, Terminal, Eye, Trash2, AlertTriangle, 
  Copy, Check, Play 
} from 'lucide-react';
import { cn } from '../lib/utils';

/** A linha de número 'n' (base 1) de um texto, sem os espaços das bordas. */
function lerLinhaDoDocumento(documento: string, n?: number): string {
  if (!n || n < 1) return '';
  return ((documento || '').split('\n')[n - 1] || '').trim();
}

/** JSON seguro para ficar dentro de uma tag script sem um `</script>` do código fechá-la cedo. */
function codigoDentroDoScript(codigo: string): string {
  return JSON.stringify(codigo || '').replace(/</g, '\\u003c');
}

export const CodePreview = ({ code, linguagem, aoDetectarProblema }: {
  code: string;
  linguagem?: string;
  /**
   * Avisa quem está de fora que o código executado quebrou.
   *
   * O preview já capturava erro, arquivo, linha e coluna — e guardava tudo para si. A aba de
   * console mostrava, e ali acabava: a IA nunca ficava sabendo, então "Corrigir BUGS" mandava o
   * modelo procurar um defeito que ele não tinha como ver. Este aviso é o que liga uma ponta à
   * outra.
   */
  aoDetectarProblema?: (problema: {
    mensagem: string; linha?: number; coluna?: number; tipo: 'erro' | 'aviso';
    /** O TEXTO da linha que falhou, lido do documento que este componente montou. */
    textoDaLinha?: string;
  }) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'console'>('preview');
  const [logs, setLogs] = useState<Array<{ type: 'log' | 'error' | 'warn'; text: string; time: string }>>([]);
  const [runtimeError, setRuntimeError] = useState<{ message: string; line?: number; col?: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  // Clear states when code changes
  useEffect(() => {
    setRuntimeError(null);
    setLogs([]);
  }, [code, linguagem]);

  /**
   * A função de aviso fica numa referência para o ouvinte poder ser inscrito UMA vez.
   *
   * Ela é recriada a cada renderização do componente de fora; com ela na lista de dependências, o
   * ouvinte de 'message' seria removido e recolocado o tempo todo — e mensagens que chegassem
   * nesse intervalo se perderiam, justamente as de um jogo que está falhando a cada quadro.
   */
  const avisarRef = useRef(aoDetectarProblema);
  avisarRef.current = aoDetectarProblema;

  /** O documento que o iframe está rodando, para poder localizar a linha que o erro apontou. */
  const srcDocRef = useRef<string>('');

  // Handle incoming messages from the preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object') {
        const { type, error, log } = event.data;
        if (type === 'PREVIEW_ERROR') {
          setRuntimeError(error);
          avisarRef.current?.({
            mensagem: String(error?.message || 'erro sem mensagem'),
            linha: error?.line, coluna: error?.col, tipo: 'erro',
            // A linha é lida do documento que ESTE componente montou, e não do código recebido:
            // o preview embrulha o código do usuário numa página maior (instrumentação do
            // console, captura de erros, estilos), e o navegador conta as linhas do resultado
            // final. Traduzir esse número por fora exigiria adivinhar o tamanho do embrulho e
            // erraria a cada mudança nele; aqui o documento está à mão, e o texto sai exato.
            textoDaLinha: lerLinhaDoDocumento(srcDocRef.current, error?.line)
          });
        } else if (type === 'PREVIEW_LOG') {
          setLogs(prev => [...prev, { ...log, time: new Date().toLocaleTimeString() }].slice(-100));
          // console.error dentro do código também é defeito: muita coisa falha sem lançar exceção.
          if (log?.type === 'error' || log?.type === 'warn') {
            avisarRef.current?.({
              mensagem: String(log.text || ''),
              tipo: log.type === 'error' ? 'erro' : 'aviso'
            });
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle keyboard shortcut Escape to exit Full Screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  const handleManualReload = () => {
    setReloadKey(prev => prev + 1);
    setRuntimeError(null);
    setLogs([]);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const srcDocContent = useMemo(() => {
    const headIncludes = `
      <!-- Google Fonts para Design Superior -->
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
      
      <!-- Tailwind CSS V3 Engine -->
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          theme: {
            extend: {
              fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Space Grotesk', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
                outfit: ['Outfit', 'sans-serif'],
                serif: ['Playfair Display', 'serif'],
              }
            }
          }
        }
      </script>

      <!-- Ícones: FontAwesome & Lucide Icons -->
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      <script src="https://unpkg.com/lucide@latest"></script>

      <!-- SweetAlert2 (Para Alertas sem Travar no Sandbox) -->
      <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@sweetalert2/theme-dark@4/dark.css">

      <!-- GSAP & Animate.css (Animações Avançadas) -->
      <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"/>

      <!-- Alpine.js (Interatividade Reativa Leve e Moderna) -->
      <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>

      <!-- Chart.js & Canvas Confetti -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    `;

    if (!code || !code.trim()) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            ${headIncludes}
          </head>
          <body class="bg-zinc-900 text-zinc-400 flex items-center justify-center h-screen font-sans">
            <div class="text-center p-6 bg-zinc-950/40 rounded-xl border border-white/5 max-w-xs">
              <p class="text-xs">Digite ou gere algum HTML/CSS ou JS na aba de escrita para ver o resultado ao vivo.</p>
            </div>
          </body>
        </html>
      `;
    }

    /**
     * PYTHON RODANDO DE VERDADE, pelo Pyodide.
     *
     * Dava para criar um arquivo .py e não dava para executá-lo: o preview só sabia web, e o
     * arquivo ficava ali como texto. Pyodide é o CPython compilado para o navegador, então o
     * código roda de fato — com biblioteca padrão, exceções reais e o traceback do Python.
     *
     * Ele vem de uma CDN e NÃO é embutido no pacote: são dezenas de megabytes, que dobrariam o
     * tamanho do app para quem nunca vai escrever uma linha de Python. A contrapartida está dita
     * na tela em vez de escondida: sem internet, a primeira execução falha, e a mensagem explica
     * exatamente isso em vez de deixar a tela parada em "carregando" para sempre.
     */
    if (linguagem === 'python') {
      const codigoEmJson = codigoDentroDoScript(code);
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body { background:#09090b; color:#f4f4f5; font-family: ui-monospace, Menlo, Consolas, monospace; padding:1.25rem; margin:0; font-size:13px; line-height:1.6; }
              .barra { color:#a1a1aa; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em; border-bottom:1px solid #27272a; padding-bottom:0.5rem; margin-bottom:1rem; display:flex; gap:8px; align-items:center; }
              .ponto { width:7px; height:7px; border-radius:50%; background:#fbbf24; }
              .ponto.pronto { background:#34d399; }
              .ponto.falhou { background:#f87171; }
              pre { margin:0; white-space:pre-wrap; word-break:break-word; }
              .err { color:#f87171; }
              .aviso { color:#fbbf24; }
              .dica { color:#71717a; font-size:12px; margin-top:10px; }
            </style>
          </head>
          <body>
            <div class="barra"><span class="ponto" id="ponto"></span><span id="estado">Carregando o Python...</span></div>
            <pre id="saida"></pre>
            <script>
              const saida = document.getElementById('saida');
              const estado = document.getElementById('estado');
              const ponto = document.getElementById('ponto');

              function escrever(texto, classe) {
                const linha = document.createElement('div');
                if (classe) linha.className = classe;
                linha.textContent = texto;
                saida.appendChild(linha);
                window.parent.postMessage({ type: 'PREVIEW_LOG', log: { type: classe === 'err' ? 'error' : 'log', text: texto } }, '*');
              }

              async function carregarPyodide() {
                // O <script> é criado à mão para dar para PERCEBER a falha de carregamento: um
                // <script src> que não carrega falha em silêncio, e a tela ficaria em "carregando"
                // para sempre — que é exatamente o que acontece sem internet.
                await new Promise((resolve, reject) => {
                  const tag = document.createElement('script');
                  tag.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
                  tag.onload = resolve;
                  tag.onerror = () => reject(new Error('rede'));
                  document.head.appendChild(tag);
                });
                return await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
              }

              (async () => {
                let py;
                try {
                  py = await carregarPyodide();
                } catch (e) {
                  ponto.className = 'ponto falhou';
                  estado.textContent = 'Python indisponível';
                  escrever('Não foi possível carregar o Python.', 'err');
                  escrever('', '');
                  const dica = document.createElement('div');
                  dica.className = 'dica';
                  dica.textContent = 'O interpretador Python é baixado da internet na primeira execução (ele não vem dentro do OSONE porque pesa dezenas de megabytes). Verifique a conexão e recarregue o preview. O resto do OSONE CODE — editor, HTML, CSS e JavaScript — funciona normalmente sem internet.';
                  saida.appendChild(dica);
                  window.parent.postMessage({ type: 'PREVIEW_ERROR', error: { message: 'Python indisponível: não foi possível baixar o interpretador (sem internet?).' } }, '*');
                  return;
                }

                ponto.className = 'ponto pronto';
                estado.textContent = 'Python ' + (py.version || '') + ' — pronto';

                // print() e erros vão para a tela do preview e para o console do OSONE.
                py.setStdout({ batched: (t) => escrever(t) });
                py.setStderr({ batched: (t) => escrever(t, 'err') });

                try {
                  await py.runPythonAsync(${codigoEmJson});
                } catch (e) {
                  // O traceback do Python vai inteiro: cortá-lo tiraria a linha do erro, que é a
                  // única informação que importa para consertar.
                  escrever(String(e.message || e), 'err');
                  window.parent.postMessage({ type: 'PREVIEW_ERROR', error: { message: String(e.message || e).split('\\n').pop() } }, '*');
                }
              })();
            </script>
          </body>
        </html>
      `;
    }

    /** TypeScript é compilado de verdade no navegador e só então executado no sandbox. */
    if (linguagem === 'typescript') {
      const codigoEmJson = codigoDentroDoScript(code);
      return `
        <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
          body{background:#09090b;color:#f4f4f5;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;padding:1.25rem;margin:0}.barra{color:#a1a1aa;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #27272a;padding-bottom:.5rem;margin-bottom:1rem}.err{color:#f87171}.ok{color:#34d399}pre{white-space:pre-wrap;word-break:break-word}
        </style></head><body><div class="barra" id="estado">Compilando TypeScript...</div><pre id="saida"></pre><script>
          const estado=document.getElementById('estado'),saida=document.getElementById('saida');
          const escrever=(texto,tipo='log')=>{const l=document.createElement('div');l.className=tipo==='error'?'err':'';l.textContent=texto;saida.appendChild(l);parent.postMessage({type:'PREVIEW_LOG',log:{type:tipo,text:texto}},'*')};
          const carregar=()=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/typescript@5.8.2/lib/typescript.js';s.onload=resolve;s.onerror=()=>reject(new Error('rede'));document.head.appendChild(s)});
          (async()=>{try{await carregar()}catch(e){estado.textContent='TypeScript indisponível';escrever('Não foi possível baixar o compilador TypeScript. Verifique a internet e rerode.','error');parent.postMessage({type:'PREVIEW_ERROR',error:{message:'TypeScript indisponível: compilador não carregou.'}},'*');return}
            const fonte=${codigoEmJson};
            const resultado=ts.transpileModule(fonte,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None,strict:true}});
            const erros=(resultado.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
            if(erros.length){estado.textContent='TypeScript com erro';for(const d of erros){const msg=ts.flattenDiagnosticMessageText(d.messageText,' ');escrever(msg,'error')}parent.postMessage({type:'PREVIEW_ERROR',error:{message:ts.flattenDiagnosticMessageText(erros[0].messageText,' ')}},'*');return}
            estado.textContent='TypeScript compilado — executando';estado.className='barra ok';
            const logOriginal=console.log,erroOriginal=console.error;console.log=(...a)=>escrever(a.map(String).join(' '));console.error=(...a)=>escrever(a.map(String).join(' '),'error');
            try{new Function(resultado.outputText)()}catch(e){escrever(String(e?.message||e),'error');parent.postMessage({type:'PREVIEW_ERROR',error:{message:String(e?.message||e)}},'*')}finally{console.log=logOriginal;console.error=erroOriginal}
          })();
        </script></body></html>`;
    }

    /** SQL roda sobre um SQLite real compilado para WebAssembly, isolado dentro do iframe. */
    if (linguagem === 'sql') {
      const codigoEmJson = codigoDentroDoScript(code);
      return `
        <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
          body{background:#09090b;color:#f4f4f5;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:1.25rem;margin:0}.barra{color:#a1a1aa;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid #27272a;padding-bottom:.5rem;margin-bottom:1rem}.err{color:#f87171}table{border-collapse:collapse;margin:0 0 18px;width:100%}th,td{border:1px solid #3f3f46;padding:7px 9px;text-align:left}th{background:#18181b;color:#67e8f9}.vazio{color:#71717a}
        </style></head><body><div class="barra" id="estado">Carregando SQLite...</div><div id="saida"></div><script>
          const estado=document.getElementById('estado'),saida=document.getElementById('saida');
          const avisar=(texto,tipo='log')=>parent.postMessage({type:'PREVIEW_LOG',log:{type:tipo,text:texto}},'*');
          const carregar=()=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.js';s.onload=resolve;s.onerror=()=>reject(new Error('rede'));document.head.appendChild(s)});
          (async()=>{try{await carregar();const SQL=await initSqlJs({locateFile:f=>'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/'+f});const db=new SQL.Database();const resultados=db.exec(${codigoEmJson});estado.textContent='SQLite — execução concluída';
            if(!resultados.length){saida.innerHTML='<div class="vazio">Comandos executados. Nenhuma consulta retornou linhas.</div>';avisar('SQL executado sem linhas de resultado.')}else for(const r of resultados){const t=document.createElement('table'),h=document.createElement('tr');for(const c of r.columns){const th=document.createElement('th');th.textContent=c;h.appendChild(th)}t.appendChild(h);for(const linha of r.values){const tr=document.createElement('tr');for(const valor of linha){const td=document.createElement('td');td.textContent=valor===null?'NULL':String(valor);tr.appendChild(td)}t.appendChild(tr)}saida.appendChild(t);avisar(r.values.length+' linha(s): '+r.columns.join(', '))}db.close();
          }catch(e){estado.textContent='SQLite indisponível ou SQL inválido';const d=document.createElement('div');d.className='err';d.textContent=String(e?.message||e);saida.appendChild(d);avisar(d.textContent,'error');parent.postMessage({type:'PREVIEW_ERROR',error:{message:d.textContent}},'*')}})();
        </script></body></html>`;
    }

    const hasHtmlTags = /<html|<head|<body|<!doctype|<div|<p|<script|<style/i.test(code);
    
    // JS pure runner fallback
    if (!hasHtmlTags && code.trim().length > 0) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            ${headIncludes}
            <style>
              body {
                background-color: #09090b;
                color: #f4f4f5;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                padding: 1.5rem;
                margin: 0;
              }
              .title { color: #a1a1aa; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid #27272a; padding-bottom: 0.5rem; margin-bottom: 1rem; }
              .terminal-row { padding: 4px 0; border-bottom: 1px solid #18181b; font-size: 13px; line-height: 1.5; }
              .err { color: #f87171; }
            </style>
            <script>
              window.onerror = function(message, source, lineno, colno, error) {
                window.parent.postMessage({
                  type: 'PREVIEW_ERROR',
                  error: { message: message, line: lineno, col: colno }
                }, '*');
                return false;
              };

              // Polyfill SweetAlert2 no interpretador de JS puro
              window.alert = function(msg) {
                if (window.Swal) {
                  window.Swal.fire({
                    title: 'Notificação',
                    text: msg,
                    icon: 'info',
                    confirmButtonColor: '#10b981',
                    background: '#18181b',
                    color: '#f4f4f5'
                  });
                } else {
                  console.log('[Alert]:', msg);
                }
              };
              window.confirm = function(msg) {
                return true;
              };
            </script>
          </head>
          <body>
            <div class="title">Console Script Output</div>
            <div id="terminal-output"></div>
            <script>
              try {
                const term = document.getElementById('terminal-output');
                const logToIframeScreen = function(type, ...args) {
                  const term = document.getElementById('terminal-output');
                  if (term) {
                    const row = document.createElement('div');
                    row.className = 'terminal-row' + (type === 'error' ? ' err' : '');
                    row.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                    term.appendChild(row);
                  }
                  window.parent.postMessage({
                    type: 'PREVIEW_LOG',
                    log: { type, text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }
                  }, '*');
                };

                console.log = function(...args) { logToIframeScreen('log', ...args); };
                console.error = function(...args) { logToIframeScreen('error', ...args); };
                console.warn = function(...args) { logToIframeScreen('warn', ...args); };

                ${code}
              } catch(err) {
                console.error(err.message);
                window.parent.postMessage({
                  type: 'PREVIEW_ERROR',
                  error: { message: err.message }
                }, '*');
              }
            </script>
          </body>
        </html>
      `;
    }

    // Is regular HTML, let's inject error detection scripts and style/frameworks
    const injectedScript = `
      <script>
        // Catch runtime errors
        window.onerror = function(message, source, lineno, colno, error) {
          window.parent.postMessage({
            type: 'PREVIEW_ERROR',
            error: { message: message, line: lineno, col: colno }
          }, '*');
          return false;
        };

        // Capture logs
        const _log = console.log;
        const _error = console.error;
        const _warn = console.warn;
        
        console.log = function(...args) {
          _log.apply(console, args);
          window.parent.postMessage({
            type: 'PREVIEW_LOG',
            log: { type: 'log', text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }
          }, '*');
        };
        
        console.error = function(...args) {
          _error.apply(console, args);
          window.parent.postMessage({
            type: 'PREVIEW_LOG',
            log: { type: 'error', text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }
          }, '*');
        };

        console.warn = function(...args) {
          _warn.apply(console, args);
          window.parent.postMessage({
            type: 'PREVIEW_LOG',
            log: { type: 'warn', text: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }
          }, '*');
        };

        // Polyfill de alert, confirm e prompt via SweetAlert2 (Impede travamentos e erros no sandbox)
        window.alert = function(msg) {
          if (window.Swal) {
            window.Swal.fire({
              title: 'Notificação',
              text: msg,
              icon: 'info',
              confirmButtonColor: '#10b981',
              background: '#18181b',
              color: '#f4f4f5'
            });
          } else {
            _log('[Alert]:', msg);
          }
        };

        window.confirm = function(msg) {
          _log('[Confirm]:', msg);
          return true;
        };

        // Auto inicialização de ícones Lucide
        window.addEventListener('DOMContentLoaded', () => {
          if (window.lucide) {
            window.lucide.createIcons();
          }
        });
      </script>
    `;

    // Check if user is supplying a fully complete document
    const isFullDoc = /<html/i.test(code);
    if (isFullDoc) {
      // Find head index to inject scripts or construct it
      const headIndex = code.search(/<head>/i);
      if (headIndex !== -1) {
        return code.replace(/<head>/i, `<head>${headIncludes}${injectedScript}`);
      } else {
        // Find <html> and inject <head> right after it
        const htmlMatch = code.match(/<html[^>]*>/i);
        if (htmlMatch) {
          const matchedTag = htmlMatch[0];
          return code.replace(matchedTag, `${matchedTag}\n<head>${headIncludes}${injectedScript}</head>`);
        }
      }
      return headIncludes + injectedScript + code;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${headIncludes}
          <style>
            body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1.5rem; background-color: #ffffff; color: #1f2937; }
          </style>
          ${injectedScript}
        </head>
        <body>
          ${code}
        </body>
      </html>
    `;
  }, [code, linguagem]);

  srcDocRef.current = srcDocContent;

  // Unique key triggers iframe reset
  const iframeKey = useMemo(() => {
    return `preview-frame-${reloadKey}`;
  }, [reloadKey]);

  const previewMarkup = (
    <div 
      ref={containerRef} 
      className={cn(
        "bg-zinc-950 flex flex-col overflow-hidden border border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.5)] relative transition-all duration-300",
        isFullScreen ? "fixed inset-0 z-[999999] rounded-none h-screen w-screen" : "w-full h-full rounded-2xl"
      )}
    >
      {/* CodePreview Custom Top Menu Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-zinc-900/60 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('preview')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold rounded-md flex items-center gap-1.5 transition-all",
              activeTab === 'preview' 
                ? "bg-white/10 text-white shadow-sm" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Eye size={12} />
            <span>Visualização</span>
          </button>
          
          <button
            onClick={() => setActiveTab('console')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase tracking-wider font-semibold rounded-md flex items-center gap-1.5 transition-all relative",
              activeTab === 'console' 
                ? "bg-white/10 text-white shadow-sm" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Terminal size={12} />
            <span>Console</span>
            {logs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            )}
            {runtimeError && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-bounce" />
            )}
          </button>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          {/* Output clear button for console */}
          {activeTab === 'console' && (
            <button
              onClick={() => setLogs([])}
              className="p-2 bg-white/5 border border-white/[0.05] hover:bg-white/10 text-zinc-300 rounded-lg transition-colors flex items-center gap-1"
              title="Limpar Console"
            >
              <Trash2 size={12} />
            </button>
          )}

          {/* Copy Button */}
          <button
            onClick={copyCode}
            className="p-2 bg-white/5 border border-white/[0.05] hover:bg-white/10 text-zinc-300 rounded-lg transition-colors"
            title="Copiar Código"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>

          {/* Refresh/Reload Frame Button */}
          <button
            onClick={handleManualReload}
            className="p-2 bg-white/5 border border-white/[0.05] hover:bg-white/10 text-zinc-300 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-semibold"
            title="Reiniciar Sandbox (Limpar contextos)"
          >
            <RefreshCw size={12} className="text-zinc-400" />
            <span className="hidden sm:inline">Rerodar</span>
          </button>
        </div>
      </div>

      {/* Main Sandbox Interactive Body */}
      <div className="flex-1 bg-white relative min-h-0">
        
        {/* Tab 1: Live Interactive Iframe Preview */}
        <div className={cn("w-full h-full relative", activeTab === 'preview' ? "block" : "hidden")}>
          <iframe 
            key={iframeKey}
            srcDoc={srcDocContent}
            title="OSONE Sandbox Environment"
            className="w-full h-full border-none bg-white"
            sandbox="allow-scripts allow-popups allow-modals allow-downloads allow-pointer-lock"
          />

          {/* Beautiful Floating Runtime Error Banner */}
          {runtimeError && (
            <div className="absolute top-4 left-4 right-4 bg-red-950/95 border border-red-500/20 rounded-xl p-4 shadow-2xl backdrop-blur-md z-50 flex items-start gap-3">
              <div className="p-1 px-1.5 bg-red-400/10 text-red-400 border border-red-400/20 rounded-md shrink-0">
                <AlertTriangle size={15} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-[8px] font-bold tracking-widest text-red-400 block uppercase">Erro de Execução (Console)</span>
                <p className="text-xs text-red-200 mt-1 font-mono break-words">{runtimeError.message}</p>
                {runtimeError.line && (
                  <span className="text-[10px] text-red-400/80 font-mono block mt-1">
                    Linha: {runtimeError.line} {runtimeError.col ? `| Coluna: ${runtimeError.col}` : ''}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setRuntimeError(null)}
                className="p-1 text-red-400 hover:text-white rounded-md hover:bg-white/5 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Tab 2: Terminal Console Log Terminal */}
        <div className={cn("w-full h-full bg-zinc-950 text-zinc-100 p-4 font-mono text-xs overflow-y-auto", activeTab === 'console' ? "block" : "hidden")}>
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3 text-zinc-500 text-[10px] uppercase tracking-wider">
            <span>Terminal do Sandbox Activo</span>
            <span>{logs.length} impressões</span>
          </div>

          <div className="space-y-1.5">
            {logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-4 py-1.5 border-b border-white/[0.02]">
                <span className="text-[9px] text-zinc-600 select-none pt-0.5">{log.time}</span>
                <span className={cn(
                  "font-mono flex-1 leading-relaxed break-all",
                  log.type === 'error' ? "text-red-400" : log.type === 'warn' ? "text-amber-400" : "text-zinc-200"
                )}>
                  {log.text}
                </span>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
                <Terminal size={24} className="mb-2 opacity-30 " />
                <p className="text-xs font-light">Nenhuma impressão registrada no console ainda.</p>
                <p className="text-[10px] opacity-60 mt-1 max-w-xs text-center">Use comandos como console.log() em seus scripts para depurar em tempo real.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        Floating Action control for Full Screen at the bottom right corner.

        Este markup é reaproveitado nos dois estados: em tela cheia ele é portado pro
        document.body (por isso precisa de um z-index altíssimo, acima de literalmente
        tudo no app), mas fora da tela cheia ele fica dentro do painel normal do preview —
        um z-index tão alto ali fazia esse botão renderizar por cima de outra UI do
        workspace (como a barra lateral de arquivos), mesmo quando o painel do preview
        estava visualmente atrás dela.
      */}
      <div className={cn(
        "absolute bottom-4 right-4 flex items-center gap-1.5 pointer-events-auto",
        isFullScreen ? "z-[999999]" : "z-20"
      )}>
        <button
          onClick={toggleFullScreen}
          className={cn(
            "px-3.5 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase shadow-[0_8px_30px_rgb(0,0,0,0.5)] transition-all border shrink-0 flex items-center gap-2 active:scale-95 cursor-pointer backdrop-blur-md",
            isFullScreen 
              ? "bg-amber-600/90 text-white border-amber-500/40 hover:bg-amber-500 hover:scale-105" 
              : "bg-zinc-900/90 text-zinc-300 border-white/10 hover:bg-zinc-800 hover:text-white"
          )}
          title={isFullScreen ? "Sair da Tela Cheia (ESC)" : "Colocar em Tela Cheia"}
        >
          {isFullScreen ? (
            <>
              <Minimize size={13} className="text-amber-400 animate-pulse animate-[spin_4s_linear_infinite]" />
              <span>Minimizar (ESC)</span>
            </>
          ) : (
            <>
              <Maximize size={13} className="text-purple-400" />
              <span>Tela Cheia</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  if (isFullScreen) {
    return (
      <>
        {/* Placeholder in the drafting grid layout so it doesn't collapse */}
        <div className="w-full h-full min-h-[350px] rounded-2xl bg-zinc-950/40 border border-white/5 flex flex-col items-center justify-center text-zinc-500 font-mono text-center gap-3.5 p-6 animate-pulse">
          <Maximize size={24} className="text-zinc-600" />
          <div className="space-y-1 bg-[#0c0d10]/40 p-3 px-4 rounded-xl border border-white/5">
            <p className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">Sandbox em Tela Cheia</p>
            <p className="text-[10px] text-zinc-500 leading-normal max-w-[240px] mt-0.5">Os controles interativos foram ampliados sobre toda a tela para foco e depuração máximas.</p>
          </div>
          <button 
            onClick={toggleFullScreen}
            className="mt-2 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-[9px] uppercase tracking-widest font-bold text-zinc-200 transition-all cursor-pointer active:scale-95"
          >
            Sair de Tela Cheia (ESC)
          </button>
        </div>
        {createPortal(previewMarkup, document.body)}
      </>
    );
  }

  return previewMarkup;
};
