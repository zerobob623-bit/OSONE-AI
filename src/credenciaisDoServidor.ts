import fs from 'fs';
import path from 'path';

/**
 * CREDENCIAIS QUE O USUÁRIO PODE PREENCHER PELA TELA, sem abrir arquivo nenhum.
 *
 * Por que existe: as Configurações mostravam um checklist do que faltava — "❌ TUYA_CLIENT_ID",
 * "❌ TUYA_CLIENT_SECRET" — e mandavam definir tudo isso "nas variáveis de ambiente do servidor".
 * Só que não havia um campo sequer para digitar. No app instalado não existe .env que a pessoa
 * possa abrir, e a instrução era literalmente impossível de cumprir: o app apontava o que estava
 * faltando e não dava caminho nenhum para resolver. O token do Agente Local já era gerado pela
 * própria tela, com o texto "não é necessário abrir nenhum arquivo" — a casa inteligente tinha
 * ficado de fora dessa ideia.
 *
 * Onde os valores ficam: num arquivo do lado do SERVIDOR, nunca no navegador. O segredo da Tuya
 * assina cada requisição; se ele vivesse no cliente, qualquer visitante do app o teria. As rotas
 * que leem e escrevem isto respondem só à própria máquina (ver somenteDaPropriaMaquina), e o valor
 * salvo jamais volta para a tela — a tela recebe apenas "está preenchido" e os últimos caracteres.
 *
 * Precedência: o que é salvo aqui GANHA da variável de ambiente. Parece o contrário do esperado,
 * mas é o que torna a tela útil: quem tem uma variável errada no ambiente precisa conseguir
 * corrigir por onde consegue mexer. Apagar o campo devolve o valor do ambiente, se houver.
 */

export interface CampoDeCredencial {
  nome: string;
  rotulo: string;
  /** Valor que não pode voltar para a tela nem aparecer em log. */
  segredo: boolean;
  dica: string;
}

export const CAMPOS_DE_CREDENCIAL: CampoDeCredencial[] = [
  { nome: 'TUYA_CLIENT_ID', rotulo: 'Tuya — Access ID', segredo: false, dica: "iot.tuya.com > Cloud > seu projeto > aba Overview." },
  { nome: 'TUYA_CLIENT_SECRET', rotulo: 'Tuya — Access Secret', segredo: true, dica: "Na mesma tela do Access ID; clique no olho para revelar antes de copiar." },
  { nome: 'TUYA_BASE_URL', rotulo: 'Tuya — Endereço da região', segredo: false, dica: "No Brasil quase sempre https://openapi.tuyaus.com (data center Western America)." },
  { nome: 'TUYA_USER_UID', rotulo: 'Tuya — UID da sua conta', segredo: false, dica: "iot.tuya.com > seu projeto > Devices > Link Tuya App Account: é o UID da conta do app Smart Life." },
  { nome: 'GOOGLE_HOME_CLIENT_ID', rotulo: 'Google Home — Client ID', segredo: false, dica: "Um identificador inventado por você, colado igual no Actions on Google (Account Linking)." },
  { nome: 'GOOGLE_HOME_CLIENT_SECRET', rotulo: 'Google Home — Client Secret', segredo: true, dica: "Uma senha longa inventada por você, colada igual no Actions on Google." }
];

const NOMES_VALIDOS = new Set(CAMPOS_DE_CREDENCIAL.map(c => c.nome));
const ARQUIVO = () => path.join(process.cwd(), 'credenciais-osone.json');

/**
 * O ambiente como ele era ANTES de qualquer coisa salva pela tela entrar. Guardado para que
 * apagar um campo na tela devolva o valor original em vez de deixar o campo vazio para sempre.
 */
const AMBIENTE_ORIGINAL: Record<string, string> = {};
let ambienteCapturado = false;

function capturarAmbienteOriginal(): void {
  if (ambienteCapturado) return;
  for (const campo of CAMPOS_DE_CREDENCIAL) {
    AMBIENTE_ORIGINAL[campo.nome] = (process.env[campo.nome] || '').trim();
  }
  ambienteCapturado = true;
}

function lerArquivo(): Record<string, string> {
  try {
    if (!fs.existsSync(ARQUIVO())) return {};
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO(), 'utf-8'));
    const limpo: Record<string, string> = {};
    for (const [nome, valor] of Object.entries(bruto || {})) {
      if (NOMES_VALIDOS.has(nome) && typeof valor === 'string') limpo[nome] = valor;
    }
    return limpo;
  } catch (e) {
    console.error('[Credenciais] Não foi possível ler credenciais-osone.json:', e);
    return {};
  }
}

function escreverArquivo(valores: Record<string, string>): void {
  // 0600: o arquivo guarda o segredo que assina as requisições da Tuya. Só o dono lê.
  fs.writeFileSync(ARQUIVO(), JSON.stringify(valores, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(ARQUIVO(), 0o600);
  } catch {
    // Windows não tem esse conceito de permissão; o arquivo fica na pasta de dados do usuário.
  }
}

function aplicarNoAmbiente(salvos: Record<string, string>): void {
  for (const campo of CAMPOS_DE_CREDENCIAL) {
    const doPainel = (salvos[campo.nome] || '').trim();
    const efetivo = doPainel || AMBIENTE_ORIGINAL[campo.nome] || '';
    if (efetivo) process.env[campo.nome] = efetivo;
    else delete process.env[campo.nome];
  }
}

/**
 * Chamado uma vez na subida do servidor, antes de qualquer checagem de configuração.
 * A partir daqui, tudo que lê process.env (tuyaService, googleHomeService) enxerga o que foi
 * preenchido pela tela sem saber que veio de lá.
 */
export function carregarCredenciaisSalvas(): void {
  capturarAmbienteOriginal();
  aplicarNoAmbiente(lerArquivo());
}

export interface EstadoDeCampo {
  nome: string;
  rotulo: string;
  segredo: boolean;
  dica: string;
  preenchido: boolean;
  /** De onde veio o valor em uso: o painel desta máquina ou a variável de ambiente do servidor. */
  origem: 'painel' | 'ambiente' | 'nenhuma';
  /**
   * Só o suficiente para a pessoa reconhecer o que está lá, nunca o valor.
   * Campo não secreto aparece inteiro: um endereço de região ou um UID não são segredo, e ver o
   * valor é justamente o que permite notar que ele está errado.
   */
  amostra: string;
}

export function lerEstadoDasCredenciais(): { campos: EstadoDeCampo[]; arquivo: string } {
  capturarAmbienteOriginal();
  const salvos = lerArquivo();

  const campos = CAMPOS_DE_CREDENCIAL.map(campo => {
    const doPainel = (salvos[campo.nome] || '').trim();
    const doAmbiente = AMBIENTE_ORIGINAL[campo.nome] || '';
    const efetivo = doPainel || doAmbiente;
    const origem: EstadoDeCampo['origem'] = doPainel ? 'painel' : (doAmbiente ? 'ambiente' : 'nenhuma');

    let amostra = '';
    if (efetivo) {
      amostra = campo.segredo
        ? `${'•'.repeat(Math.min(12, Math.max(0, efetivo.length - 4)))}${efetivo.slice(-4)}`
        : efetivo;
    }

    return { nome: campo.nome, rotulo: campo.rotulo, segredo: campo.segredo, dica: campo.dica, preenchido: !!efetivo, origem, amostra };
  });

  return { campos, arquivo: ARQUIVO() };
}

/**
 * Grava o que veio da tela e aplica NA HORA.
 *
 * Aplicar sem reiniciar não é conforto: a instrução antiga terminava em "e reinicie o OSONE", e no
 * app instalado reiniciar significa fechar tudo e abrir de novo só para descobrir se o valor
 * colado estava certo. Valendo na hora, o botão de testar ao lado responde na mesma tela.
 *
 * Campo enviado vazio é apagado do arquivo — e volta a valer o que houver no ambiente.
 */
export function salvarCredenciais(valores: Record<string, unknown>): { salvos: string[]; apagados: string[] } {
  capturarAmbienteOriginal();
  const atuais = lerArquivo();
  const salvos: string[] = [];
  const apagados: string[] = [];

  for (const [nome, bruto] of Object.entries(valores || {})) {
    if (!NOMES_VALIDOS.has(nome)) continue;
    const valor = typeof bruto === 'string' ? bruto.trim() : '';
    if (valor) {
      atuais[nome] = valor;
      salvos.push(nome);
    } else if (nome in atuais) {
      delete atuais[nome];
      apagados.push(nome);
    }
  }

  escreverArquivo(atuais);
  aplicarNoAmbiente(atuais);
  return { salvos, apagados };
}
