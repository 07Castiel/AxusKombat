# Verificação completa de segurança

## Situação atual (confirmada agora)
- Varredura do banco: nenhum achado aberto.
- Dependências: nenhum pacote vulnerável (última checagem em 12/09, desatualizada).
- Verificador automático: 19 avisos — 13 funções privilegiadas executáveis (1 sem login, 12 por usuários logados), 1 extensão no esquema público, 5 tabelas sem regras (bloqueadas, provavelmente intencionais: sessões/credenciais do portal).
- Há um achado crítico relatado na última publicação que precisa ser localizado.

## O que será feito
1. Rodar nova varredura completa (banco + dependências) e localizar o achado crítico.
2. Revisar cada uma das 13 funções privilegiadas: retirar acesso de quem não deve chamá-las; manter só as que o app usa com checagem de academia.
3. Confirmar que as 5 tabelas sem regras são só de uso interno do servidor e registrar como intencional.
4. Revisar o Portal do Aluno (login só por matrícula): limite de tentativas, sessões, e o risco de expor mensalidades — apresentar recomendação.
5. Revisar rotas públicas (webhook Stripe, hooks de cron, rastreamento de visitas) e o painel mestre: verificação de chamador e segredos obrigatórios.
6. Conferir isolamento entre academias (cada academia só vê seus dados) com os testes existentes.
7. Corrigir o que for encontrado e entregar um resumo com o que foi corrigido e o que ficou como risco aceito.

## Detalhes técnicos
- Correções via migration (REVOKE EXECUTE ... FROM anon/authenticated nas funções SECURITY DEFINER não usadas pelo cliente).
- Marcar achados corrigidos/ignorados com justificativa no painel de segurança.
