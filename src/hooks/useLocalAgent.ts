import { useState, useRef } from 'react';
import { PendingLocalAgentConfirmation } from '../components/LocalAgentConfirmModal';

/**
 * Bridge com o Agente Local OSONE (app desktop opcional instalado pelo usuário) via /api/agent.
 * Operações que modificam arquivos (organizar pasta, mover para lixeira) exigem confirmação
 * humana explícita no painel de texto e são totalmente bloqueadas em sessões de voz.
 */
export function useLocalAgent() {
  const [pendingLocalAgentConfirmation, setPendingLocalAgentConfirmation] = useState<PendingLocalAgentConfirmation | null>(null);
  const pendingLocalAgentResolveRef = useRef<((value: any) => void) | null>(null);
  const pendingLocalAgentTimerRef = useRef<any>(null);
  // Resolução da tela, lida uma vez e reaproveitada: ela não muda no meio de uma sessão, e
  // consultá-la a cada clique acrescentaria uma ida ao agente antes de cada ação.
  const telaCacheRef = useRef<{ width: number; height: number; offsetX: number; offsetY: number } | null>(null);

  const executeLocalAgentCall = async (toolName: string, args: any, localAgentToken?: string, isVoiceSession: boolean = false): Promise<any> => {
    // Sem fallback para um token fixo: cada instalação gera seu próprio token forte em
    // config.json na primeira vez que o servidor sobe (ver localAgentService.ts). Usar um
    // valor padrão aqui seria o mesmo token público em toda instalação do OSONE — quem lesse
    // o código-fonte no GitHub teria acesso de terminal a qualquer computador rodando o agente.
    const token = (localAgentToken || '').trim();
    if (!token) {
      return {
        error: "Agente Local não configurado. Copie o token gerado em config.json (na pasta do OSONE) para o campo 'Token do Agente Local' nas Configurações do OSONE."
      };
    }

    const LOCAL_AGENT_URL = '/api/agent';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.trim()}`
    };

    /**
     * Converte a coordenada que o MODELO informa (escala 0–1000) para o pixel real da tela.
     *
     * Por que 0–1000 e não pixels: o Gemini aponta posições em imagens nessa escala normalizada
     * por padrão — é o que ele foi treinado a produzir. Pedir pixels obrigava o modelo a adivinhar
     * a resolução da tela, que ele não tem como saber olhando uma foto sem régua. O resultado era
     * um erro sistemático em TODO clique: ele mandava "500" querendo dizer "meio da tela", e o
     * mouse ia para o pixel 500 — bem à esquerda do meio numa tela de 1440.
     *
     * A conversão acontece aqui, e não no endpoint, porque /mouse/move continua recebendo pixels
     * de verdade — é assim que o controle por gestos de mão (useVisionControl) o utiliza, e ele
     * já sabe a resolução real.
     */
    const dimensoesDaTela = async (): Promise<{ width: number; height: number; offsetX: number; offsetY: number } | null> => {
      if (telaCacheRef.current) return telaCacheRef.current;
      try {
        const res = await fetch(`${LOCAL_AGENT_URL}/screen-info`, { headers });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (!data?.width || !data?.height) return null;
        telaCacheRef.current = {
          width: Number(data.width),
          height: Number(data.height),
          offsetX: Number(data.offsetX) || 0,
          offsetY: Number(data.offsetY) || 0
        };
        return telaCacheRef.current;
      } catch {
        return null;
      }
    };

    /**
     * Traduz um par (x,y) na escala 0–1000 para pixels absolutos de tela.
     *
     * O valor é preso na faixa 0–1000 antes da conversão: nada garante que o número informado
     * caiba nela, e um 1400 solto viraria um clique fora da tela — que não erra o alvo, apenas
     * não acontece, sem nada explicando por quê. Preso na borda, o clique ao menos cai no ponto
     * mais próximo do que foi pedido.
     */
    const paraPixels = async (x: number, y: number): Promise<{ x: number; y: number } | null> => {
      const tela = await dimensoesDaTela();
      if (!tela) return null;
      const dentro = (v: number) => Math.min(1000, Math.max(0, v));
      return {
        x: Math.round(tela.offsetX + (dentro(x) / 1000) * tela.width),
        y: Math.round(tela.offsetY + (dentro(y) / 1000) * tela.height)
      };
    };

    try {
      /**
       * FERRAMENTA ÚNICA DE CONTROLE DO PC.
       *
       * Antes existiam 16 ferramentas separadas e sobrepostas para mexer no computador
       * (criarPasta, escreverArquivo, trash_local_file, delete_path, manage_path,
       * open_any_path, open_local_app, fecharAplicativo, close_window_or_app...). O modelo
       * tinha de escolher entre várias quase idênticas a cada pedido, e escolher errado era
       * fácil — o agente parecia burro por excesso de opção, não por falta de capacidade.
       * Uma ferramenta só, com uma ação nomeada, elimina a ambiguidade.
       */
      if (toolName === 'controlar_pc') {
        const acao = String(args?.acao || '').trim();
        const caminho = args?.caminho;
        const destino = args?.destino;
        const conteudo = args?.conteudo;
        const valor = args?.valor;

        const post = async (path: string, body: any) => {
          const res = await fetch(`${LOCAL_AGENT_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
          const data = await res.json().catch(() => null);
          if (!res.ok) return { error: data?.error || `Falha na ação '${acao}' (HTTP ${res.status}).` };
          return data || { success: true };
        };

        switch (acao) {
          case 'status': {
            const res = await fetch(`${LOCAL_AGENT_URL}/status`, { method: 'GET', headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Agente Local indisponível.' };
            return data;
          }
          case 'listar':
            return post('/path/list', { target: caminho || '' });
          case 'criar_pasta': {
            if (!caminho) return { error: "Informe 'caminho' com a pasta a criar (ex: '~/Documentos/Projeto')." };
            // Se o caminho não tiver nenhuma barra (ex: "Testes", só o nome, sem dizer onde),
            // usar a pasta pessoal do usuário como padrão. Antes, sem separador nenhum, o
            // parentFolder virava o MESMO texto do folderName (ex: parentFolder: "Testes",
            // folderName: "Testes"), tentando criar "Testes" dentro de "Testes" — pasta
            // inexistente, então a criação falhava ou ia parar num lugar errado sem avisar.
            const temSeparador = /[\\/]/.test(caminho);
            let parentFolder: string;
            let folderName: string;
            if (temSeparador) {
              const partes = caminho.split(/[\\/]/).filter(Boolean);
              folderName = partes.pop() || caminho;
              const resto = caminho.replace(/[\\/]+[^\\/]+\/?$/, '');
              parentFolder = resto || (caminho.startsWith('/') ? '/' : '~');
            } else {
              folderName = caminho;
              parentFolder = '~';
            }
            return post('/create-folder', { parentFolder, folderName });
          }
          case 'escrever_arquivo': {
            if (!caminho) return { error: "Informe 'caminho' com o arquivo a escrever (ex: '~/Documentos/nota.txt')." };
            const partes = caminho.split(/[\\/]/).filter(Boolean);
            const nomeArquivo = partes.pop() || 'arquivo.txt';
            const pasta = caminho.startsWith('/') ? '/' + partes.join('/') : partes.join('/') || '~';
            return post('/write-file', { folder: pasta, fileName: nomeArquivo, content: conteudo ?? '' });
          }
          case 'apagar':
            if (!caminho) return { error: "Informe 'caminho' do arquivo ou pasta a apagar." };
            return post('/path/delete', { target: caminho });
          case 'mover':
          case 'copiar':
          case 'renomear':
            if (!caminho || !destino) return { error: "Informe 'caminho' (origem) e 'destino'." };
            return post('/path/manage', { action: acao === 'mover' ? 'move' : acao === 'copiar' ? 'copy' : 'rename', source: caminho, destination: destino });
          case 'abrir':
            if (!caminho) return { error: "Informe 'caminho' com o app, arquivo, pasta ou site a abrir." };
            return post('/open-any', { target: caminho, path: destino });
          case 'fechar':
            if (!caminho) return { error: "Informe 'caminho' com o nome do app ou janela a fechar." };
            return post('/window/close', { target: caminho, force: args?.forcar === true });
          case 'terminal':
            if (!args?.comando) return { error: "Informe 'comando' com o comando de terminal." };
            return post('/exec', { command: args.comando, cwd: caminho, visible: args?.visivel === true });
          case 'volume':
            return post('/volume', { action: args?.subacao || 'set', value: valor });
          case 'midia':
            return post('/media', { action: args?.subacao || 'playpause' });
          case 'configuracoes':
            return post('/system/settings', { panel: args?.subacao || 'main' });
          case 'checar_sistema': {
            const res = await fetch(`${LOCAL_AGENT_URL}/system-check`, { method: 'GET', headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Falha ao checar o sistema.' };
            return data;
          }
          case 'mover_mouse': {
            const x = Number(args?.x);
            const y = Number(args?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Informe 'x' e 'y' (0 a 1000) para mover_mouse." };
            const pixels = await paraPixels(x, y);
            if (!pixels) return { error: "Não foi possível ler as dimensões da tela para posicionar o mouse. No Linux é necessário ter o pacote 'xdotool' instalado." };
            return post('/mouse/move', pixels);
          }
          case 'clicar': {
            const x = args?.x !== undefined ? Number(args.x) : undefined;
            const y = args?.y !== undefined ? Number(args.y) : undefined;
            if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y))) {
              return { error: "Parâmetros 'x' e 'y', quando informados, devem ser numéricos (0 a 1000)." };
            }
            if (x !== undefined && y !== undefined) {
              const pixels = await paraPixels(x, y);
              if (!pixels) return { error: "Não foi possível ler as dimensões da tela para posicionar o clique. No Linux é necessário ter o pacote 'xdotool' instalado." };
              const moveResult = await post('/mouse/move', pixels);
              if (moveResult?.error) return moveResult;
            }
            const botao = args?.botao === 'right' ? 'right' : 'left';
            return post('/mouse/button', { action: 'click', button: botao, double: args?.duplo === true });
          }
          case 'rolar': {
            const direcao = args?.direcao === 'up' || args?.direcao === 'down' ? args.direcao : null;
            if (!direcao) return { error: "Informe 'direcao' como 'up' ou 'down' para rolar." };
            const body: any = { direction: direcao };
            if (args?.quantidade !== undefined) body.amount = Number(args.quantidade);
            if (args?.x !== undefined && args?.y !== undefined) {
              const pixels = await paraPixels(Number(args.x), Number(args.y));
              if (pixels) { body.x = pixels.x; body.y = pixels.y; }
            }
            return post('/mouse/scroll', body);
          }
          case 'digitar': {
            if (!args?.texto) return { error: "Informe 'texto' com o conteúdo a digitar no campo em foco." };
            return post('/keyboard/type', { text: String(args.texto) });
          }
          case 'tecla': {
            if (!args?.tecla) return { error: "Informe 'tecla' (ex: 'enter', 'tab', 'escape', 'a')." };
            const modificadores = Array.isArray(args?.modificadores) ? args.modificadores : [];
            return post('/keyboard/key', { key: String(args.tecla), modifiers: modificadores });
          }
          case 'capturar_tela': {
            const res = await fetch(`${LOCAL_AGENT_URL}/screen/capture`, { method: 'GET', headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Não foi possível capturar a tela.' };
            return data;
          }
          default:
            return { error: `Ação '${acao}' desconhecida. Use: status, listar, criar_pasta, escrever_arquivo, apagar, mover, copiar, renomear, abrir, fechar, terminal, volume, midia, configuracoes, checar_sistema, mover_mouse, clicar, rolar, digitar, tecla, capturar_tela.` };
        }
      }

      if (toolName === 'get_local_agent_status') {
        const res = await fetch(`${LOCAL_AGENT_URL}/status`, { method: 'GET', headers });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro HTTP ${res.status} ao consultar status do Agente Local.`, availableApps: data?.availableApps };
        }
        return data || { status: 'online', message: 'Agente ativo.' };
      }

      if (toolName === 'open_local_app') {
        const { appName } = args || {};
        if (!appName) return { error: "Parâmetro 'appName' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/open-app`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ appName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível abrir o aplicativo '${appName}'.`, availableApps: data?.availableApps };
        }
        return data || { message: `Aplicativo '${appName}' aberto com sucesso.` };
      }

      if (toolName === 'close_local_app' || toolName === 'fecharAplicativo' || toolName === 'close_app') {
        const appId = args?.appId || args?.appName;
        if (!appId) return { error: "Parâmetro 'appId' ou 'appName' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/close-app`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ appId })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível fechar o aplicativo '${appId}'.`, availableApps: data?.availableApps };
        }
        return data || { message: `Comando enviado para fechar '${appId}'.` };
      }

      if (toolName === 'create_local_folder' || toolName === 'criarPasta' || toolName === 'create_folder') {
        const { parentFolder, folderName } = args || {};
        if (!parentFolder || !folderName) return { error: "Parâmetros 'parentFolder' e 'folderName' são obrigatórios." };
        const res = await fetch(`${LOCAL_AGENT_URL}/create-folder`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ parentFolder, folderName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao criar pasta '${folderName}' em '${parentFolder}'.` };
        }
        return data || { message: `Pasta '${folderName}' criada com sucesso em '${parentFolder}'.` };
      }

      if (toolName === 'write_local_file' || toolName === 'escreverArquivo' || toolName === 'write_file') {
        const { folder, fileName, content } = args || {};
        if (!folder || !fileName) return { error: "Parâmetros 'folder' e 'fileName' são obrigatórios." };
        const res = await fetch(`${LOCAL_AGENT_URL}/write-file`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folder, fileName, content: content ?? '' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao escrever arquivo '${fileName}' na pasta '${folder}'.` };
        }
        return data || { message: `Arquivo '${fileName}' gravado com sucesso em '${folder}'.` };
      }

      if (toolName === 'organize_folder_plan') {
        const { folderKey } = args || {};
        if (!folderKey) return { error: "Parâmetro 'folderKey' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/organize/plan`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folderKey })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao gerar plano de organização para a pasta '${folderKey}'.` };
        }
        return data || { message: "Plano gerado com sucesso." };
      }

      if (toolName === 'organize_folder_execute') {
        const { folderKey, planJson, baseDir } = args || {};
        if (!folderKey) return { error: "Parâmetro 'folderKey' é obrigatório." };
        if (!planJson) return { error: "Parâmetro 'planJson' é obrigatório." };
        let planArray: any = null;
        try {
          planArray = typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
        } catch (err) {
          return { error: "JSON do plano é inválido. Certifique-se de passar exatamente o array 'plan' retornado por organize_folder_plan sem modificações." };
        }
        if (!Array.isArray(planArray)) {
          return { error: "O plano fornecido deve ser um array com os itens do plano." };
        }

        // SEGURANÇA: Se for sessão de voz, bloqueia execução direta
        if (isVoiceSession) {
          return {
            error: "Por razões de segurança, operações que modificam ou organizam arquivos não podem ser executadas via comandos de voz. Por favor, acione a ação no chat de texto para visualizar o painel de confirmação."
          };
        }

        // Se já existia uma confirmação pendente, cancela a anterior de forma limpa antes de abrir a nova
        if (pendingLocalAgentResolveRef.current) {
          if (pendingLocalAgentTimerRef.current) clearTimeout(pendingLocalAgentTimerRef.current);
          pendingLocalAgentResolveRef.current({ error: "Solicitação de confirmação anterior foi cancelada pois uma nova ação foi solicitada." });
          pendingLocalAgentResolveRef.current = null;
        }

        // INTERCEPTAÇÃO REAL VIA MODAL NA UI REACT COM TIMEOUT DE SEGURANÇA (3 MINUTOS)
        return new Promise((resolve) => {
          const resolveOnce = (val: any) => {
            if (pendingLocalAgentTimerRef.current) {
              clearTimeout(pendingLocalAgentTimerRef.current);
              pendingLocalAgentTimerRef.current = null;
            }
            setPendingLocalAgentConfirmation(null);
            if (pendingLocalAgentResolveRef.current === resolveOnce) {
              pendingLocalAgentResolveRef.current = null;
            }
            resolve(val);
          };

          pendingLocalAgentResolveRef.current = resolveOnce;

          // Timeout de segurança: 180s
          pendingLocalAgentTimerRef.current = setTimeout(() => {
            resolveOnce({ error: "A confirmação do Agente Local expirou por tempo limite (3 minutos sem resposta do usuário no painel)." });
          }, 180000);

          setPendingLocalAgentConfirmation({
            id: Math.random().toString(36).substring(2, 9),
            type: 'organize_folder_execute',
            folderKey,
            baseDir,
            planArray,
            onConfirm: async () => {
              try {
                const res = await fetch(`${LOCAL_AGENT_URL}/organize/execute`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ folderKey, plan: planArray, confirmed: true })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                  resolveOnce({ error: data?.error || `Erro ao executar plano de organização na pasta '${folderKey}'.` });
                } else {
                  resolveOnce(data || { message: "Organização executada com sucesso após confirmação do usuário no painel." });
                }
              } catch (err) {
                resolveOnce({ error: "Erro de conexão ao executar organização com o Agente Local." });
              }
            },
            onCancel: () => {
              resolveOnce({ error: "Ação de organização cancelada pelo usuário no painel de confirmação da interface." });
            }
          });
        });
      }

      if (toolName === 'trash_local_file') {
        const { folderKey, fileName } = args || {};
        if (!fileName) return { error: "Parâmetro 'fileName' é obrigatório (caminho completo do arquivo, ou nome do arquivo junto de folderKey)." };

        // Execução direta, inclusive por voz. Antes isto abria um modal de confirmação e era
        // recusado em sessões de voz — o que, na prática, tornava impossível apagar qualquer
        // coisa falando. O dono da máquina concedeu acesso total e a exclusão é reversível
        // (o arquivo vai para a lixeira do agente, que devolve o caminho de restauração).
        const res = await fetch(`${LOCAL_AGENT_URL}/file/trash`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folderKey, fileName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível apagar '${fileName}'.` };
        }
        return data || { success: true };
      }

      if (toolName === 'run_terminal_command') {
        const { command, cwd, visible } = args || {};
        if (!command) return { error: "Parâmetro 'command' é obrigatório." };

        // Execução direta: o dono da máquina liberou explicitamente o controle total do
        // terminal, então não há mais gate de confirmação por categoria de comando (o servidor
        // registra tudo no log de auditoria). A única recusa possível vem do servidor, quando o
        // comando alteraria a própria instalação do OSONE.
        const res = await fetch(`${LOCAL_AGENT_URL}/exec`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command, cwd, visible: visible === true })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao executar comando (HTTP ${res.status}).` };
        }
        return data || { success: true, message: 'Comando executado com sucesso.' };
      }

      if (toolName === 'close_window_or_app') {
        const { target, force } = args || {};
        if (!target) return { error: "Parâmetro 'target' é obrigatório (nome do app ou título da janela)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/window/close`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, force: !!force })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível fechar '${target}'.` };
        return data || { success: true };
      }

      if (toolName === 'control_media') {
        const { action } = args || {};
        if (!action) return { error: "Parâmetro 'action' é obrigatório (playpause, play, pause, next, previous, stop)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/media`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível controlar a mídia.` };
        return data || { success: true };
      }

      if (toolName === 'delete_path') {
        const { target } = args || {};
        if (!target) return { error: "Parâmetro 'target' é obrigatório (caminho do arquivo ou pasta)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/path/delete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível apagar '${target}'.` };
        return data || { success: true };
      }

      if (toolName === 'manage_path') {
        const { action, source, destination } = args || {};
        if (!action || !source || !destination) {
          return { error: "Parâmetros 'action' (move/copy/rename), 'source' e 'destination' são obrigatórios." };
        }
        const res = await fetch(`${LOCAL_AGENT_URL}/path/manage`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, source, destination })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível ${action} '${source}'.` };
        return data || { success: true };
      }

      if (toolName === 'list_path') {
        const { target } = args || {};
        const res = await fetch(`${LOCAL_AGENT_URL}/path/list`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target: target || '' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível listar o caminho.` };
        return data || { entries: [] };
      }

      if (toolName === 'open_system_settings') {
        const { panel } = args || {};
        const res = await fetch(`${LOCAL_AGENT_URL}/system/settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ panel: panel || 'main' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível abrir as configurações.` };
        return data || { success: true };
      }

      return { error: `Ferramenta desconhecida: ${toolName}` };
    } catch (err: any) {
      return {
        error: "Agente Local unificado indisponível ou offline no servidor (/api/agent)."
      };
    }
  };

  return {
    pendingLocalAgentConfirmation,
    executeLocalAgentCall
  };
}
