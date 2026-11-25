# Gamified Learning Harness

> Conjunto de skills e um harness local que transformam material de curso e listas de exercícios em **guia de estudo resolvido → jogo passo a passo → aula em slides com prática**.

**Tipo:** Projeto pessoal de estudo · 2026 · status: protótipo funcional, em evolução

## Sobre

**Função.** A partir de uma lição descrita em JSON (ou de um briefing curto mais as fontes), o harness gera, offline e de forma determinística:

- um guia de estudo com soluções comentadas (HTML e PDF via LaTeX);
- um jogo de prática em que o aluno executa cada passo do procedimento e recebe feedback;
- uma aula em slides com atividades de revisão.

**Objetivo.** Estudar para provas com prática ativa em vez de releitura: recuperação da memória, prática espaçada e intercalada, exemplos resolvidos que vão sendo retirados aos poucos e reinício com números novos quando o aluno erra. O exemplo principal é a Prova 3 de Estatística (teste de hipóteses e intervalos de confiança).

## Funcionalidades

- **8 formatos de jogo**, cada um com skill, motor e corretor próprios:

  | Formato | Para quê |
  |---|---|
  | `fmt-step-ladder` | Procedimento ordenado, um passo por vez, com checagem numérica |
  | `fmt-sequence-order` | Ordenar etapas, linhas do tempo, código (estilo Parsons) |
  | `fmt-retrieval-cloze` | Lacunas: termo, símbolo ou número lembrado de memória |
  | `fmt-choice-feedback` | Escolha entre afirmações plausíveis, com feedback explicativo |
  | `fmt-match-classify` | Decidir qual regra ou método se aplica a cada caso |
  | `fmt-branching-case` | Caso com decisões e consequências (humanas, direito, gestão) |
  | `fmt-data-visual-lab` | Prever, mexer num controle e ler o gráfico |
  | `fmt-review-mix` | Revisão espaçada e intercalada com plano até a data da prova |

- **Presets de regra** (`rules/presets/`): equilibrado, treino de prova, quiz e "recomeçar do início ao errar".
- **Variantes procedurais**: o mesmo exercício com números novos, respeitando unidades, arredondamento e restrições.
- **Aceita números no formato pt-BR** (`1,96`) e tolerância numérica configurável.
- **Esquema versionado** da lição (`schemas/lesson-1.0.schema.json`), com migração das versões antigas.
- **Saída 100% offline**: os HTML gerados abrem direto no navegador, sem servidor.

## Tecnologias

- Node.js 24.15+ (motor, player e build) · KaTeX (equações)
- Python 3.10+ (CLI `harness.py`, validação com `jsonschema`, testes)
- LaTeX/pdfLaTeX (PDF de estudo; `environment/Dockerfile.tex`)
- Playwright + axe-core (testes de navegador e acessibilidade)
- [REA](https://www.npmjs.com/package/rea-agents) (análise estática de JavaScript, opcional)

## Estrutura do projeto

| Caminho | Descrição |
|---|---|
| `skills/` | Skills (`SKILL.md`) para agentes: 8 formatos, STEM, humanas e soluções resolvidas em PDF |
| `harness/core/` | Registro de formatos, PRNG com semente, eventos |
| `harness/formats/` | Motor e corretor de cada formato |
| `harness/player/` | Player do jogo no navegador |
| `harness/procedure-engine.js` | Motor de procedimentos passo a passo e variantes |
| `harness/slides.js`, `study-guide.js`, `latex.js` | Geradores de slides, guia e LaTeX |
| `harness/brief/` | Briefing curto → rascunho de lição |
| `schemas/` | Esquema JSON da lição (0.x e 1.0) |
| `lessons/` | Lições prontas: Prova 3 de Estatística, decisões em humanas, teste Z |
| `examples/` | Lições de exemplo e briefings |
| `rules/` | Catálogo e presets de regras de jogo |
| `templates/` | HTML/CSS das saídas e fontes |
| `scripts/` | CLI (`harness.py`), builds e checagens de mutação |
| `tests/` | Testes de contrato, motor e navegador |
| `docs/` | Arquitetura, esquema, formatos, autoria, ambiente e validação |
| `environment/` | Dependências Python travadas, Dockerfile do LaTeX, exemplo de MCP |

## Como rodar

### Pré-requisitos

- Node.js 24.15+ e npm
- Python 3.10+
- Para o PDF: TeX Live (pdfLaTeX) e `poppler-utils`
- Para os testes de navegador: Chromium (instalado pelo Playwright ou do sistema)

### Passo a passo

```bash
git clone https://github.com/itskelme/gamified-learning-harness.git
cd gamified-learning-harness

npm ci
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r environment/requirements.lock.txt
python scripts/harness.py doctor   # verifica o ambiente
```

### Gerar uma lição

```bash
node scripts/build-lesson.mjs lessons/prova3-statistics.lesson.json
node scripts/build-lesson.mjs lessons/teste-z-uma-media.lesson.json
node scripts/build-lesson.mjs --brief examples/briefs/vies-de-sobrevivencia.brief.json
```

As saídas ficam em `build/lessons/<id>/`. Abra os `.html` direto no navegador.

### Testes

```bash
python -m unittest discover -s tests -v
npm run test:contract
npm run pilot:test        # precisa do Chromium
```

Para usar um Chrome já instalado: `export CHROMIUM_EXECUTABLE=/caminho/do/chrome`.

## Como escrever uma lição

Veja [`docs/AUTHORING.md`](docs/AUTHORING.md) e o esquema em [`docs/SCHEMA.md`](docs/SCHEMA.md). Em resumo: fontes, afirmações verificáveis, unidades (cada uma com um formato de jogo) e, para procedimentos, variáveis com faixas e passos calculados a partir delas.

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md) · [Formatos](docs/FORMATS.md) · [Esquema](docs/SCHEMA.md) · [Autoria](docs/AUTHORING.md)
- [Ambiente](docs/ENVIRONMENT.md) · [Validação](docs/VALIDATION.md) · [Produto](docs/PRODUCT.md) · [REA](docs/REA.md)

Alguns documentos ainda citam pastas de pesquisa e históricos de trabalho que não fazem parte desta versão pública.

## Referências

- Dunlosky et al. (2013). *Improving Students' Learning With Effective Learning Techniques*. Psychological Science in the Public Interest.
- Roediger & Karpicke (2006). *Test-Enhanced Learning*. Psychological Science.
- Sweller, Ayres & Kalyuga (2011). *Cognitive Load Theory* (efeito do exemplo resolvido e fading).
- Rohrer & Taylor (2007). *The shuffling of mathematics problems improves learning* (prática intercalada).
- Parsons & Haden (2006). *Parson's programming puzzles*.

## Autores

- Diego Kelme Santos da Silva — [@itskelme](https://github.com/itskelme)

## Licença

Este projeto está sob a licença [CC BY-NC 4.0](LICENSE): uso pessoal e modificação permitidos com atribuição; uso comercial proibido.
