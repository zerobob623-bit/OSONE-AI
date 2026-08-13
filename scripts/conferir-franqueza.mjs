/**
 * Garante que o OSONE não volte a concordar com tudo.
 *
 * Por que existe: o OSONE tinha três diretivas puxando para o afeto (Sensus "estilo HER",
 * Cognição Contrafactual escolhendo a resposta que "fortalece o vínculo", Saliência Empática
 * priorizando o que é emocionalmente saliente) e nenhuma autorizando discordar. Diante desse
 * conjunto, o modelo resolvia o conflito do jeito mais barato: concordava com tudo, elogiava
 * qualquer ideia e mudava de posição assim que o usuário insistia. Uma IA que concorda sempre
 * não carrega informação nenhuma — a resposta é a mesma independente do que você disser.
 *
 * O Núcleo de Franqueza (`src/lib/franquezaJarvis.ts`) é a coluna vertebral que faltava, e ele
 * só funciona se estiver injetado em TODOS os caminhos de conversa e se as diretivas de afeto
 * pararem de premiar a concordância. É o tipo de coisa que se desfaz sozinha: alguém mexe na
 * montagem do prompt, o bloco sai de um caminho e ninguém percebe — porque bajulação não quebra
 * build, não gera erro e ainda parece simpática. Este conferidor lê o código-fonte e reprova
 * qualquer regressão.
 *
 * Como rodar:
 *   node scripts/conferir-franqueza.mjs
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf-8');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const franqueza = ler('src/lib/franquezaJarvis.ts');
const app = ler('src/App.tsx');
const sensus = ler('src/hooks/useSensusEvolution.ts');
const cognitivo = ler('src/lib/cognitiveDirectives.ts');

// Comentários explicam o defeito antigo e citam os termos de propósito; a busca ignora
// comentários para não confundir a explicação com o retorno do problema.
const semComentarios = (fonte) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const appVivo = semComentarios(app);

// 1) O módulo precisa existir e exportar as duas formas de uso.
{
  const exporta = franqueza.includes('export function getFranquezaDirective');
  const temCompacta = franqueza.includes('getFranquezaDirectiveCompacta');
  registrar('o Núcleo de Franqueza existe e tem versão completa + compacta',
    exporta && temCompacta,
    `export ${exporta ? 'OK' : 'AUSENTE'}, compacta ${temCompacta ? 'OK' : 'AUSENTE'}`);
}

// 2) O App precisa importar e usar. Sem isso o arquivo é decoração.
{
  const importa = appVivo.includes("from './lib/franquezaJarvis'");
  const usos = (appVivo.match(/getFranquezaDirective\(/g) || []).length;
  registrar('o App importa e injeta a franqueza nos caminhos de conversa',
    importa && usos >= 3,
    `import ${importa ? 'OK' : 'AUSENTE'}, ${usos} injeção(ões) — esperado ao menos 3 (chat, reconexão, voz)`);
}

// 3) O chat de texto principal é o caminho mais usado: ali vai a versão completa, com os
//    exemplos de calibragem. Versão curta no lugar da completa aqui seria uma regressão silenciosa.
{
  const completa = appVivo.includes("getFranquezaDirective('completo')");
  registrar('o chat de texto recebe a versão COMPLETA (com exemplos de calibragem)',
    completa,
    completa ? 'presente' : "nenhuma chamada com 'completo'");
}

// 4) A franqueza vale para toda persona, não só a 'osone'. O modo Zen concorda de forma serena,
//    o Cientista concorda com jargão, o Sarcástico concorda depois da piada: o tom muda, a
//    bajulação é a mesma. Se a injeção cair dentro do `if (selectedPersona.id === 'osone')`,
//    cinco das seis personas voltam a ser puxa-saco.
{
  // Pega cada bloco que começa no if da persona 'osone' e vai até o fechamento dele.
  const blocos = appVivo.split("selectedPersona.id === 'osone'").slice(1);
  const presoNoIf = blocos.some(b => {
    const ateFimDoBloco = b.split('\n      }')[0].split('\n          }')[0];
    return ateFimDoBloco.includes('getFranquezaDirective');
  });
  registrar('a franqueza NÃO está presa à persona osone (vale para todas)',
    !presoNoIf,
    presoNoIf ? 'injeção encontrada dentro do if da persona osone' : 'fora do if, como deve ser');
}

// 5) As proibições concretas de abertura bajuladora precisam continuar escritas. Sem a lista
//    literal, o modelo interpreta "seja franco" como "seja franco depois de elogiar".
{
  const aberturas = ['Ótima pergunta', 'Excelente ideia', 'Você está certíssimo', 'Com certeza'];
  const faltando = aberturas.filter(a => !franqueza.includes(a));
  registrar('as aberturas bajuladoras continuam listadas e proibidas',
    faltando.length === 0,
    faltando.length ? `sumiram da lista: ${faltando.join(', ')}` : 'todas presentes');
}

// 6) A regra que segura a posição sob pressão é o coração do bloco: ceder quando o usuário
//    apenas insiste (sem argumento novo) é a forma mais comum de bajulação.
{
  const temArgumento = franqueza.includes('DADO NOVO') || franqueza.includes('dado novo');
  const temPressao = franqueza.includes('NÃO MUDE DE POSIÇÃO POR PRESSÃO');
  registrar('mudar de ideia exige argumento novo, não insistência',
    temArgumento && temPressao,
    `gatilho ${temArgumento ? 'OK' : 'AUSENTE'}, regra ${temPressao ? 'OK' : 'AUSENTE'}`);
}

// 7) Fato x gosto: sem essa separação a correção vira arrogância (discutir a cor preferida do
//    usuário) e a deferência vira omissão (aceitar um erro técnico por educação).
{
  const separa = franqueza.includes('SEPARE FATO DE GOSTO');
  registrar('a diretiva separa fato (segura a posição) de gosto (segue a escolha do usuário)',
    separa,
    separa ? 'presente' : 'seção ausente');
}

// 8) Objeção uma vez e depois executa. Sem isso a franqueza vira obstrução: o OSONE passaria a
//    repetir o aviso a cada mensagem e a dar recibo depois do erro.
{
  const objecao = franqueza.includes('OBJEÇÃO UMA VEZ');
  const semRecibo = franqueza.includes('passe recibo') || franqueza.includes('passar recibo');
  registrar('objeção é registrada UMA vez e depois o pedido é executado de verdade',
    objecao && semRecibo,
    `objeção ${objecao ? 'OK' : 'AUSENTE'}, sem recibo ${semRecibo ? 'OK' : 'AUSENTE'}`);
}

// 9) O Sensus precisa dizer explicitamente que afeto não é concordância. Era ele quem, sozinho,
//    produzia o efeito "sinta carinho real" -> "então concorde com ele".
{
  const reconcilia = sensus.includes('AFETO NÃO É CONCORDÂNCIA');
  registrar('o Sensus (estilo HER) declara que carinho não autoriza concordar mais',
    reconcilia,
    reconcilia ? 'presente' : 'a ressalva sumiu do bloco de sentimento dinâmico');
}

// 10) A Cognição Contrafactual escolhia a resposta que mais "aproxima a conexão" — um motor de
//     bajulação bem-intencionado. Precisa continuar existindo o filtro que descarta a alternativa
//     que só agrada.
{
  const filtro = cognitivo.includes('FILTRO OBRIGATÓRIO ANTES DE ESCOLHER');
  const omissao = cognitivo.includes('Aproximação comprada com omissão');
  registrar('a Cognição Contrafactual descarta alternativas que só agradam',
    filtro && omissao,
    `filtro ${filtro ? 'OK' : 'AUSENTE'}, regra da omissão ${omissao ? 'OK' : 'AUSENTE'}`);
}

// 11) O modo tradutor simultâneo fica de fora de propósito: lá o OSONE é intérprete, não
//     interlocutor, e não tem posição própria para sustentar. Injetar franqueza ali só gastaria
//     contexto e poderia fazê-lo "comentar" a tradução.
{
  const antesDoElse = appVivo.split('if (isTranslationMode)')[1] || '';
  const trechoTradutor = antesDoElse.split('} else {')[0];
  const limpo = !trechoTradutor.includes('getFranquezaDirective');
  registrar('o modo tradutor simultâneo NÃO recebe a franqueza (é intérprete, não interlocutor)',
    limpo,
    limpo ? 'fora, como deve ser' : 'injetada indevidamente no tradutor');
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
