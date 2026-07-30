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

    try {
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
        const { folderKey, fileName, baseDir } = args || {};
        if (!folderKey || !fileName) return { error: "Parâmetros 'folderKey' e 'fileName' são obrigatórios." };

        // SEGURANÇA: Se for sessão de voz, bloqueia execução direta
        if (isVoiceSession) {
          return {
            error: "Por razões de segurança, mover arquivos para a lixeira não pode ser executado via comandos de voz. Por favor, acione a ação no chat de texto para visualizar o painel de confirmação."
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
            type: 'trash_local_file',
            folderKey,
            baseDir,
            fileName,
            onConfirm: async () => {
              try {
                const res = await fetch(`${LOCAL_AGENT_URL}/file/trash`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ folderKey, fileName, confirmed: true })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                  resolveOnce({ error: data?.error || `Erro ao mover o arquivo '${fileName}' para a lixeira.` });
                } else {
                  resolveOnce(data || { message: `Arquivo '${fileName}' movido para a lixeira do Agente Local após confirmação do usuário no painel.`, status: 'trashed' });
                }
              } catch (err) {
                resolveOnce({ error: "Erro de conexão ao mover arquivo para a lixeira." });
              }
            },
            onCancel: () => {
              resolveOnce({ error: "Ação de mover para a lixeira cancelada pelo usuário no painel de confirmação da interface." });
            }
          });
        });
      }

      if (toolName === 'open_any_path' || toolName === 'open_local_path') {
        const { target } = args || {};
        if (!target) return { error: "Parâmetro 'target' é obrigatório (nome de app, caminho de arquivo/pasta ou URL)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/open-any`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível abrir '${target}'.` };
        }
        return data || { message: `'${target}' aberto com sucesso.` };
      }

      if (toolName === 'set_system_volume') {
        const { action, value } = args || {};
        if (!action) return { error: "Parâmetro 'action' é obrigatório ('set', 'up', 'down', 'mute' ou 'unmute')." };
        const res = await fetch(`${LOCAL_AGENT_URL}/volume`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, value })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || 'Erro ao ajustar o volume do sistema.' };
        }
        return data || { message: `Volume ajustado (${action}).` };
      }

      if (toolName === 'system_health_check') {
        const res = await fetch(`${LOCAL_AGENT_URL}/system-check`, { method: 'GET', headers });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || 'Erro ao checar o estado do sistema.' };
        }
        return data || {};
      }

      if (toolName === 'run_terminal_command') {
        const { command, cwd } = args || {};
        if (!command) return { error: "Parâmetro 'command' é obrigatório." };

        // Execução direta: o dono da máquina liberou explicitamente o controle total do
        // terminal, então não há mais gate de confirmação por categoria de comando (o servidor
        // registra tudo no log de auditoria). A única recusa possível vem do servidor, quando o
        // comando alteraria a própria instalação do OSONE.
        const res = await fetch(`${LOCAL_AGENT_URL}/exec`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command, cwd })
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
