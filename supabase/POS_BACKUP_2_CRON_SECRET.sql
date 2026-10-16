-- ============================================================================
-- POS-BACKUP 2 — TROCAR O CRON_SECRET E TIRA-LO DE DENTRO DOS JOBS
--
-- POR QUE: os dois jobs do pg_cron (mensalidades-daily e
-- dispatch-notifications-15min) guardam o CRON_SECRET em texto puro no comando,
-- e cada execucao copia o comando para cron.job_run_details. Por isso o segredo
-- aparece no backup umas 1.600 vezes. Quem tem o arquivo dispara os hooks.
--
-- O QUE MUDA: o segredo novo e gerado aqui dentro e vai para o Vault, que o
-- guarda cifrado com uma chave que fica fora do banco. Os jobs passam a le-lo
-- do Vault na hora de chamar o hook. Backups futuros levam so o texto
-- "(SELECT decrypted_secret FROM vault.decrypted_secrets ...)", nunca o valor.
--
-- O segredo novo nao passa por nenhum lugar alem do seu editor SQL e dos
-- secrets do Lovable.
--
-- ATENCAO A ORDEM: entre o PASSO 3 e o PASSO 4 os hooks respondem 401. O
-- dispatch roda a cada 15 minutos e o daily as 05:00 UTC; uma janela de poucos
-- minutos so atrasa a fila, nao perde mensagem.
--
-- Cada PASSO e um comando so. Cole um de cada vez no editor SQL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 1 — VER os jobs. Esperado: 2 linhas, segredo_no_comando = true.
-- ----------------------------------------------------------------------------
SELECT jobid, jobname, schedule, active, command ~ '''x-cron-secret''\s*,\s*''[^'']+''' AS segredo_no_comando FROM cron.job ORDER BY jobid;


-- ----------------------------------------------------------------------------
-- PASSO 2 — GERAR o segredo novo dentro do Vault (64 caracteres hexadecimais).
-- Se der "duplicate key", ja existe um 'cron_secret' no Vault: pule para o
-- PASSO 3 e use o que esta la.
-- ----------------------------------------------------------------------------
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'x-cron-secret dos jobs do pg_cron');


-- ----------------------------------------------------------------------------
-- PASSO 3 — COPIAR o valor e gravar no Lovable.
--
-- Copie o resultado e cole em Cloud > Secrets, no secret CRON_SECRET
-- (substitua o valor antigo). Se o Lovable pedir, publique de novo para o
-- servidor pegar o valor novo. Nao cole esse valor em chat, issue ou commit.
-- ----------------------------------------------------------------------------
SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';


-- ----------------------------------------------------------------------------
-- PASSO 4 — TROCAR o segredo literal dos jobs pela leitura do Vault.
-- Mexe so no trecho 'x-cron-secret','<valor>' de cada comando; URL, horario e
-- o resto do comando ficam iguais.
-- ----------------------------------------------------------------------------
SELECT jobid, cron.alter_job(jobid, command := regexp_replace(command, '''x-cron-secret''\s*,\s*''[^'']*''', '''x-cron-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cron_secret'')')) FROM cron.job WHERE command ~ '''x-cron-secret''\s*,\s*''[^'']*''';

-- Se der "function cron.alter_job does not exist" (pg_cron antigo), rode esta
-- versao no lugar, que faz a mesma troca direto na tabela:
-- UPDATE cron.job SET command = regexp_replace(command, '''x-cron-secret''\s*,\s*''[^'']*''', '''x-cron-secret'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cron_secret'')') WHERE command ~ '''x-cron-secret''\s*,\s*''[^'']*''';


-- ----------------------------------------------------------------------------
-- PASSO 5 — CONFERIR. Esperado: 2 linhas, le_do_vault = true e
-- segredo_no_comando = false.
-- ----------------------------------------------------------------------------
SELECT jobid, jobname, command ~ 'vault\.decrypted_secrets' AS le_do_vault, command ~ '''x-cron-secret''\s*,\s*''[^'']+''' AS segredo_no_comando FROM cron.job ORDER BY jobid;


-- ----------------------------------------------------------------------------
-- PASSO 6 — CONFERIR que o hook aceitou. Rode uns 15 minutos depois do
-- PASSO 4. Esperado: status_code 200 nas linhas mais novas. 401 quer dizer que
-- o CRON_SECRET do Lovable ainda nao e o do Vault (refaca o PASSO 3).
-- ----------------------------------------------------------------------------
SELECT id, status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;


-- ----------------------------------------------------------------------------
-- PASSO 7 (opcional) — APAGAR o historico que ainda tem o segredo antigo.
-- Depois do PASSO 4 o segredo antigo nao vale mais nada; isto so o tira dos
-- proximos backups. Apaga as execucoes antigas desses jobs, nao os jobs.
-- ----------------------------------------------------------------------------
DELETE FROM cron.job_run_details WHERE command ~ '''x-cron-secret''\s*,\s*''[^'']+''';
