/**
 * Verifica que o OSONE AVISA o modelo quando para de enviar a imagem da tela.
 *
 * Por que existe: o modelo descreveu, com todas as letras, "código React Native para
 * desenvolvimento móvel" numa tela do OSONE CODE que não tinha nada disso. Não foi teimosia do
 * modelo — foi falta de aviso. O envio de quadros é interrompido em duas situações legítimas
 * (durante o exame de uma captura, e por 20 segundos a cada ação no computador), e nenhuma delas
 * era comunicada. Do lado do modelo nada mudava: a instrução continuava mandando ler a tela e ele
 * seguia recebendo perguntas sobre "o que está aí". Sem imagem e sem aviso, o que sobra é
 * completar com o que costuma existir numa tela daquele tipo.
 *
 * A pausa mais longa dura 20 segundos por ação — não é uma janela estreita, é justamente o
 * intervalo em que mais se pergunta o que está acontecendo.
 *
 * O que se observa aqui é o que chega à sessão: os quadros e os avisos, na ordem real, com o
 * relógio controlado pelo teste.
 *
 * Como rodar:
 *   node scripts/conferir-visao-cega.mjs
 */
const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/**
 * O bombeamento de quadros do App, reproduzido com as MESMAS condições e na mesma ordem.
 *
 * Extrair para cá em vez de montar o App inteiro é proposital: o que está sob teste é a regra de
 * quando avisar, e ela precisa ser lida junto com o código do App (src/App.tsx, startScreenSharing).
 * Se alguém mudar as condições lá sem mudar aqui, os casos abaixo deixam de descrever a realidade —
 * por isso o último caso confere que o App continua tendo os dois avisos e as duas pausas.
 */
function criarBombeamento({ agora, enviar, pausarAte, ultimaAcaoNoPc, conectado }) {
  let enxergandoAgora = null;
  const avisarSeMudou = (enxergando, motivo) => {
    if (enxergandoAgora === enxergando) return;
    enxergandoAgora = enxergando;
    if (!conectado()) return;
    const aviso = enxergando
      ? '[VISÃO] A imagem da tela voltou. A partir de agora você está vendo a tela de novo.'
      : `[VISÃO] Você PAROU de receber a imagem da tela (${motivo}). Enquanto isso você está cego: `
        + 'NÃO descreva, não leia e não suponha nada do que está na tela. Se perguntarem, diga que a '
        + 'imagem está indisponível neste instante.';
    enviar({ text: aviso });
  };

  return () => {
    if (agora() < pausarAte()) {
      avisarSeMudou(false, 'uma captura está sendo examinada');
      return;
    }
    if (agora() - ultimaAcaoNoPc() < 20000) {
      avisarSeMudou(false, 'o OSONE está executando uma ação no computador');
      return;
    }
    if (conectado()) {
      enviar({ video: { data: 'quadro', mimeType: 'image/jpeg' } });
      avisarSeMudou(true, '');
    }
  };
}

const montar = () => {
  const recebido = [];
  const estado = { t: 100000, pausarAte: 0, ultimaAcao: -999999, conectado: true };
  const tick = criarBombeamento({
    agora: () => estado.t,
    enviar: (m) => recebido.push(m),
    pausarAte: () => estado.pausarAte,
    ultimaAcaoNoPc: () => estado.ultimaAcao,
    conectado: () => estado.conectado
  });
  return { recebido, estado, tick, avisos: () => recebido.filter(m => m.text).map(m => m.text),
           quadros: () => recebido.filter(m => m.video).length };
};

// 1) Ação no PC cega o modelo — e ele precisa ser avisado.
{
  const { estado, tick, avisos, quadros } = montar();
  tick();                       // enxergando
  estado.ultimaAcao = estado.t; // o OSONE clicou em algo
  tick();
  const cegou = avisos().some(a => a.includes('PAROU de receber a imagem'));
  registrar('ação no computador avisa o modelo de que ele ficou cego',
    cegou && quadros() === 1,
    cegou ? 'aviso enviado' : `NENHUM aviso; o modelo segue achando que vê (${quadros()} quadro(s))`);
}

// 2) O aviso precisa PROIBIR a descrição, e não só informar.
{
  const { estado, tick, avisos } = montar();
  tick();
  estado.ultimaAcao = estado.t;
  tick();
  const texto = avisos().find(a => a.includes('PAROU')) || '';
  registrar('o aviso proíbe descrever, ler ou supor o conteúdo da tela',
    /NÃO descreva/.test(texto) && /não suponha/.test(texto),
    texto ? 'proibição explícita presente' : 'aviso ausente');
}

// 3) Examinar uma captura também cega — e com o motivo certo.
{
  const { estado, tick, avisos } = montar();
  tick();
  estado.pausarAte = estado.t + 8000;
  tick();
  const texto = avisos().find(a => a.includes('PAROU')) || '';
  registrar('exame de captura avisa, com o motivo correspondente',
    texto.includes('captura está sendo examinada'),
    texto ? texto.slice(0, 60) + '…' : 'sem aviso');
}

// 4) O aviso sai UMA vez por mudança, e não a cada segundo.
{
  const { estado, tick, avisos } = montar();
  tick();
  estado.ultimaAcao = estado.t;
  for (let i = 0; i < 10; i++) { estado.t += 1000; tick(); }
  const quantos = avisos().filter(a => a.includes('PAROU')).length;
  registrar('o aviso de cegueira não vira ruído: um por mudança de estado',
    quantos === 1,
    `${quantos} aviso(s) em 10 segundos de pausa`);
}

// 5) A volta é avisada — senão o modelo fica calado sobre a tela para sempre.
{
  const { estado, tick, avisos, quadros } = montar();
  tick();
  estado.ultimaAcao = estado.t;
  tick();
  estado.t += 21000;  // passaram os 20 segundos
  tick();
  const voltou = avisos().some(a => a.includes('imagem da tela voltou'));
  registrar('quando a imagem volta, o modelo é avisado de que pode ver de novo',
    voltou && quadros() === 2,
    voltou ? `avisado, ${quadros()} quadro(s) enviados` : 'NÃO avisado: ficaria cego para sempre');
}

// 6) O aviso de volta vem DEPOIS do quadro, não antes.
{
  const { estado, tick, recebido } = montar();
  estado.ultimaAcao = estado.t;
  tick();
  estado.t += 21000;
  tick();
  const iQuadro = recebido.findIndex(m => m.video);
  const iVolta = recebido.findIndex(m => m.text && m.text.includes('voltou'));
  registrar('o "voltei a ver" só é dito depois de a imagem realmente chegar',
    iQuadro !== -1 && iVolta > iQuadro,
    `quadro na posição ${iQuadro}, aviso na ${iVolta}`);
}

// 7) Sessão de voz desligada não recebe aviso nenhum (não há a quem avisar).
{
  const { estado, tick, recebido } = montar();
  estado.conectado = false;
  estado.ultimaAcao = estado.t;
  tick(); tick();
  registrar('sem sessão de voz conectada, nada é enviado',
    recebido.length === 0,
    `${recebido.length} mensagem(ns)`);
}

// 8) O App precisa continuar tendo as duas pausas E os dois avisos.
{
  const fs = await import('fs');
  const path = await import('path');
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const app = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf-8');
  const temFuncao = app.includes('const avisarSeMudou = (enxergando');
  // Só as CHAMADAS: a definição usa "avisarSeMudou = (" e não entra nesta conta. São três pontos
  // onde o aviso precisa existir — a pausa da captura, a pausa da ação no PC, e a volta da imagem.
  const chamadas = (app.match(/avisarSeMudou\(/g) || []).length;
  const cega = (app.match(/avisarSeMudou\(false/g) || []).length;
  const volta = (app.match(/avisarSeMudou\(true/g) || []).length;
  registrar('o App continua avisando nas duas pausas e na volta',
    temFuncao && cega === 2 && volta === 1,
    `${cega} aviso(s) de cegueira e ${volta} de volta, em ${chamadas} chamada(s)`);
}

// 9) A instrução do modelo não pode congelar o estado da visão no início da sessão.
{
  const fs = await import('fs');
  const path = await import('path');
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const app = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf-8');
  const congelado = app.includes('compartilhamento de tela ativo: ${isScreenSharing');
  const ensina = app.includes('considere-se CEGO até o aviso de volta');
  registrar('a instrução ensina a depender do aviso, e não de um estado congelado',
    !congelado && ensina,
    congelado ? 'ainda congela isScreenSharing na instrução' : 'instrução baseada nos avisos [VISÃO]');
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
