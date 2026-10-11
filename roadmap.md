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
- [x] Aplicar a migration 0003 (o efeito já estava no banco em 11/10; o registro no drizzle é o `supabase/POS_BACKUP_3_DRIZZLE.sql`)
- [ ] Preencher a data de nascimento dos 2 alunos que faltam (consulta 1 do `supabase/POS_BACKUP_5_CONFERIR.sql`)
- [ ] Validar na tela: entrar, sair, bloquear acesso, planilha baixada e celular
