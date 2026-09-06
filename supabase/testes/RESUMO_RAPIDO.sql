select nome,
       frequencia_semanal,
       ativo,
       case
         when frequencia_semanal is null then 'CORRIGIR - nunca preenchido'
         when frequencia_semanal = 0     then 'CORRIGIR - zero, campo apagado na tela'
         when frequencia_semanal < 0     then 'CORRIGIR - valor negativo'
         when frequencia_semanal > 7     then 'CORRIGIR - acima de 7'
         when frequencia_semanal = 1     then 'CONFERIR - 1 e o valor inicial do formulario'
         else 'OK'
       end as situacao
from public.planos
order by 4, nome;
