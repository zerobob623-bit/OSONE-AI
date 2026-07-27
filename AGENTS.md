# SKELETON BRAIN — Estrutura Óssea de Planejamento IA

Este é o protocolo universal que deve ser seguido antes de qualquer geração de código ou resposta complexa no OSONE G5.

## FASE 00 — RECEPÇÃO DO SINAL `INPUT`
- Extrair palavras exatas sem suposições.
- Identificar idioma e tom (técnico, casual, urgente).
- Verificar contexto anterior e ambiguidades.

## FASE 01 — DIAGNÓSTICO DE INTENÇÃO `PARSE`
- Definir o objetivo final (o que o usuário fara com isso?).
- Separar pedido explícito de necessidade real.
- Identificar restrições (tecnologia, nível técnico).
- Perguntar se houver bloqueio, assumir e declarar se não houver.

## FASE 02 — ARQUITETURA DO PLANO `DESIGN`
- Definir escopo (dentro vs fora).
- Listar componentes (arquivos, funções, dependências).
- Estabelecer sequência lógica de construção.
- Avaliar alternativas (Simplicidade vs Performance vs Escalabilidade).

## FASE 03 — CHECKLIST PRÉ-EXECUÇÃO `VERIFY`
- Consigo resumir o objetivo em 1 frase?
- Tenho todos os dados/APIs necessários?
- Identificar 3 pontos de falha potenciais.
- Definir o critério de "Pronto".

## FASE 04 — EXECUÇÃO ESTRUTURADA `EXECUTE`
- Sinalizar o plano ao usuário.
- Construir seguindo a ordem sem pular etapas.
- Comentar o "porquê", não o "o quê".
- Revisar lógica e edge cases antes da entrega final.

## DIRETRIZES DE ARQUIVOS NO OSONE G5
- **ARQUIVO ÚNICO**: O OSONE não possui um sistema de pastas/arquivos real. Você deve escrever apenas UM arquivo bruto, inteiro e completo diretamente na aba de ESCRITA.
- **SEM GESTÃO DE PASTAS**: Não tente organizar subpastas. Foque em entregar o código ou texto completo em um único bloco no workspace de escrita.

## PROTOCOLO DE PRESERVAÇÃO DE FUNCIONALIDADES E VERIFICAÇÃO (`FEATURES.md`)
- **LEITURA OBRIGATÓRIA**: Antes de qualquer modificação de código, releia o arquivo `/FEATURES.md` na raiz do projeto para entender o mapa de recursos do sistema.
- **EDIÇÕES CIRÚRGICAS**: Edite apenas os trechos estritamente relevantes à instrução atual do usuário. É EXPRESSAMENTE PROIBIDO sobrescrever ou apagar recursos existentes listados no `FEATURES.md` (como Agente Local, Gemini Live, Handoff PC<->Celular, jogos, mapas, etc.), a menos que o usuário peça explicitamente "remova" ou "substitua".
- **AUTO-VERIFICAÇÃO PRÉ-ENTREGA**:
  1. Execute a verificação de compilação/tipagem (`lint_applet` / `compile_applet`) para garantir zero erros antes de entregar a resposta.
  2. Compare o código resultante com o `FEATURES.md` e confirme que todas as funções, rotas, componentes e módulos listados continuam presentes e funcionais. Se algo foi apagado sem pedido, restaure-o imediatamente antes de finalizar a resposta.
  3. Sempre atualize o `FEATURES.md` caso a nova alteração tenha introduzido um recurso novo no projeto.
