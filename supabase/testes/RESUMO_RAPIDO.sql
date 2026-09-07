select nome,
       frequencia_semanal,
       ativo,
       case
         when frequencia_semanal is null then 'CORRIGIR - nunca preenchido'
         when frequencia_semanal = 0     then 'CORRIGIR - zero, campo apagado na tela'
         when frequencia_semanal < 0     then 'CORRIGIR - valor negativo'
         when frequencia_semanal > 7     then 'CORRIGIR - acima de 7'
         when (regexp_match(nome, '(\d+)\s*(?:x|vezes?)[\s/]*(?:por[\s/]+)?semana', 'i'))[1]::int = frequencia_semanal
           then 'OK - o nome do plano confirma a frequencia'
         when (regexp_match(nome, '(\d+)\s*(?:x|vezes?)[\s/]*(?:por[\s/]+)?semana', 'i'))[1] is not null
           then 'CORRIGIR - o nome do plano diz outro numero'
         else 'CONFERIR - o nome nao diz a frequencia, confira se o numero e o vendido'
       end as situacao
from public.planos
order by 4, nome;
