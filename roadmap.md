# Roadmap

- [x] Simplificar credenciais para acesso apenas por matrícula
- [x] Gerar matrículas para todos os 60 alunos cadastrados
- [x] Adicionar geração em massa e exportação XLSX na lista de alunos
- [x] Exibir matrícula e estado de acesso na lista
- [x] Remover fluxo público por token e referências antigas
- [x] Aplicar a migration 0002: `portal_token` e `portal_aluno_dados` fora do banco
- [x] Conferir no banco: 60 matrículas, todas distintas, nenhuma cruzando academia
- [x] Encurtar a matrícula para 6 dígitos, com data de nascimento como 2º fator
- [x] Enfileirar o recado com a matrícula por WhatsApp, pelo worker antibanimento
- [ ] Aplicar a migration 0003 e preencher a data de nascimento de quem falta
- [ ] Validar na tela: entrar, sair, bloquear acesso, planilha baixada e celular
