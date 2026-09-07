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

`frequencia_semanal` é a meta que `frequencia_aluno()` usa como denominador. Se
ela estiver errada no banco, a matemática correta produz números errados. O
diagnóstico é **somente leitura** e vive como função, criada em
`supabase/migrations/20260906180000_diagnostico_frequencia_semanal.sql`:

```sql
select * from diagnostico_frequencia_semanal();
```

**Por que função e não script.** O relatório já existiu como um `.sql` para
colar no editor, e não funcionava. O editor SQL da Lovable quebra scripts longos
em pedaços e envia cada um separado: com a consulta em CTEs ele mandou um
fragmento começando em `FROM public.contratos c`, e o Postgres respondeu
`syntax error at or near "FROM" LINE 1`. Antes disso, numa versão em sete
`SELECT`s, ele exibia o resultado de um só e escondia os outros seis. Nenhuma
reescrita de sintaxe resolve — o problema não é a SQL. Com uma linha só, não há
o que quebrar.

Nove seções, cada uma começando por um resumo calculado por agregado — agregado
sem `GROUP BY` devolve uma linha mesmo sobre zero linhas de entrada, então
nenhuma seção some. A coluna `situacao` classifica em OK, CONFERIR ou CORRIGIR,
e as que pedem ação vêm primeiro dentro da seção.

A função **não é** `SECURITY DEFINER`: no editor SQL (postgres/service_role) o
RLS não se aplica e o relatório cobre todas as academias do banco; chamada por
um usuário autenticado, recorta para a academia dele. A coluna `detalhe` do
veredito informa quantas academias entraram na conta.

### Resumo rápido

Se quiser só a resposta essencial sem depender da migração estar aplicada,
`RESUMO_RAPIDO.sql` é um `SELECT` de treze linhas que lista cada plano e sua
situação. Curto o bastante para nenhum editor conseguir quebrar.

### Travar a coluna, depois de corrigir tudo

Só quando a seção 4 vier "Nenhum plano invalido":

```sql
ALTER TABLE public.planos
  ADD CONSTRAINT planos_frequencia_semanal_valida
  CHECK (frequencia_semanal IS NULL OR frequencia_semanal BETWEEN 1 AND 7);
```

Com a seção 4 ainda listando planos, esse CHECK passaria a barrar **qualquer**
edição dos planos legados — inclusive mudar só o preço.

## Volume medido (Postgres 16, 16 semanas de histórico)

| Alunos | Presenças | Lista completa | Ficha de 1 aluno | JSON |
|---:|---:|---:|---:|---:|
| 250 | 12.000 | 292 ms | 12 ms | 108 KB |
| 500 | 24.000 | 2.187 ms | 16 ms | 217 KB |
| 1.000 | 48.000 | 2.307 ms | 20 ms | 434 KB |
| 5.000 | 240.000 | 3.643 ms | 36 ms | 2,1 MB |

A função devolve **uma linha** de `jsonb` em qualquer volume, então o teto de
1000 linhas do PostgREST nunca se aplica.
