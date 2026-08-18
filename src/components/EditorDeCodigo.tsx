import React, { useRef, useEffect } from 'react';
import { EditorView, keymap, highlightActiveLine, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import {
  defaultKeymap, history, historyKeymap, indentWithTab
} from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import {
  foldGutter, foldKeymap, indentOnInput, bracketMatching,
  syntaxHighlighting, HighlightStyle, indentUnit
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

/**
 * O EDITOR DA OSONE IDE — o que o realce caseiro (lib/realce.ts) não conseguia ser.
 *
 * O realce próprio continua existindo e continua certo para o que ele faz: pintar um trecho de
 * código dentro de uma bolha de chat ou de um preview, sem custo nenhum de pacote. O que ele nunca
 * teve é o COMPORTAMENTO de um editor — buscar e substituir dentro do arquivo, recolher uma função
 * para tirá-la da frente, colocar vários cursores para editar dez linhas de uma vez, indentar
 * sozinho conforme a linguagem. Numa aba que existe para editar um projeto de verdade no disco,
 * essas quatro coisas não são enfeite: são o trabalho.
 *
 * POR QUE CODEMIRROR E NÃO MONACO. Foram medidos os dois, empacotados de verdade: CodeMirror com
 * as linguagens usadas aqui pesa ~0,20 MB gzip; o Monaco com o analisador de TypeScript que dá o
 * autocomplete "de projeto" pesa ~2,25 MB gzip — mais que o app inteiro do OSONE, que hoje tem
 * 1,62 MB. O Monaco sem esse analisador custaria ~4x o CodeMirror para entregar quase só o realce
 * que já existia. Entre pagar 12% por tudo que é edição de texto e pagar 139% pela inteligência de
 * projeto, esta aba escolheu a primeira — e o "entender o código" continua sendo trabalho do
 * próprio OSONE pelo chat, que é justamente o que ele faz melhor que qualquer autocomplete.
 *
 * O peso só desce para quem ABRE a aba: a OsoneIdeSection já é carregada por React.lazy, então
 * quem nunca usa a IDE não baixa nada disto.
 */

/** Cores do realce, no mesmo tom do resto da aba (o editor é escuro, azulado). */
const TEMA_DE_CORES = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#5d6b7a', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: '#a5d6a7' },
  { tag: [tags.number, tags.bool, tags.null], color: '#f2b880' },
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: '#c792ea' },
  { tag: [tags.operator, tags.punctuation, tags.separator], color: '#89a4bd' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#7dd3fc' },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: '#e2e8f0' },
  { tag: [tags.propertyName, tags.attributeName], color: '#93c5fd' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#fbbf24' },
  { tag: [tags.tagName], color: '#f87171' },
  { tag: [tags.attributeValue], color: '#a5d6a7' },
  { tag: [tags.heading], color: '#7dd3fc', fontWeight: 'bold' },
  { tag: [tags.link, tags.url], color: '#7dd3fc', textDecoration: 'underline' },
  { tag: [tags.invalid], color: '#ef4444' }
]);

/**
 * Aparência. Fica aqui e não no CSS global porque o CodeMirror injeta as próprias regras num
 * shadow-ish scope: mexer nele pelo index.css depende de vencer especificidade, e a primeira
 * mudança de versão do pacote quebraria o seletor em silêncio.
 */
const TEMA = EditorView.theme({
  '&': { height: '100%', backgroundColor: '#0a0b10', color: '#e2e8f0', fontSize: '13px' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.625',
    overflow: 'auto'
  },
  '.cm-content': { caretColor: '#7dd3fc', padding: '12px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#7dd3fc', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(14,165,233,0.25)'
  },
  '.cm-gutters': {
    backgroundColor: 'rgba(0,0,0,0.25)', color: '#4b5563',
    border: 'none', borderRight: '1px solid rgba(255,255,255,0.05)'
  },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(14,165,233,0.08)', color: '#7dd3fc' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.02)' },
  '.cm-foldGutter .cm-gutterElement': { cursor: 'pointer', opacity: 0.5 },
  '.cm-foldGutter .cm-gutterElement:hover': { opacity: 1, color: '#7dd3fc' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgba(125,211,252,0.18)', outline: '1px solid rgba(125,211,252,0.4)'
  },
  '.cm-selectionMatch': { backgroundColor: 'rgba(251,191,36,0.16)' },
  '.cm-panels': { backgroundColor: '#11131a', color: '#e2e8f0', border: 'none' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid rgba(255,255,255,0.08)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(251,191,36,0.28)', outline: '1px solid rgba(251,191,36,0.5)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(14,165,233,0.4)' },
  '.cm-button': {
    backgroundColor: 'rgba(255,255,255,0.06)', backgroundImage: 'none',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0'
  },
  '.cm-textfield': {
    backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', color: '#e2e8f0'
  },
  '.cm-tooltip': {
    backgroundColor: '#11131a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', color: '#e2e8f0'
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgba(14,165,233,0.25)', color: '#fff' }
}, { dark: true });

/** A linguagem sai do nome do arquivo, que é o que o editor tem em mãos. */
function extensaoDaLinguagem(nomeDoArquivo: string) {
  const ext = (nomeDoArquivo || '').split('.').pop()?.toLowerCase() || '';
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return javascript({ jsx: ext === 'jsx' });
  if (['ts', 'tsx'].includes(ext)) return javascript({ typescript: true, jsx: ext === 'tsx' });
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) return html();
  if (['css', 'scss', 'less'].includes(ext)) return css();
  if (ext === 'py') return python();
  if (ext === 'json') return json();
  if (['md', 'markdown'].includes(ext)) return markdown();
  return [];
}

/**
 * Editor de um arquivo só.
 *
 * O componente é NÃO-CONTROLADO de propósito. Um editor de código controlado por React (recriar o
 * estado a cada tecla) perde a posição do cursor, o histórico de desfazer e a seleção a cada
 * caractere digitado — e em arquivo grande engasga visivelmente. Aqui o CodeMirror é dono do
 * próprio texto; `valor` só é empurrado para dentro quando muda POR FORA (troca de aba, arquivo
 * recarregado do disco), e a comparação com o conteúdo atual é o que impede o laço infinito.
 */
export const EditorDeCodigo = ({
  valor,
  nomeDoArquivo,
  somenteLeitura = false,
  onChange,
  onSalvar
}: {
  valor: string;
  nomeDoArquivo: string;
  somenteLeitura?: boolean;
  onChange: (texto: string) => void;
  onSalvar?: () => void;
}) => {
  const hospedeiroRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSalvarRef = useRef(onSalvar);
  const linguagemRef = useRef(new Compartment());
  const leituraRef = useRef(new Compartment());

  // Os callbacks entram por ref para não recriar o editor a cada render do pai — recriar
  // significaria perder cursor, histórico e rolagem no meio da digitação.
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSalvarRef.current = onSalvar; }, [onSalvar]);

  useEffect(() => {
    if (!hospedeiroRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: valor,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        foldGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        search({ top: false }),
        indentUnit.of('  '),
        syntaxHighlighting(TEMA_DE_CORES),
        TEMA,
        // Ctrl+S antes dos demais: sem isto o navegador abriria "salvar página".
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => { onSalvarRef.current?.(); return true; }
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          // Tab indenta em vez de pular para o próximo controle da página. Vem por último de
          // propósito: só age quando nenhum atalho acima reivindicou a tecla.
          indentWithTab
        ]),
        linguagemRef.current.of(extensaoDaLinguagem(nomeDoArquivo)),
        leituraRef.current.of([
          EditorState.readOnly.of(somenteLeitura),
          EditorView.editable.of(!somenteLeitura)
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        })
      ]
    });

    viewRef.current = new EditorView({ state, parent: hospedeiroRef.current });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // Monta uma vez só. Tudo que muda depois entra pelos efeitos abaixo, sem recriar o editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Texto vindo de fora (troca de aba, recarga do disco) — nunca o que o usuário acabou de digitar. */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const atual = view.state.doc.toString();
    if (atual === valor) return;
    view.dispatch({
      changes: { from: 0, to: atual.length, insert: valor },
      selection: { anchor: Math.min(view.state.selection.main.anchor, valor.length) }
    });
  }, [valor]);

  /** Trocar de arquivo troca a gramática sem derrubar o editor. */
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: linguagemRef.current.reconfigure(extensaoDaLinguagem(nomeDoArquivo))
    });
  }, [nomeDoArquivo]);

  /** Arquivo aberto pela metade vira somente leitura sem remontar nada. */
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: leituraRef.current.reconfigure([
        EditorState.readOnly.of(somenteLeitura),
        EditorView.editable.of(!somenteLeitura)
      ])
    });
  }, [somenteLeitura]);

  return <div ref={hospedeiroRef} className="flex-1 min-h-0 overflow-hidden" />;
};
