# Instruções para agentes

- Leia o `README.md` e `docs/ARCHITECTURE.md` antes de editar.
- Toda saída (guia de estudo, jogo, slides, PDF) sai de **uma única lição validada** (`schemas/lesson-1.0.schema.json`). Não duplique conteúdo entre formatos.
- Skills e documentação ficam em en-US; o material gerado segue o idioma do aluno.
- Confira os cálculos de forma independente e registre divergências com o gabarito em vez de forçar o resultado.
- Os modos de reinício após erro (`rules/presets/`) são requisito do produto: mantenha-os explícitos.
- Valide com `python -m unittest discover -s tests -v` e `python scripts/harness.py doctor`.
- Nunca faça commit de credenciais, configurações de agentes ou dados de terceiros.
