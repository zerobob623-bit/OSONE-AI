/**
 * Confere a mira na própria interface (src/lib/mirarNaInterface.ts) num Chromium de verdade,
 * contra uma tela SIMULADA cuja tradução é conhecida de antemão.
 *
 * Por que existe: a mira só pode ser julgada comparando o que ela devolve com onde o botão
 * realmente está — e na máquina do usuário essa segunda metade não existe, o que faz acerto e erro
 * produzirem a mesma tela. Aqui a resposta certa é sabida, então cada caso separa um do outro. Foi
 * assim que se descobriu que "Menu" era devolvido para quem pedia "Menu invisível" e que dois
 * movimentos de cursor eram gastos à toa em toda mira que caía fora da janela.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-mira.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("Este conferidor precisa do playwright: rode 'npm i -D playwright' e tente de novo.");
  process.exit(2);
}

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-mira-'));
const arquivoJs = path.join(pastaTemp, 'mira.js');
const arquivoHtml = path.join(pastaTemp, 'pagina.html');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/mirarNaInterface.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'Mira',
  outfile: arquivoJs,
  logLevel: 'silent'
});

// Uma interface mínima com os mesmos casos difíceis do OSONE: botão que é só ícone com o nome no
// aria-label, botão que é só ícone com o nome no title, botão com o texto dentro de um <span>, e um
// botão escondido do jeito que o modo Voz Livre esconde a barra inteira.
fs.writeFileSync(arquivoHtml, `<!doctype html>
<html><head><meta charset="utf-8"><title>OSONE (simulado)</title>
<style>
  body { margin: 0; font-family: sans-serif; background: #111; color: #ccc; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; }
  button { padding: 8px 14px; background: #222; color: #ccc; border: 1px solid #333; }
  .escondido { opacity: 0; pointer-events: none; }
</style></head>
<body>
  <header>
    <button id="hamburguer" title="Menu" aria-label="Menu (hambúrguer) — abrir a barra lateral">
      <svg width="20" height="20"><rect width="20" height="2" y="4"/><rect width="20" height="2" y="9"/></svg>
    </button>
    <div>
      <button id="fundo" title="Mudar Cor de Fundo do App"><span>FUNDO</span></button>
      <button id="instalar" title="Instalar App">Instalar</button>
      <button id="compartilhar" title="Compartilhar Tela"><svg width="14" height="14"><rect width="14" height="14"/></svg></button>
    </div>
  </header>
  <div class="escondido"><button id="fantasma" title="Menu">Menu invisível</button></div>
  <main style="padding:40px"><button id="conteudo">Conteúdo</button></main>
</body></html>`);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));

const navegador = await chromium.launch(executavel ? { executablePath: executavel } : {});
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } });
await pagina.goto('file://' + arquivoHtml);
await pagina.addScriptTag({ path: arquivoJs });

const TELA = { width: 1920, height: 1080, offsetX: 0, offsetY: 0 };

/**
 * Roda uma mira contra uma tela falsa. `origem` e `escala` são a tradução VERDADEIRA entre o pixel
 * da tela e o ponto da página — exatamente o que a mira tem de descobrir sozinha.
 */
const mirar = (alvo, { origem, escala, cursorInicial = null, ponteiroNuncaChega = false }) =>
  pagina.evaluate(async ({ alvo, origem, escala, tela, cursorInicial, ponteiroNuncaChega }) => {
    let cursor = cursorInicial;
    let movimentos = 0;

    const mover = async (x, y) => {
      movimentos++;
      const mudou = !cursor || cursor.x !== x || cursor.y !== y;
      cursor = { x, y };
      if (mudou && !ponteiroNuncaChega) {
        const clientX = (x - origem.x) / escala;
        const clientY = (y - origem.y) / escala;
        // Só há evento quando o ponteiro cai DENTRO da janela — como no mundo real.
        if (clientX >= 0 && clientY >= 0 && clientX < window.innerWidth && clientY < window.innerHeight) {
          setTimeout(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true })), 5);
        }
      }
      return { x, y };
    };

    const resultado = await window.Mira.mirarNaInterface(alvo, tela, mover);
    return { resultado, movimentos };
  }, { alvo, origem, escala, tela: TELA, cursorInicial, ponteiroNuncaChega });

const conferirPosicao = async (nome, alvo, seletor, opcoes) => {
  const { resultado, movimentos } = await mirar(alvo, opcoes);
  if (!resultado.encontrado) return registrar(nome, false, `não encontrou: ${resultado.motivo}`);

  // O que decide um clique não é a distância até o centro geométrico e sim cair DENTRO do botão.
  // O erro em relação ao centro vai junto por ser a medida comparável com os outros caminhos de
  // mira (estimativa: de 44 a 510px), mas quem reprova o caso é o pixel fora do retângulo.
  const caixa = await pagina.locator(seletor).boundingBox();
  const naTela = (px, py) => ({
    x: opcoes.origem.x + px * opcoes.escala,
    y: opcoes.origem.y + py * opcoes.escala
  });
  const canto = naTela(caixa.x, caixa.y);
  const fim = naTela(caixa.x + caixa.width, caixa.y + caixa.height);
  const centro = naTela(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);

  const { x, y } = resultado.alvo.pixel;
  const dentro = x >= canto.x && x <= fim.x && y >= canto.y && y <= fim.y;
  const erroX = Math.abs(x - Math.round(centro.x));
  const erroY = Math.abs(y - Math.round(centro.y));
  registrar(nome, dentro,
    `"${resultado.alvo.rotulo}" (${resultado.alvo.origemDoNome}); ${dentro ? 'dentro do botão' : 'FORA DO BOTÃO'}, ` +
    `a ${erroX}px do centro em X e ${erroY}px em Y, ${movimentos} movimento(s)`);
};

// Janela comum, começando a 100,200 da tela: o deslocamento que a conta sozinha não adivinha.
const janelaComum = { origem: { x: 100, y: 200 }, escala: 1 };

await conferirPosicao('hambúrguer — só ícone, achado pelo aria-label', 'hambúrguer', '#hamburguer', janelaComum);
await conferirPosicao('menu — title exato no mesmo botão', 'menu', '#hamburguer', janelaComum);
await conferirPosicao('Compartilhar Tela — só ícone, achado pelo title', 'Compartilhar Tela', '#compartilhar', janelaComum);
await conferirPosicao('Fundo — texto dentro do botão', 'fundo', '#fundo', janelaComum);
await conferirPosicao('Conteúdo — acento e maiúscula', 'conteudo', '#conteudo', janelaComum);
// O desvio fixo de 45px em Y que aparecia em todo clique: a barra do navegador não prevista.
await conferirPosicao('desvio fixo de 45px em Y', 'Instalar', '#instalar', { origem: { x: 0, y: 45 }, escala: 1 });
await conferirPosicao('monitor em escala 2', 'Instalar', '#instalar', { origem: { x: 60, y: 120 }, escala: 2 });

{
  // Cursor já parado no pixel do alvo: sem deslocamento não há evento, e sem o empurrão a mira
  // concluiria que a janela está escondida.
  const caixa = await pagina.locator('#instalar').boundingBox();
  await conferirPosicao('cursor já parado em cima do alvo', 'Instalar', '#instalar', {
    ...janelaComum,
    cursorInicial: { x: Math.round(100 + caixa.x + caixa.width / 2), y: Math.round(200 + caixa.y + caixa.height / 2) }
  });
}

{
  // Janela do OSONE atrás de outra: devolver coordenada aqui clicaria no programa da frente.
  const { resultado } = await mirar('Instalar', { ...janelaComum, ponteiroNuncaChega: true });
  registrar('janela por cima — recusa em vez de chutar', !resultado.encontrado && !!resultado.motivo,
    resultado.encontrado ? 'DEVOLVEU COORDENADA SEM CONFIRMAÇÃO' : 'recusou com motivo');
}

{
  // Rótulo curto não pode ser puxado por um pedido maior que fala de outro botão.
  const { resultado } = await mirar('Menu invisível', janelaComum);
  registrar('rótulo parecido não vira alvo errado', !resultado.encontrado,
    resultado.encontrado ? `mirou "${resultado.alvo.rotulo}"` : 'recusou');
}

{
  const { resultado } = await mirar('Configurações Avançadas', janelaComum);
  registrar('rótulo inexistente lista o que existe',
    !resultado.encontrado && (resultado.rotulosVisiveis || []).length > 0,
    resultado.encontrado ? 'achou o que não existe' : `viu ${(resultado.rotulosVisiveis || []).length} rótulos`);
}

await navegador.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const falharam = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falharam}/${casos.length} conferências passaram.`);
process.exit(falharam ? 1 : 0);
