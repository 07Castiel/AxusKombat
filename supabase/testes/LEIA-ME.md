# Auditoria de `frequencia_aluno()`

Suíte que valida a migração `20260906120000_frequencia_aluno_com_guardas.sql`
contra um Postgres real, com **o schema de produção inteiro e as 52 policies de
RLS aplicadas** — não contra stubs. Os testes rodam como `authenticated` com
`request.jwt.claim.sub` setado, então o RLS é exercido de verdade.

96 asserções, cobrindo:

| Arquivo | O que cobre |
|---|---|
| `t2_math.sql`  | metas degeneradas (0, negativa, 1000, NULL), invariantes sobre toda a base em 4 janelas, limites de `p_dias`, casos nomeados, matrícula no futuro |
| `t3_chamada.sql` | a guarda de chamada não realizada: nenhum dia, só hoje, parou há 14 dias, metade ausente, sem grade ativa |
| `t45_tenant_perm.sql` | isolamento entre academias (com e sem `p_aluno_id`) e os 6 papéis reais |
| `t6_fuso.sql` | fuso válido/inválido/ausente, vazamento entre tenants, virada de data entre UTC+14 e UTC-11 |
| `t8_modulos.sql` | prova que a policy reescrita devolve **o mesmo conjunto de linhas** papel a papel, e que os outros módulos não regridem |
| `t9_integracao_ui.sql` | os caminhos de consulta das telas: uma chamada por ficha, uma pelo painel inteiro, isolamento entre academias pela rota `/aluno/$id`, e o financeiro sem acesso a presença |

O lado React é testado em `src/components/FrequenciaAluno.test.tsx` (renderização
real via `react-dom/server`) e `src/lib/frequencia.test.ts` (regras de
apresentação). Os dois rodam com `bun run test`.

## Diagnóstico de dados

`diagnostico_frequencia_semanal.sql` é **somente leitura** e responde se a meta
cadastrada nos planos é confiável: quantos estão nulos, zerados, fora de 1–7, se
o nome do plano contradiz a coluna, e se a frequência cadastrada bate com o que
os alunos daquele plano realmente treinam. Rode no SQL Editor do Supabase.

## Rodando

Precisa de um Postgres 16 local. `rebuild.sh` derruba e recria o banco,
aplica todas as migrações em ordem e semeia 4 academias de teste.

Duas adaptações são necessárias fora do Supabase, e nenhuma toca no que está
sob teste: `pg_cron`/`pg_net` não existem (as linhas de `CREATE EXTENSION` são
comentadas) e o schema `storage` é stubado. O bootstrap também aplica o
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO ... authenticated`
que todo projeto Supabase tem — sem ele nem o RLS comum funciona, porque as
policies chamam `get_current_tenant()` e o caller precisa de EXECUTE nela.

## Volume medido (Postgres 16, 16 semanas de histórico)

| Alunos | Presenças | Lista completa | Ficha de 1 aluno | JSON |
|---:|---:|---:|---:|---:|
| 250 | 12.000 | 292 ms | 12 ms | 108 KB |
| 500 | 24.000 | 2.187 ms | 16 ms | 217 KB |
| 1.000 | 48.000 | 2.307 ms | 20 ms | 434 KB |
| 5.000 | 240.000 | 3.643 ms | 36 ms | 2,1 MB |

A função devolve **uma linha** de `jsonb` em qualquer volume, então o teto de
1000 linhas do PostgREST nunca se aplica.
