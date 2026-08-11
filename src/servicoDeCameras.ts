/**
 * CÂMERAS DE SEGURANÇA DENTRO DO OSONE — o caminho do vídeo.
 *
 * O que trava quase todo projeto caseiro de vigilância é a primeira parada: câmera IP fala RTSP,
 * e navegador nenhum toca RTSP. Não é limitação do OSONE, é do formato — não existe <video
 * src="rtsp://...">. Por isso o vídeo não chega direto na tela: ele passa por aqui.
 *
 * O desenho, em uma frase: um ffmpeg por câmera puxa o RTSP e devolve quadros JPEG pequenos, que
 * ficam na memória e são servidos como MJPEG para quantas telas estiverem olhando.
 *
 * As três decisões que sustentam isso, e por que não são as óbvias:
 *
 * 1. UM PROCESSO POR CÂMERA, NÃO POR ESPECTADOR. O jeito ingênuo é abrir um ffmpeg quando alguém
 *    abre a tela. Câmera IP costuma aceitar duas, três conexões simultâneas e mais nada — duas
 *    abas abertas e a terceira já não conecta. Aqui a câmera é lida uma vez só, e as telas
 *    consomem a mesma leitura.
 *
 * 2. MJPEG, E NÃO HLS. HLS é o formato "certo" e é para onde isto vai crescer, mas ele exige uma
 *    biblioteca no navegador (hls.js) e trabalha em fatias de segundos — atraso de 3 a 10s, que é
 *    justamente o que não se quer em vigilância. MJPEG é uma sequência de JPEGs que qualquer <img>
 *    toca sem uma linha de JavaScript, com atraso de menos de um segundo, e funciona igual no
 *    navegador, no app instalado e no Android. Custa banda; para rede local, é o troco certo.
 *
 * 3. O MOVIMENTO NÃO É CALCULADO EM CIMA DO JPEG. Decodificar JPEG a 8 quadros por segundo, por
 *    câmera, gastaria mais CPU que todo o resto junto — e exigiria um decodificador que o projeto
 *    não tem. Em vez disso o MESMO ffmpeg escreve, em paralelo, uma miniatura de 32x18 em cinza
 *    (uns 600 bytes, sem compressão nenhuma), que se lê como bytes crus. A comparação é a mesma
 *    que o COWORK já usa para saber se uma tela parou de mudar — literalmente a mesma função.
 *
 * O QUE ESTA FASE AINDA NÃO FAZ, dito aqui para não ser descoberto em uso: não há detecção de
 * objeto (arma, faca) — o evento nasce de movimento; e o clipe começa no instante da detecção, sem
 * os segundos ANTERIORES ao evento, que exigem um buffer contínuo em disco.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import { Request, Response, Router } from 'express';
import { AssinaturaDaTela, diferencaEntreTelas } from './lib/esperarTela';

/**
 * O ffmpeg é carregado SOB DEMANDA, e não por "import" no topo do arquivo.
 *
 * Um import no topo é resolvido quando o módulo carrega — ou seja, quando o servidor sobe. Se o
 * pacote não estiver lá (o ffmpeg-static baixa um binário de ~80 MB num script de pós-instalação,
 * que pode ser pulado ou falhar em algumas hospedagens), o import derruba o carregamento inteiro
 * do servidor. E como este arquivo é importado pelo server.ts, derrubar o carregamento não
 * quebraria só as câmeras: quebraria TODAS as rotas da API de uma vez, com erro 500 em tudo.
 *
 * Nenhum recurso deve ter poder de derrubar os outros por causa de uma dependência que só ele usa.
 * Carregando aqui dentro, e com o erro contido, a falta do ffmpeg vira "as câmeras não funcionam"
 * em vez de "o OSONE não funciona".
 *
 * O createRequire com esta base cobre os dois formatos em que este código roda: o bundle CommonJS
 * de produção (onde __filename existe) e o modo desenvolvimento com tsx, que é módulo ES e não o
 * tem — usar import.meta direto quebraria o bundle CommonJS, e usar __filename direto quebraria o
 * modo desenvolvimento.
 */
const exigirModulo = createRequire(
  typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'package.json')
);

// ============================================================================
// ONDE AS COISAS MORAM
// ============================================================================

/**
 * A configuração guarda a URL RTSP, e URL de câmera carrega usuário e senha embutidos
 * ("rtsp://admin:1234@192.168.0.10"). É credencial, e é tratada como tal: arquivo 0600, fora do
 * repositório, e NUNCA devolvida inteira para a tela — o cliente recebe uma versão mascarada.
 */
const ARQUIVO_DE_CAMERAS = path.join(process.cwd(), 'cameras-osone.json');
const PASTA_DAS_GRAVACOES = path.join(process.cwd(), 'gravacoes');
const ARQUIVO_DE_EVENTOS = path.join(PASTA_DAS_GRAVACOES, 'eventos.jsonl');
/** Miniaturas de movimento: descartáveis, e por isso separadas das gravações. */
const PASTA_DE_TRABALHO = path.join(PASTA_DAS_GRAVACOES, '.trabalho');

export interface CameraConfigurada {
  id: string;
  nome: string;
  /** rtsp://... (ou http:// para câmera que serve MJPEG direto). Contém credencial. */
  url: string;
  local?: string;
  /** Se deve estar transmitindo. Câmera desligada não abre processo nem consome rede. */
  ligada: boolean;
  /**
   * Quanto a imagem precisa mudar para contar como movimento, de 0 a 1.
   *
   * Não é um número arbitrário: é a mesma escala de diferença entre telas que o COWORK usa. Numa
   * câmera parada, ruído de sensor e variação de luz ficam abaixo de 0,01; uma pessoa entrando no
   * quadro passa bem de 0,02. O padrão fica no meio, e cada câmera ajusta o seu — uma apontada
   * para uma árvore ao vento precisa de um número maior, e isso não se adivinha daqui.
   */
  sensibilidade: number;
  criadaEm: number;
}

export interface EventoDaCamera {
  id: string;
  cameraId: string;
  cameraNome: string;
  local?: string;
  quando: number;
  tipo: 'movimento';
  /** Quanto a imagem mudou, na mesma escala da sensibilidade. */
  intensidade: number;
  /** Nome do arquivo do clipe dentro da pasta de gravações, quando houve. */
  clipe?: string;
  /** Nome do arquivo do quadro do momento. É o que vai no aviso. */
  quadro?: string;
  /** Preenchido quando a gravação falhou — some no relatório seria pior que aparecer. */
  erroDaGravacao?: string;
}

// ============================================================================
// FERRAMENTAS
// ============================================================================

/**
 * O ffmpeg que já viaja dentro do OSONE.
 *
 * Mesma lógica que a mensagem de voz do ZAP usa: o binário empacotado vem apontando para dentro do
 * app.asar, e binário não executa de dentro de um asar — o electron-builder extrai essa pasta para
 * "app.asar.unpacked". Sem esta troca, câmera funcionaria em desenvolvimento e falharia no
 * instalador, que é o pior lugar para descobrir.
 */
let caminhoDoFfmpeg: string | undefined;

function resolverFfmpeg(): string {
  if (caminhoDoFfmpeg !== undefined) return caminhoDoFfmpeg;
  caminhoDoFfmpeg = 'ffmpeg';
  try {
    const bruto = (exigirModulo('ffmpeg-static') as string) || '';
    const desempacotado = bruto.replace('app.asar', 'app.asar.unpacked');
    if (desempacotado && fs.existsSync(desempacotado)) caminhoDoFfmpeg = desempacotado;
  } catch { /* sem o pacote, tenta o ffmpeg do sistema */ }
  return caminhoDoFfmpeg;
}

/**
 * PROTOCOLOS QUE UMA CÂMERA PODE FALAR — e só eles.
 *
 * Isto não é formalidade. O que vai para o "-i" do ffmpeg é um texto que a pessoa digita, e o
 * ffmpeg entende muito mais que vídeo: "file:/etc/passwd" e "concat:" são entradas válidas para
 * ele. Como os argumentos vão num array (nunca por shell), não há injeção de comando — mas sem
 * esta lista um endereço colado de qualquer lugar viraria leitura de arquivo do servidor.
 */
const PROTOCOLOS_DE_CAMERA = new Set(['rtsp:', 'rtsps:', 'http:', 'https:']);

export function validarUrlDeCamera(url: string): string | null {
  const texto = String(url || '').trim();
  if (!texto) return 'Informe o endereço da câmera.';
  let alvo: URL;
  try {
    alvo = new URL(texto);
  } catch {
    return 'Endereço inválido. Use algo como rtsp://usuario:senha@192.168.0.10:554/stream1';
  }
  if (!PROTOCOLOS_DE_CAMERA.has(alvo.protocol)) {
    return `O OSONE só conecta em câmera por rtsp://, rtsps://, http:// ou https:// — "${alvo.protocol}" não é endereço de câmera.`;
  }
  if (!alvo.hostname) return 'O endereço não tem host. Falta o IP ou o nome da câmera na rede.';
  return null;
}

/** A URL como ela pode aparecer na tela: sem a senha, mantendo o resto reconhecível. */
export function mascararUrl(url: string): string {
  try {
    const alvo = new URL(url);
    if (alvo.password) alvo.password = '•••';
    return alvo.toString();
  } catch {
    return '(endereço inválido)';
  }
}

/**
 * As opções que abrem a entrada — e elas MUDAM conforme o protocolo.
 *
 * Custou um teste de ponta a ponta para aparecer: "-rtsp_transport tcp" não existe para uma
 * entrada HTTP, e o ffmpeg não a ignora — ele recusa o arquivo inteiro com "Option not found" e
 * nem chega a tentar conectar. Como câmera barata servindo MJPEG por HTTP é caso comum (e o
 * endereço http:// é aceito de propósito), passar a opção sempre transformava metade das câmeras
 * suportadas em "erro" sem explicação relacionada ao que estava errado.
 *
 * A lista de protocolos vai junto porque é a mesma trava dos dois lados: o endereço é validado ao
 * ser salvo, e aqui o ffmpeg fica proibido de aceitar qualquer outro — inclusive se um arquivo de
 * configuração for editado à mão depois.
 */
function argumentosDeEntrada(url: string): string[] {
  const comuns = ['-protocol_whitelist', 'rtsp,rtsps,tcp,udp,rtp,http,https,tls,crypto,data'];
  const ehRtsp = /^rtsps?:\/\//i.test(url.trim());
  // TCP em vez de UDP para RTSP: em Wi-Fi, UDP perde pacote e a imagem chega quebrada em blocos.
  return ehRtsp ? [...comuns, '-rtsp_transport', 'tcp'] : comuns;
}

function garantirPastas(): void {
  for (const pasta of [PASTA_DAS_GRAVACOES, PASTA_DE_TRABALHO]) {
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
  }
}

function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

// ============================================================================
// A CONFIGURAÇÃO EM DISCO
// ============================================================================

function lerCameras(): CameraConfigurada[] {
  try {
    if (!fs.existsSync(ARQUIVO_DE_CAMERAS)) return [];
    const bruto = JSON.parse(fs.readFileSync(ARQUIVO_DE_CAMERAS, 'utf8'));
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function salvarCameras(lista: CameraConfigurada[]): void {
  fs.writeFileSync(ARQUIVO_DE_CAMERAS, JSON.stringify(lista, null, 2), { mode: 0o600 });
  // writeFileSync só aplica o modo quando CRIA o arquivo. Numa regravação o modo antigo fica —
  // e se o arquivo nasceu antes desta regra, ficaria legível por qualquer usuário da máquina.
  try { fs.chmodSync(ARQUIVO_DE_CAMERAS, 0o600); } catch { /* sistema sem permissão POSIX */ }
}

/** A câmera como a tela pode vê-la: sem a senha, com o estado ao vivo junto. */
function comoAparecePraTela(camera: CameraConfigurada) {
  const viva = transmissoes.get(camera.id);
  return {
    id: camera.id,
    nome: camera.nome,
    local: camera.local,
    ligada: camera.ligada,
    sensibilidade: camera.sensibilidade,
    criadaEm: camera.criadaEm,
    endereco: mascararUrl(camera.url),
    estado: viva?.estado ?? 'parada',
    erro: viva?.erro,
    ultimoQuadroEm: viva?.ultimoQuadroEm ?? null,
    espectadores: viva?.ouvintes.size ?? 0,
    gravando: !!viva?.gravando
  };
}

// ============================================================================
// A TRANSMISSÃO VIVA
// ============================================================================

interface TransmissaoViva {
  cameraId: string;
  processo: ChildProcess | null;
  /** O último JPEG COMPLETO. Quem chega para assistir recebe este na hora, sem esperar o próximo. */
  ultimoQuadro: Buffer | null;
  ultimoQuadroEm: number;
  /** Bytes ainda não fechados num quadro inteiro. */
  acumulado: Buffer;
  ouvintes: Set<Response>;
  estado: 'conectando' | 'ao-vivo' | 'erro';
  erro?: string;
  assinaturaAnterior: AssinaturaDaTela | null;
  /** Quadros seguidos acima do limiar. Um só é ruído; dois é alguém. */
  sequenciaDeMovimento: number;
  ultimoEventoEm: number;
  gravando: boolean;
  vigia: NodeJS.Timeout | null;
  relogioDoMovimento: NodeJS.Timeout | null;
  tentativas: number;
  remarcacao: NodeJS.Timeout | null;
  encerrada: boolean;
}

const transmissoes = new Map<string, TransmissaoViva>();

const INICIO_DE_JPEG = Buffer.from([0xff, 0xd8]);
const FIM_DE_JPEG = Buffer.from([0xff, 0xd9]);

/** Quadros por segundo da imagem que vai para a tela. */
const QUADROS_POR_SEGUNDO = 8;
/** Largura da imagem que vai para a tela. Vigilância não precisa de 1080p para ser útil. */
const LARGURA_DO_PREVIEW = 640;
/** De quanto em quanto tempo a miniatura de movimento é lida. */
const INTERVALO_DO_MOVIMENTO_MS = 500;
/** Sem quadro nenhum por este tempo, a conexão morreu mesmo que o processo continue vivo. */
const SILENCIO_ATE_RECONECTAR_MS = 15_000;
/** Depois de um evento, este tempo de descanso antes do próximo na mesma câmera. */
const DESCANSO_ENTRE_EVENTOS_MS = 60_000;
/** Duração do clipe gravado quando algo acontece. */
const SEGUNDOS_DE_CLIPE = 30;
/** Dois quadros seguidos acima do limiar. Menos que isso é lâmpada piscando. */
const QUADROS_PARA_CONFIRMAR_MOVIMENTO = 2;

function caminhoDaMiniatura(cameraId: string): string {
  return path.join(PASTA_DE_TRABALHO, `movimento-${cameraId}.pgm`);
}

/**
 * Lê a miniatura em cinza que o ffmpeg acabou de escrever.
 *
 * PGM binário (P5) é o formato mais simples que existe: um cabeçalho de texto e os bytes da
 * imagem, um por pixel, sem compressão. É por isso que ele foi escolhido — dá para ler aqui com
 * uma linha de parse, sem decodificador de imagem nenhum no projeto.
 *
 * O arquivo é reescrito pelo ffmpeg o tempo todo, então uma leitura pode pegá-lo pela metade. Não
 * há trava a colocar: o remédio é conferir se o que veio tem o tamanho que o cabeçalho promete e,
 * se não tiver, ignorar esta leitura. Perder um quadro de movimento a cada tanto não custa nada;
 * comparar um quadro rasgado inventaria movimento que não houve.
 */
export function lerPgm(bruto: Buffer): AssinaturaDaTela | null {
  try {
    if (bruto.length < 10 || bruto[0] !== 0x50 || bruto[1] !== 0x35) return null; // "P5"

    // Cabeçalho: P5 <largura> <altura> <máximo>, separados por espaço em branco.
    let posicao = 2;
    const numeros: number[] = [];
    while (numeros.length < 3 && posicao < bruto.length) {
      while (posicao < bruto.length && /\s/.test(String.fromCharCode(bruto[posicao]))) posicao++;
      if (bruto[posicao] === 0x23) { // comentário até o fim da linha
        while (posicao < bruto.length && bruto[posicao] !== 0x0a) posicao++;
        continue;
      }
      let numero = '';
      while (posicao < bruto.length && /[0-9]/.test(String.fromCharCode(bruto[posicao]))) {
        numero += String.fromCharCode(bruto[posicao++]);
      }
      if (!numero) return null;
      numeros.push(Number(numero));
    }
    posicao++; // o único byte branco que separa cabeçalho de dados

    const [largura, altura] = numeros;
    const esperado = largura * altura;
    if (!esperado || bruto.length - posicao < esperado) return null;
    return new Uint8Array(bruto.subarray(posicao, posicao + esperado));
  } catch {
    return null;
  }
}

function lerMiniatura(cameraId: string): AssinaturaDaTela | null {
  try {
    return lerPgm(fs.readFileSync(caminhoDaMiniatura(cameraId)));
  } catch {
    return null;
  }
}

/** Entrega um quadro a quem está assistindo, no formato que o <img> entende. */
function enviarQuadroAosOuvintes(viva: TransmissaoViva, quadro: Buffer): void {
  for (const ouvinte of viva.ouvintes) {
    try {
      ouvinte.write(`--quadro\r\nContent-Type: image/jpeg\r\nContent-Length: ${quadro.length}\r\n\r\n`);
      ouvinte.write(quadro);
      ouvinte.write('\r\n');
    } catch {
      viva.ouvintes.delete(ouvinte);
    }
  }
}

/**
 * Separa os JPEGs que chegam grudados na saída do ffmpeg.
 *
 * MJPEG é literalmente um arquivo colado no outro, sem separador nem tamanho declarado — o que
 * marca o fim é o próprio JPEG (FF D9). Por isso é preciso acumular e cortar: um pedaço que chega
 * pelo cano quase nunca coincide com a fronteira de um quadro, e mandar meio JPEG para a tela
 * mostraria a imagem rasgada na metade.
 */
export function extrairQuadros(acumulado: Buffer, pedaco: Buffer): { quadros: Buffer[]; resto: Buffer } {
  let resto = acumulado.length ? Buffer.concat([acumulado, pedaco]) : pedaco;
  const quadros: Buffer[] = [];

  for (;;) {
    const inicio = resto.indexOf(INICIO_DE_JPEG);
    if (inicio === -1) {
      // Lixo antes do primeiro quadro (ffmpeg às vezes escreve algo antes de engatar). Guardar
      // isso para sempre faria a memória crescer sem nunca fechar um quadro.
      return { quadros, resto: resto.length > 2_000_000 ? Buffer.alloc(0) : resto };
    }
    const fim = resto.indexOf(FIM_DE_JPEG, inicio + 2);
    if (fim === -1) return { quadros, resto: inicio > 0 ? resto.subarray(inicio) : resto };

    quadros.push(Buffer.from(resto.subarray(inicio, fim + 2)));
    resto = resto.subarray(fim + 2);
  }
}

function digerirBytes(viva: TransmissaoViva, pedaco: Buffer): void {
  const { quadros, resto } = extrairQuadros(viva.acumulado, pedaco);
  viva.acumulado = resto;

  for (const quadro of quadros) {
    viva.ultimoQuadro = quadro;
    viva.ultimoQuadroEm = Date.now();
    if (viva.estado !== 'ao-vivo') {
      viva.estado = 'ao-vivo';
      viva.erro = undefined;
      // Conectou: a escada de espera volta ao começo, senão uma câmera que caiu de manhã
      // reconectaria com meio minuto de atraso à noite.
      viva.tentativas = 0;
    }
    enviarQuadroAosOuvintes(viva, quadro);
  }
}

/** Guarda o quadro do momento em disco — é ele que vai no aviso e na lista de eventos. */
function guardarQuadroDoEvento(viva: TransmissaoViva, eventoId: string): string | undefined {
  if (!viva.ultimoQuadro) return undefined;
  const nome = `${eventoId}.jpg`;
  try {
    fs.writeFileSync(path.join(PASTA_DAS_GRAVACOES, nome), viva.ultimoQuadro);
    return nome;
  } catch {
    return undefined;
  }
}

/**
 * Grava o clipe do evento, copiando o fluxo sem recodificar.
 *
 * "-c copy" é o que mantém isto barato: os quadros da câmera vão para o arquivo como vieram, sem
 * passar por compressão de novo. Custa quase nada de CPU e não perde qualidade — a alternativa
 * (recodificar) faria uma máquina comum não dar conta de duas câmeras.
 *
 * Abre uma SEGUNDA conexão com a câmera, e isso é uma escolha consciente: gravar a partir do fluxo
 * já aberto exigiria manter um buffer contínuo em disco. Câmera que só aceita uma conexão vai
 * falhar aqui — e por isso o erro é guardado no evento em vez de sumir no log.
 */
function gravarClipe(camera: CameraConfigurada, eventoId: string): Promise<{ arquivo?: string; erro?: string }> {
  return new Promise((resolver) => {
    const nome = `${eventoId}.mp4`;
    const destino = path.join(PASTA_DAS_GRAVACOES, nome);
    const processo = spawn(resolverFfmpeg(), [
      '-nostdin', '-loglevel', 'error',
      ...argumentosDeEntrada(camera.url),
      '-i', camera.url,
      '-t', String(SEGUNDOS_DE_CLIPE),
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', destino
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let erro = '';
    processo.stderr?.on('data', (d) => { erro += String(d); });
    processo.on('error', (err) => resolver({ erro: `Não consegui iniciar o ffmpeg: ${err.message}` }));

    /**
     * O QUE VALE É O ARQUIVO, NÃO O CÓDIGO DE SAÍDA.
     *
     * A primeira versão exigia código 0 e marcava tudo o mais como falha. O teste de ponta a ponta
     * mostrou o problema: câmera que entrega MJPEG (comum nas baratas) não tem marcação de tempo
     * de verdade, então o "-t 30" não a faz parar sozinha — quem encerrava era o corte de
     * segurança abaixo, com sinal, e o processo saía com código nulo. O clipe estava lá, gravado e
     * tocável, e o evento dizia "sem clipe".
     *
     * Um vídeo cortado no fim é melhor que vídeo nenhum, e num sistema de vigilância dizer que não
     * gravou o que se gravou é a pior das duas mentiras possíveis.
     */
    processo.on('close', () => {
      let tamanho = 0;
      try { tamanho = fs.statSync(destino).size; } catch { /* nem chegou a existir */ }
      // Um mp4 só com cabeçalho tem algumas centenas de bytes e não toca nada.
      if (tamanho > 10_000) return resolver({ arquivo: nome });
      try { fs.rmSync(destino, { force: true }); } catch { /* nada a limpar */ }
      resolver({ erro: erro.trim().split('\n').filter(Boolean).pop() || 'A gravação não produziu vídeo.' });
    });

    // Um "-t 30" que não termina sozinho é câmera sem marcação de tempo (ou travada no meio). Sem
    // este corte o processo ficaria pendurado consumindo uma conexão da câmera para sempre.
    setTimeout(() => { if (!processo.killed) processo.kill('SIGKILL'); }, (SEGUNDOS_DE_CLIPE + 20) * 1000);
  });
}

function registrarEvento(evento: EventoDaCamera): void {
  eventosRecentes.unshift(evento);
  if (eventosRecentes.length > 500) eventosRecentes.length = 500;
  try {
    fs.appendFileSync(ARQUIVO_DE_EVENTOS, `${JSON.stringify(evento)}\n`);
  } catch { /* o registro em memória continua valendo */ }
}

/** Atualiza um evento já registrado (a gravação termina depois do evento nascer). */
function atualizarEvento(eventoId: string, mudanca: Partial<EventoDaCamera>): void {
  const alvo = eventosRecentes.find(e => e.id === eventoId);
  if (alvo) Object.assign(alvo, mudanca);
  try {
    fs.appendFileSync(ARQUIVO_DE_EVENTOS, `${JSON.stringify({ ...(alvo || { id: eventoId }), ...mudanca })}\n`);
  } catch { /* idem */ }
}

let eventosRecentes: EventoDaCamera[] = [];

/**
 * Lê o registro de eventos do disco na partida.
 *
 * O arquivo é JSON por linha, e uma linha por ATUALIZAÇÃO — o evento nasce quando o movimento é
 * detectado e ganha o clipe meio minuto depois, quando a gravação fecha. Ler de cima para baixo
 * sobrepondo pelo id reconstrói o estado final de cada um, e um evento a mais no arquivo nunca
 * vira um evento duplicado na tela.
 */
function carregarEventos(): void {
  try {
    if (!fs.existsSync(ARQUIVO_DE_EVENTOS)) return;
    const porId = new Map<string, EventoDaCamera>();
    for (const linha of fs.readFileSync(ARQUIVO_DE_EVENTOS, 'utf8').split('\n')) {
      if (!linha.trim()) continue;
      try {
        const item = JSON.parse(linha);
        if (!item?.id) continue;
        porId.set(item.id, { ...(porId.get(item.id) || {}), ...item });
      } catch { /* linha corrompida não derruba o histórico inteiro */ }
    }
    eventosRecentes = [...porId.values()].sort((a, b) => b.quando - a.quando).slice(0, 500);
  } catch { /* começa vazio */ }
}

/** Olha a miniatura, decide se houve movimento e, havendo, abre o evento. */
function conferirMovimento(camera: CameraConfigurada, viva: TransmissaoViva): void {
  const agora = lerMiniatura(camera.id);
  if (!agora) return;

  const anterior = viva.assinaturaAnterior;
  viva.assinaturaAnterior = agora;
  if (!anterior) return;

  const mudanca = diferencaEntreTelas(anterior, agora);
  if (mudanca < camera.sensibilidade) {
    viva.sequenciaDeMovimento = 0;
    return;
  }

  viva.sequenciaDeMovimento++;
  if (viva.sequenciaDeMovimento < QUADROS_PARA_CONFIRMAR_MOVIMENTO) return;
  viva.sequenciaDeMovimento = 0;

  if (viva.gravando) return;
  if (Date.now() - viva.ultimoEventoEm < DESCANSO_ENTRE_EVENTOS_MS) return;
  viva.ultimoEventoEm = Date.now();

  const evento: EventoDaCamera = {
    id: novoId('ev'),
    cameraId: camera.id,
    cameraNome: camera.nome,
    local: camera.local,
    quando: Date.now(),
    tipo: 'movimento',
    intensidade: Number(mudanca.toFixed(4))
  };
  evento.quadro = guardarQuadroDoEvento(viva, evento.id);
  registrarEvento(evento);

  viva.gravando = true;
  gravarClipe(camera, evento.id)
    .then(({ arquivo, erro }) => atualizarEvento(evento.id, { clipe: arquivo, erroDaGravacao: erro }))
    .finally(() => { viva.gravando = false; });
}

/**
 * Abre a câmera e mantém aberta.
 *
 * O ffmpeg tem DUAS saídas do mesmo fluxo, e é isso que faz a câmera ser lida uma vez só: os JPEGs
 * grandes vão pelo cano (para a tela) e a miniatura em cinza vai para um arquivo minúsculo,
 * reescrito a cada meio segundo (para o movimento). Duas leituras separadas gastariam duas
 * conexões da câmera — e é justamente disso que a maioria delas não tem sobra.
 */
function abrirTransmissao(camera: CameraConfigurada): TransmissaoViva {
  garantirPastas();
  const existente = transmissoes.get(camera.id);
  const viva: TransmissaoViva = existente ?? {
    cameraId: camera.id, processo: null, ultimoQuadro: null, ultimoQuadroEm: 0,
    acumulado: Buffer.alloc(0), ouvintes: new Set(), estado: 'conectando',
    assinaturaAnterior: null, sequenciaDeMovimento: 0, ultimoEventoEm: 0, gravando: false,
    vigia: null, relogioDoMovimento: null, tentativas: 0, remarcacao: null, encerrada: false
  };
  transmissoes.set(camera.id, viva);

  viva.encerrada = false;
  viva.estado = 'conectando';
  viva.acumulado = Buffer.alloc(0);
  viva.assinaturaAnterior = null;

  const processo = spawn(resolverFfmpeg(), [
    '-nostdin', '-loglevel', 'error',
    // Sem a lista de protocolos, o "-i" abaixo aceitaria file:/... e leria arquivo do servidor. O
    // endereço também é validado antes de ser salvo; as duas travas existem porque uma delas basta
    // falhar.
    ...argumentosDeEntrada(camera.url),
    '-i', camera.url,
    '-an',
    // Saída 1: o que a pessoa vê.
    '-f', 'mjpeg', '-q:v', '7',
    '-vf', `fps=${QUADROS_POR_SEGUNDO},scale=${LARGURA_DO_PREVIEW}:-2`, 'pipe:1',
    // Saída 2: o que o detector de movimento lê. 32x18 em cinza é o mesmo formato de assinatura
    // que o COWORK usa para comparar telas — daí poder reusar a mesma função de diferença.
    '-f', 'image2', '-update', '1', '-pix_fmt', 'gray',
    '-vf', `fps=2,scale=32:18`, '-y', caminhoDaMiniatura(camera.id)
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  viva.processo = processo;
  processo.stdout?.on('data', (pedaco: Buffer) => digerirBytes(viva, pedaco));

  let ultimoErro = '';
  processo.stderr?.on('data', (d) => {
    ultimoErro = String(d).trim().split('\n').filter(Boolean).pop() || ultimoErro;
  });

  processo.on('error', (err) => {
    viva.estado = 'erro';
    viva.erro = `Não consegui executar o ffmpeg: ${err.message}`;
    remarcarConexao(camera.id);
  });

  processo.on('close', () => {
    if (viva.encerrada) return;
    viva.estado = 'erro';
    viva.erro = ultimoErro || 'A câmera encerrou a conexão.';
    remarcarConexao(camera.id);
  });

  // O VIGIA. Um ffmpeg pendurado numa câmera que parou de mandar dados não morre sozinho: o
  // processo continua vivo, o estado continua "ao-vivo", e a tela mostra o último quadro
  // congelado como se estivesse acontecendo. Silêncio longo é queda, mesmo com processo de pé.
  if (viva.vigia) clearInterval(viva.vigia);
  viva.vigia = setInterval(() => {
    if (viva.encerrada || !viva.ultimoQuadroEm) return;
    if (Date.now() - viva.ultimoQuadroEm > SILENCIO_ATE_RECONECTAR_MS) {
      viva.erro = 'A câmera parou de enviar imagem.';
      try { processo.kill('SIGKILL'); } catch { /* já morreu */ }
    }
  }, 5_000);

  if (viva.relogioDoMovimento) clearInterval(viva.relogioDoMovimento);
  viva.relogioDoMovimento = setInterval(() => {
    if (viva.encerrada) return;
    const atual = lerCameras().find(c => c.id === camera.id);
    if (atual?.ligada) conferirMovimento(atual, viva);
  }, INTERVALO_DO_MOVIMENTO_MS);

  return viva;
}

/**
 * Tenta de novo, esperando cada vez mais.
 *
 * Câmera cai por motivo passageiro (Wi-Fi oscilou, energia piscou) e por motivo permanente (senha
 * trocada, câmera removida). Insistir de segundo em segundo resolve o primeiro caso e, no segundo,
 * vira um processo novo por segundo para sempre. A escada até 30s atende os dois.
 */
function remarcarConexao(cameraId: string): void {
  const viva = transmissoes.get(cameraId);
  if (!viva || viva.encerrada) return;
  if (viva.remarcacao) clearTimeout(viva.remarcacao);

  viva.tentativas = Math.min(viva.tentativas + 1, 5);
  const espera = Math.min(2_000 * 2 ** (viva.tentativas - 1), 30_000);
  viva.remarcacao = setTimeout(() => {
    const camera = lerCameras().find(c => c.id === cameraId);
    if (camera?.ligada) abrirTransmissao(camera);
  }, espera);
}

function fecharTransmissao(cameraId: string): void {
  const viva = transmissoes.get(cameraId);
  if (!viva) return;
  viva.encerrada = true;
  if (viva.vigia) clearInterval(viva.vigia);
  if (viva.relogioDoMovimento) clearInterval(viva.relogioDoMovimento);
  if (viva.remarcacao) clearTimeout(viva.remarcacao);
  try { viva.processo?.kill('SIGKILL'); } catch { /* já morreu */ }
  for (const ouvinte of viva.ouvintes) {
    try { ouvinte.end(); } catch { /* já fechou */ }
  }
  viva.ouvintes.clear();
  try { fs.rmSync(caminhoDaMiniatura(cameraId), { force: true }); } catch { /* nada a limpar */ }
  transmissoes.delete(cameraId);
}

/** Sobe as câmeras marcadas como ligadas. Chamado na partida do servidor. */
export function iniciarCamerasSalvas(): void {
  garantirPastas();
  carregarEventos();
  for (const camera of lerCameras()) {
    if (camera.ligada) abrirTransmissao(camera);
  }
}

/** Desliga tudo. Sem isto, um ffmpeg por câmera sobreviveria ao fechamento do app. */
export function pararTodasAsCameras(): void {
  for (const id of [...transmissoes.keys()]) fecharTransmissao(id);
}

// ============================================================================
// AS ROTAS
// ============================================================================

export const cameraRouter = Router();

cameraRouter.get('/', (_req: Request, res: Response) => {
  res.json({ cameras: lerCameras().map(comoAparecePraTela) });
});

/**
 * Confere um endereço ANTES de salvar.
 *
 * Sem isto, errar a senha guardava uma câmera que nunca conecta e deixava a pessoa olhando um
 * retângulo preto sem saber se o problema era o endereço, a senha, a rede ou o OSONE. Aqui o
 * ffmpeg só lê o cabeçalho do fluxo e sai: em poucos segundos se sabe se aquilo é uma câmera.
 */
cameraRouter.post('/testar', async (req: Request, res: Response) => {
  const url = String(req.body?.url || '').trim();
  const recusa = validarUrlDeCamera(url);
  if (recusa) return res.status(400).json({ ok: false, error: recusa });

  const processo = spawn(resolverFfmpeg(), [
    '-nostdin', '-loglevel', 'error',
    ...argumentosDeEntrada(url), '-i', url,
    '-frames:v', '1', '-f', 'null', '-'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let erro = '';
  processo.stderr?.on('data', (d) => { erro += String(d); });

  const prazo = setTimeout(() => { try { processo.kill('SIGKILL'); } catch { /* já morreu */ } }, 15_000);
  processo.on('error', (err) => {
    clearTimeout(prazo);
    res.status(500).json({ ok: false, error: `Não consegui executar o ffmpeg: ${err.message}` });
  });
  processo.on('close', (codigo) => {
    clearTimeout(prazo);
    if (res.headersSent) return;
    if (codigo === 0) return res.json({ ok: true, endereco: mascararUrl(url) });
    const ultimaLinha = erro.trim().split('\n').filter(Boolean).pop() || '';
    res.json({
      ok: false,
      error: ultimaLinha.includes('401') || /unauthorized/i.test(ultimaLinha)
        ? 'A câmera recusou o usuário ou a senha.'
        : ultimaLinha || 'Não consegui conectar nessa câmera em 15 segundos. Confira IP, porta e se ela está na mesma rede.'
    });
  });
});

cameraRouter.post('/', (req: Request, res: Response) => {
  const nome = String(req.body?.nome || '').trim();
  const url = String(req.body?.url || '').trim();
  if (!nome) return res.status(400).json({ error: 'Dê um nome para a câmera.' });
  const recusa = validarUrlDeCamera(url);
  if (recusa) return res.status(400).json({ error: recusa });

  const camera: CameraConfigurada = {
    id: novoId('cam'),
    nome,
    url,
    local: String(req.body?.local || '').trim() || undefined,
    ligada: req.body?.ligada !== false,
    sensibilidade: Number(req.body?.sensibilidade) > 0 ? Number(req.body.sensibilidade) : 0.025,
    criadaEm: Date.now()
  };

  const lista = lerCameras();
  lista.push(camera);
  salvarCameras(lista);
  if (camera.ligada) abrirTransmissao(camera);

  res.json({ camera: comoAparecePraTela(camera) });
});

cameraRouter.patch('/:id', (req: Request, res: Response) => {
  const lista = lerCameras();
  const camera = lista.find(c => c.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Câmera não encontrada.' });

  if (typeof req.body?.nome === 'string' && req.body.nome.trim()) camera.nome = req.body.nome.trim();
  if (typeof req.body?.local === 'string') camera.local = req.body.local.trim() || undefined;
  if (Number(req.body?.sensibilidade) > 0) camera.sensibilidade = Number(req.body.sensibilidade);
  if (typeof req.body?.url === 'string' && req.body.url.trim()) {
    const recusa = validarUrlDeCamera(req.body.url.trim());
    if (recusa) return res.status(400).json({ error: recusa });
    camera.url = req.body.url.trim();
    // Endereço novo é câmera nova para efeito de conexão: manter o processo antigo seria continuar
    // olhando o endereço velho enquanto a tela mostra o novo.
    fecharTransmissao(camera.id);
  }
  if (typeof req.body?.ligada === 'boolean') camera.ligada = req.body.ligada;

  salvarCameras(lista);
  if (camera.ligada) abrirTransmissao(camera);
  else fecharTransmissao(camera.id);

  res.json({ camera: comoAparecePraTela(camera) });
});

cameraRouter.delete('/:id', (req: Request, res: Response) => {
  const lista = lerCameras();
  const restante = lista.filter(c => c.id !== req.params.id);
  if (restante.length === lista.length) return res.status(404).json({ error: 'Câmera não encontrada.' });
  fecharTransmissao(req.params.id);
  salvarCameras(restante);
  // As gravações NÃO são apagadas junto: elas são o registro do que aconteceu, e apagar prova
  // porque o equipamento saiu de linha é o oposto do que um sistema de vigilância deve fazer.
  res.json({ ok: true });
});

/**
 * O VÍDEO AO VIVO, do jeito que um <img> entende.
 *
 * multipart/x-mixed-replace é o truque antigo que ainda é o mais compatível que existe: o servidor
 * nunca fecha a resposta e vai empurrando imagem atrás de imagem, cada uma substituindo a
 * anterior. Não precisa de player, de biblioteca nem de codec — funciona igual no navegador, no
 * app instalado e no Android.
 */
cameraRouter.get('/:id/ao-vivo', (req: Request, res: Response) => {
  const camera = lerCameras().find(c => c.id === req.params.id);
  if (!camera) return res.status(404).json({ error: 'Câmera não encontrada.' });
  if (!camera.ligada) return res.status(409).json({ error: 'Esta câmera está desligada.' });

  const viva = transmissoes.get(camera.id) ?? abrirTransmissao(camera);

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=quadro',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    Connection: 'close'
  });

  viva.ouvintes.add(res);
  // Quem chega recebe o último quadro na hora: esperar o próximo deixaria a tela preta por até um
  // oitavo de segundo — pouco, mas o suficiente para parecer que não funcionou.
  if (viva.ultimoQuadro) enviarQuadroAosOuvintes(viva, viva.ultimoQuadro);

  const sair = () => { viva.ouvintes.delete(res); };
  req.on('close', sair);
  req.on('error', sair);
});

/** Um quadro só, para miniatura e para quem não quer manter conexão aberta. */
cameraRouter.get('/:id/quadro', (req: Request, res: Response) => {
  const viva = transmissoes.get(req.params.id);
  if (!viva?.ultimoQuadro) return res.status(503).json({ error: 'Ainda não há imagem desta câmera.' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.end(viva.ultimoQuadro);
});

cameraRouter.get('/eventos', (req: Request, res: Response) => {
  const cameraId = String(req.query?.cameraId || '');
  const limite = Math.min(Number(req.query?.limite) || 100, 500);
  const lista = cameraId ? eventosRecentes.filter(e => e.cameraId === cameraId) : eventosRecentes;
  res.json({ eventos: lista.slice(0, limite) });
});

/**
 * Entrega o clipe ou o quadro de um evento.
 *
 * O nome do arquivo vem da URL, então ele NÃO pode virar caminho: "../.." levaria a qualquer
 * arquivo da máquina. Só o nome puro é aceito, e ainda assim o caminho final é conferido contra a
 * pasta de gravações antes de qualquer leitura.
 */
cameraRouter.get('/gravacoes/:arquivo', (req: Request, res: Response) => {
  const pedido = String(req.params.arquivo || '');
  const nomeSeguro = path.basename(pedido);
  const destino = path.resolve(PASTA_DAS_GRAVACOES, nomeSeguro);
  if (nomeSeguro !== pedido || !destino.startsWith(path.resolve(PASTA_DAS_GRAVACOES) + path.sep)) {
    return res.status(400).json({ error: 'Nome de arquivo inválido.' });
  }
  if (!fs.existsSync(destino)) return res.status(404).json({ error: 'Gravação não encontrada.' });
  res.sendFile(destino);
});
