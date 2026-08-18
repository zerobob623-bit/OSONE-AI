# Componentes de voz de terceiros

## Supertonic 3

- Código de exemplo/runtime: Copyright (c) 2026 Supertone Inc., licença MIT.
- Modelo e estilos de voz: Supertone Supertonic 3, licença OpenRAIL-M.
- Fonte do código: https://github.com/supertone-inc/supertonic
- Fonte do modelo: https://huggingface.co/Supertone/supertonic-3
- Revisão usada pelo OSONE: `3cadd1ee6394adea1bd021217a0e650ede09a323`.

O OSONE baixa o modelo no primeiro uso e guarda uma cópia da licença ao lado dos pesos. O uso
continua sujeito às restrições de uso responsável estabelecidas pela OpenRAIL-M.

## Piper

O Piper permanece como motor local de reserva. Seus binários, modelo e avisos são distribuídos
na pasta `vendor/piper` conforme as licenças dos projetos e vozes de origem.

# Editor de código (OSONE IDE)

## CodeMirror 6

- Licença MIT (Copyright (c) by Marijn Haverbeke e demais colaboradores).
- Fonte: https://github.com/codemirror/dev
- Pacotes usados: `codemirror`, `@codemirror/lang-javascript`, `@codemirror/lang-html`,
  `@codemirror/lang-css`, `@codemirror/lang-python`, `@codemirror/lang-json`,
  `@codemirror/lang-markdown` e as dependências que eles trazem (`@lezer/*`, `style-mod`,
  `w3c-keyname`), todas MIT.

A licença MIT permite uso comercial e redistribuição, o que cobre a distribuição do OSONE nos
planos pagos. É o editor da aba OSONE IDE, empacotado no chunk `vendor-editor` — ele só é baixado
por quem abre essa aba.
