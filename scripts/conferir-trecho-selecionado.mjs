/**
 * Confere a edição de um TRECHO selecionado — e, sobretudo, quando ela precisa se RECUSAR.
 *
 * Sem isto, todo pedido reescrevia o arquivo inteiro. Num jogo de 50 mil caracteres, "muda a cor
 * do botão" fazia o modelo gerar 50 mil caracteres de novo: minutos de espera, cota gasta à toa
 * e — o pior — mil linhas que estavam certas ao alcance de uma mexida indevida.
 *
 * O perigo do conserto é o oposto do problema que ele resolve. Entre apertar "gerar" e a resposta
 * chegar passam dezenas de segundos, e nesse meio-tempo a pessoa pode digitar, desfazer, ou o
 * Enxame pode mexer no arquivo. As posições guardadas passam a apontar para outro lugar, e gravar
 * por elas enfiaria o texto novo no meio de uma função qualquer — estrago silencioso, do tipo que
 * só aparece muito depois. Por isso metade dos casos aqui verifica que NADA é gravado.
 *
 * Como rodar:
 *   node scripts/conferir-trecho-selecionado.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-trecho-'));
const saida = path.join(pastaTemp, 'codeEdits.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/codeEdits.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { substituirTrecho, contextoAoRedor } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const ARQUIVO = `<!DOCTYPE html>
<html><body>
<script>
function checarBatida(a, b) { return a.x === b.x; }
function desenhar() { ctx.fillRect(0, 0, 10, 10); }
</script>
</body></html>`;
const TRECHO_TEXTO = 'function checarBatida(a, b) { return a.x === b.x; }';
const inicio = ARQUIVO.indexOf(TRECHO_TEXTO);
const TRECHO = { inicio, fim: inicio + TRECHO_TEXTO.length, texto: TRECHO_TEXTO };
const NOVO = 'function checarBatida(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) < 20; }';

// ====== 1) O CAMINHO NORMAL: só o trecho muda ======
{
  const r = substituirTrecho(ARQUIVO, TRECHO, NOVO);
  const soOTrechoMudou = r.conteudo === ARQUIVO.replace(TRECHO_TEXTO, NOVO);
  registrar('o trecho é substituído e o resto do arquivo fica idêntico',
    r.aplicou && soOTrechoMudou, soOTrechoMudou ? 'resto intacto' : 'ALTEROU fora do trecho');
}

{
  const r = substituirTrecho(ARQUIVO, TRECHO, NOVO);
  registrar('o que estava fora do trecho continua lá, palavra por palavra',
    r.conteudo.includes('function desenhar() { ctx.fillRect(0, 0, 10, 10); }')
      && r.conteudo.startsWith('<!DOCTYPE html>') && r.conteudo.endsWith('</html>'),
    'começo, meio e fim preservados');
}

// ====== 2) CERCA DE MARKDOWN NÃO ENTRA NO ARQUIVO ======
{
  const r = substituirTrecho(ARQUIVO, TRECHO, '```js\n' + NOVO + '\n```');
  registrar('cerca de markdown ao redor da resposta é removida antes de gravar',
    r.aplicou && !r.conteudo.includes('```') && r.conteudo.includes('Math.hypot'),
    r.conteudo.includes('```') ? 'GRAVOU as cercas' : 'arquivo limpo');
}

// ====== 3) O ARQUIVO MUDOU DURANTE A GERAÇÃO: as posições não valem mais ======
// Este é o caso que corromperia o arquivo em silêncio se fosse resolvido pelo número.
{
  const comLinhaNova = '<!-- o usuário digitou isto enquanto esperava -->\n' + ARQUIVO;
  const r = substituirTrecho(comLinhaNova, TRECHO, NOVO);
  const trocouNoLugarCerto = r.conteudo.includes('Math.hypot')
    && r.conteudo.startsWith('<!-- o usuário digitou isto enquanto esperava -->')
    && !r.conteudo.includes('a.x === b.x');
  registrar('arquivo editado durante a espera: acha o trecho pelo TEXTO, não pela posição',
    r.aplicou && trocouNoLugarCerto,
    trocouNoLugarCerto ? 'substituiu no lugar certo mesmo com tudo deslocado' : 'gravou no lugar ERRADO');
}

// ====== 4) O TRECHO SUMIU: não se grava nada ======
{
  const semOTrecho = ARQUIVO.replace(TRECHO_TEXTO, '// apagado pelo usuário');
  const r = substituirTrecho(semOTrecho, TRECHO, NOVO);
  registrar('trecho que não existe mais no arquivo NÃO é gravado em lugar nenhum',
    !r.aplicou && r.conteudo === semOTrecho && !!r.erro,
    r.erro || 'sem explicação');
}

// ====== 5) O TRECHO FICOU AMBÍGUO: também não se grava ======
// Duas cópias do mesmo texto e nenhuma forma de saber qual a pessoa quis mudar. Escolher uma
// seria acertar por sorte; errar aqui altera código que ninguém pediu para alterar.
{
  const duplicado = ARQUIVO + '\n<script>' + TRECHO_TEXTO + '</script>';
  const posicaoInvalida = { inicio: 999999, fim: 999999 + TRECHO_TEXTO.length, texto: TRECHO_TEXTO };
  const r = substituirTrecho(duplicado, posicaoInvalida, NOVO);
  registrar('trecho que virou ambíguo não é gravado, e o motivo é explicado',
    !r.aplicou && r.conteudo === duplicado && /mais de uma vez/.test(r.erro || ''),
    r.erro || 'sem explicação');
}

// ====== 6) RESPOSTA VAZIA NÃO APAGA O TRECHO ======
{
  const r = substituirTrecho(ARQUIVO, TRECHO, '   \n  ');
  registrar('resposta vazia não apaga o trecho selecionado',
    !r.aplicou && r.conteudo === ARQUIVO, r.erro || '');
}

// ====== 7) O CONTEXTO ENVIADO AO MODELO ======
// Dez linhas soltas produzem código que não conversa com o resto; o arquivo inteiro em toda
// edição de três linhas é desperdício. A janela ao redor resolve os dois.
{
  const pequeno = contextoAoRedor(ARQUIVO, TRECHO.inicio, TRECHO.fim);
  registrar('arquivo pequeno vai inteiro como contexto (não há o que economizar)',
    pequeno === ARQUIVO, `${pequeno.length} de ${ARQUIVO.length} caracteres`);
}

{
  const enorme = 'A'.repeat(30000) + TRECHO_TEXTO + 'B'.repeat(30000);
  const i = enorme.indexOf(TRECHO_TEXTO);
  const janela = contextoAoRedor(enorme, i, i + TRECHO_TEXTO.length, 4000);
  registrar('arquivo enorme manda só a janela ao redor, com o trecho dentro dela',
    janela.length < enorme.length / 5 && janela.includes(TRECHO_TEXTO),
    `${janela.length} caracteres em vez de ${enorme.length}`);
}

{
  const enorme = 'A'.repeat(30000) + TRECHO_TEXTO + 'B'.repeat(30000);
  const i = enorme.indexOf(TRECHO_TEXTO);
  const janela = contextoAoRedor(enorme, i, i + TRECHO_TEXTO.length, 4000);
  registrar('a janela avisa que o arquivo continua antes e depois dela',
    janela.startsWith('…') && janela.endsWith('…'),
    'o modelo sabe que não recebeu o arquivo todo');
}

// ====== 8) A INDENTAÇÃO DO TRECHO É RESPEITADA ======
// Aparar os dois lados está certo para um arquivo inteiro, mas aqui o texto será colado DENTRO
// de outro código: os espaços da frente SÃO a indentação dele. Comê-los desalinha em qualquer
// linguagem e, em Python, quebra o programa — lá o recuo é a sintaxe do bloco.
{
  const arquivo = 'if (x) {\n    fazerAlgo();\n}';
  const antigo = '    fazerAlgo();';
  const i = arquivo.indexOf(antigo);
  const r = substituirTrecho(arquivo, { inicio: i, fim: i + antigo.length, texto: antigo }, '    fazerOutraCoisa();');
  registrar('o recuo devolvido pelo modelo entra como está, sem ser aparado',
    r.aplicou && r.conteudo === 'if (x) {\n    fazerOutraCoisa();\n}', JSON.stringify(r.conteudo));
}

{
  // O mesmo, em Python, onde perder o recuo não é estética: é IndentationError.
  const arquivo = 'def somar(a, b):\n    return a + b\n';
  const antigo = '    return a + b';
  const i = arquivo.indexOf(antigo);
  const r = substituirTrecho(arquivo, { inicio: i, fim: i + antigo.length, texto: antigo }, '    return round(a + b, 2)');
  registrar('em Python o recuo sobrevive — sem ele o arquivo nem roda',
    r.aplicou && r.conteudo === 'def somar(a, b):\n    return round(a + b, 2)\n', JSON.stringify(r.conteudo));
}

{
  // E a cerca de markdown ao redor de um trecho indentado sai sem levar o recuo junto.
  const arquivo = 'def somar(a, b):\n    return a + b\n';
  const antigo = '    return a + b';
  const i = arquivo.indexOf(antigo);
  const r = substituirTrecho(arquivo, { inicio: i, fim: i + antigo.length, texto: antigo },
    '```python\n    return round(a + b, 2)\n```');
  registrar('cerca removida de um trecho indentado não leva a indentação junto',
    r.aplicou && r.conteudo.includes('\n    return round'), JSON.stringify(r.conteudo));
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
