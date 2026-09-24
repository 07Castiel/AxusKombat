# -*- coding: utf-8 -*-
"""
Dados da auditoria de segurança do Axus Kombat.

Fonte única de verdade: o gerador do PDF (gerar_relatorio.py) e a seção de
issues do GitHub leem tudo daqui. Editar um achado num lugar só.

Cada achado é um dicionário com:
  id, categoria, titulo, severidade, arquivo, linhas, trecho, por_que,
  impacto, correcao, criterios (checklist), explorabilidade.

Severidades: "critica" | "alta" | "media" | "baixa" | "informativa"
"""

PROJETO = "Axus Kombat"
DATA = "24/09/2026"

STACK = {
    "linguagem": "TypeScript",
    "framework": "TanStack Start (React 19) sobre Cloudflare Workers (Nitro)",
    "orm": "acesso via supabase-js; migrações em SQL puro e Drizzle Kit",
    "banco": "Supabase / PostgreSQL com Row Level Security (RLS)",
    "auth": "Supabase Auth (JWT) no cliente; middleware Bearer nas server functions; "
            "token HMAC próprio no painel mestre",
    "frontend": "React + shadcn/ui (Radix) + Recharts + Tailwind",
    "pagamentos": "Stripe (checkout + webhook)",
    "mensageria": "Evolution API (WhatsApp), disparada por worker chamado via pg_cron",
    "deploy": "Cloudflare Workers (wrangler.jsonc), CI no GitHub Actions",
}

# Nota metodológica: como cada categoria do pedido foi mapeada para a stack.
METODOLOGIA = [
    ("1. Banco sem tranca (isolamento de inquilino)",
     "O isolamento é RLS no Postgres, com a coluna tenant_id e a função "
     "get_current_tenant() (lê profiles.tenant_id de auth.uid()). Auditei as 49 "
     "policies e as server functions que usam a service_role (que ignora RLS), "
     "procurando onde o filtro por tenant está ausente ou pode ser furado."),
    ("2. Permissão definida no navegador",
     "Cruzei cada gate de papel do frontend (isAdmin, RequireTela, permissoes) "
     "com o caminho de escrita real: server function (guardas requireAdmin/"
     "requirePermissao) OU escrita direta no Supabase pelo navegador (protegida "
     "só por RLS). O foco foi onde a UI esconde algo que o servidor/RLS libera."),
    ("3. IDOR",
     "Percorri os 63 handlers de server function e as policies de UPDATE/DELETE/"
     "INSERT procurando objeto buscado por id sem verificação de posse — inclusive "
     "chaves estrangeiras (aluno_id, contrato_id) que atravessam o tenant."),
    ("4. Chaves expostas",
     "Varri a árvore, o bundle compilado do navegador e TODO o histórico git (400 "
     "commits) por chaves, tokens e segredos. Atenção especial a defaults públicos "
     "que viram segredo real se não sobrescritos, e à falta de validação de startup."),
    ("5. Inputs sem tratamento (XSS)",
     "Frontend é React (escapa por padrão). Procurei dangerouslySetInnerHTML, "
     "eval, href/src controlados por usuário e sinks de exportação (CSV/XLSX). "
     "No backend, procurei entrada de usuário entrando em HTML de e-mail/template."),
]

# ---------------------------------------------------------------------------
# ACHADOS  (ordenados: mais grave primeiro)
# ---------------------------------------------------------------------------
ACHADOS = [
    {
        "id": 1,
        "categoria": "1. Isolamento de inquilino",
        "titulo": "Tomada de conta de outra academia via perfil autoinserido "
                  "(flag pública skip_tenant + policy profiles_insert_self sem trava de tenant)",
        "severidade": "critica",
        "arquivo": "supabase/migrations/20260516170932_...sql:376  •  "
                   "supabase/HARDENING_7_APLICAR.sql:373  •  src/routes/precos.tsx:467",
        "linhas": "profiles_insert_self (WITH CHECK id = auth.uid()); handle_new_user "
                  "IF skip_tenant THEN RETURN NEW; signUp(options.data)",
        "trecho":
            'CREATE POLICY "profiles_insert_self" ON public.profiles\n'
            '  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());\n'
            '-- handle_new_user():\n'
            "  IF COALESCE((NEW.raw_user_meta_data->>'skip_tenant')::boolean,false) THEN\n"
            "    RETURN NEW;  -- não cria tenant/profile: a PK fica livre\n"
            '-- precos.tsx (chamável direto com a chave anon):\n'
            "  supabase.auth.signUp({ options:{ data:{ skip_tenant:true } }})",
        "por_que":
            "O comentário do hardening deixa profiles_insert_self como está, "
            "raciocinando que 'o trigger já cria a linha no cadastro, então um "
            "INSERT do cliente sempre colide com a PK'. Isso deixa de valer quando o "
            "metadata traz skip_tenant:true — aí o trigger retorna sem criar nada e a "
            "chave primária de profiles (o id do próprio usuário) fica livre. Como a "
            "policy de INSERT só exige id = auth.uid() e NÃO amarra tenant_id, o "
            "atacante insere o próprio perfil apontando para o tenant_id de qualquer "
            "vítima. A partir daí get_current_tenant() devolve o tenant da vítima e "
            "todas as leituras escopadas só por tenant vazam.",
        "impacto":
            "PoC reproduzida em Postgres 16 local com o schema real: o atacante passa "
            "a ler a linha tenants da vítima (CNPJ/CPF, chave PIX, e-mail e telefone do "
            "responsável, status) e a gravar arquivos na pasta de fotos da vítima. Pior: "
            "as server functions que usam requirePermissao (módulo ausente = liberado, "
            "pois perfis nascem com permissions {}) rodam com a service_role escopada ao "
            "tenant da vítima — listStudentPortalAccess, issueAllStudentPortalAccess, "
            "frequenciaAluno, upsertContratoAtivo, upsertDespesa e togglePresenca passam a "
            "ler e escrever os dados da vítima. A trava de papel (has_role, corrigida em "
            "C3) impede só as funções requireAdmin; o resto cai. É takeover multi-inquilino.",
        "correcao":
            "1) Endurecer a policy de INSERT para exigir que o perfil nasça no próprio "
            "tenant e nunca num alheio — o caminho legítimo (trigger) roda como "
            "service_role e não é afetado. Ex.: WITH CHECK (id = auth.uid() AND "
            "tenant_id = public.get_current_tenant()) só resolve quando já existe perfil; "
            "como aqui não existe, o correto é bloquear o INSERT de profiles vindo de "
            "'authenticated' por completo (só a service_role/trigger cria perfil) — "
            "DROP POLICY profiles_insert_self.  2) No trigger, ignorar skip_tenant vindo "
            "do metadata do usuário final: honrar o convite de equipe por um canal que o "
            "usuário não controla (createStaff já usa service_role), não por um campo do "
            "signUp público.  3) Defesa em profundidade: um UNIQUE/gatilho que impeça um "
            "profile cujo tenant não bata com nenhum papel do usuário.",
        "criterios": [
            "Um usuário autenticado NÃO consegue inserir/alterar profiles.tenant_id "
            "para um tenant onde não tem papel (teste automatizado em supabase/testes).",
            "signUp com {skip_tenant:true} no metadata não cria conta utilizável nem "
            "deixa a PK de profiles livre para inserção manual.",
            "get_current_tenant() de uma conta recém-criada por skip_tenant não resolve "
            "o tenant de outra academia.",
            "Teste de regressão cobrindo o cenário do PoC entra na suíte t45_tenant_perm.",
        ],
        "explorabilidade":
            "Alta. Basta a chave anon (pública, no bundle) e uma chamada signUp na API "
            "do Supabase. Não exige engenharia social nem privilégio prévio. Condição: a "
            "academia-alvo estar 'liberada' (o gatilho de assinatura barra INSERT em "
            "tenant vencido) e o atacante conhecer o tenant_id da vítima (que costuma "
            "aparecer em nomes de pasta de foto, e a própria falha ajuda a enumerar).",
    },
    {
        "id": 2,
        "categoria": "2. Permissão no navegador",
        "titulo": "Admin escreve o próprio status de assinatura e reativa academia "
                  "suspensa direto do navegador (tenants_update_admin sem trava de coluna)",
        "severidade": "alta",
        "arquivo": "supabase/migrations/20260516170932_...sql:370",
        "linhas": "CREATE POLICY tenants_update_admin ... FOR UPDATE (sem WITH CHECK)",
        "trecho":
            'CREATE POLICY "tenants_update_admin" ON public.tenants\n'
            "  FOR UPDATE TO authenticated\n"
            "  USING (id = public.get_current_tenant() AND public.is_admin());\n"
            "-- sem WITH CHECK e sem restrição de coluna: status/plan/ativo ficam abertos",
        "por_que":
            "A cobrança é decidida no servidor (webhook do Stripe grava tenants.status/"
            "plan) e a suspensão pelo painel mestre grava tenants.ativo. Mas a policy de "
            "UPDATE libera QUALQUER coluna da própria linha para o admin do tenant. O "
            "cliente escreve tenants direto pelo Supabase (padrão do projeto).",
        "impacto":
            "PoC: um admin executa update tenants set status='active', plan='elite', "
            "ativo=true, trial_ends_at=null where id=<meu tenant> e passa a ter acesso "
            "pago sem pagar — tenant_liberado() retorna true. O mesmo UPDATE com "
            "ativo=true desfaz uma suspensão aplicada pelo admin mestre (moderação da "
            "plataforma anulada pelo próprio cliente). Também permite forjar "
            "stripe_customer_id/subscription_id, o que confunde o webhook.",
        "correcao":
            "Tirar as colunas sensíveis do alcance do cliente. Opção A: restringir a "
            "policy a um subconjunto de colunas seguras via coluna-nível (GRANT UPDATE "
            "(nome, telefone, endereco, logo_url, pix_*, ...) e revogar UPDATE das demais) "
            "— RLS não filtra coluna, então a trava de coluna vem do GRANT. Opção B "
            "(recomendada): não deixar o cliente escrever tenants; toda alteração de "
            "cadastro passa por updateTenantConfig (server function, já existe) e as "
            "colunas de billing/ativo só são escritas por service_role (webhook/master).",
        "criterios": [
            "Admin autenticado NÃO consegue alterar status, plan, plan_period, "
            "is_trial, trial_ends_at, ativo, stripe_customer_id, stripe_subscription_id.",
            "Alterar nome/telefone/endereço/pix continua funcionando pela tela.",
            "Teste: UPDATE do cliente nas colunas de billing/ativo é recusado pelo banco.",
        ],
        "explorabilidade":
            "Alta para quem é admin da própria academia (todo dono é admin). Exige só o "
            "console do navegador. Burla o paywall e a moderação da plataforma.",
    },
    {
        "id": 3,
        "categoria": "2. Permissão no navegador",
        "titulo": "Funcionário reescreve as próprias permissões e anula as restrições "
                  "do admin (profiles_update_self_or_admin cobre a coluna permissions)",
        "severidade": "alta",
        "arquivo": "supabase/migrations/20260901000000_hardening_multitenant.sql:52  •  "
                   "src/lib/permissoes.ts:13",
        "linhas": "profiles_update_self_or_admin (WITH CHECK permite id = auth.uid())",
        "trecho":
            "CREATE POLICY profiles_update_self_or_admin ON public.profiles\n"
            "  FOR UPDATE ... USING (id = auth.uid() OR (... is_admin()))\n"
            "  WITH CHECK (tenant_id = get_current_tenant() AND (id=auth.uid() OR is_admin()));\n"
            "-- nada protege a coluna permissions: o próprio usuário a reescreve",
        "por_que":
            "A camada A7 de permissões por módulo é gravada em profiles.permissions e o "
            "invariante declarado é 'permissão só RESTRINGE'. Mas a policy de UPDATE do "
            "perfil deixa o próprio usuário escrever qualquer coluna da própria linha, "
            "inclusive permissions. Um recepcionista/financeiro/professor a quem o admin "
            "tirou 'editar pagamentos' faz update profiles set permissions='{}' e recupera "
            "tudo — via console do navegador, sem passar por server function.",
        "impacto":
            "PoC: recepção com permissions {alunos:{ver:false},pagamentos:{ver:false}} "
            "executa update profiles set permissions='{}' where id=auth.uid() e volta a "
            "ler alunos e a operar pagamentos. As restrições granulares (recurso vendido "
            "no plano Elite) viram decorativas — pior que não existir, dão falsa sensação "
            "de controle ao admin. Não vaza outro tenant (o papel segue escopado), mas "
            "escala privilégio dentro da academia.",
        "correcao":
            "Impedir que o usuário altere a própria coluna permissions (e papéis). Como "
            "RLS não filtra coluna: revogar UPDATE(permissions) de authenticated e deixar "
            "a escrita só por createStaff/updateStaff (service_role, já exigem requireAdmin). "
            "Alternativa: gatilho BEFORE UPDATE que rejeite mudança de permissions quando "
            "auth.uid() = NEW.id e não is_admin().",
        "criterios": [
            "Usuário não-admin NÃO consegue alterar a própria coluna permissions "
            "nem inserir/alterar user_roles.",
            "Admin continua ajustando permissões da equipe pela tela Equipe.",
            "Teste automatizado do auto-UPDATE de permissions recusado pelo banco.",
        ],
        "explorabilidade":
            "Alta para qualquer funcionário com login. Só o console do navegador.",
    },
    {
        "id": 4,
        "categoria": "4. Chaves / defaults inseguros",
        "titulo": "Endpoints de cron aceitam a chave anon pública como segredo quando "
                  "CRON_SECRET não está configurada, sem validação de startup",
        "severidade": "alta",
        "arquivo": "src/lib/cron-auth.ts:47  •  src/lib/cron-auth.ts:70",
        "linhas": "authorizeCronRequest (fallback legado) e internalCronSecret()",
        "trecho":
            "if (cronSecret) { ...compara CRON_SECRET... }\n"
            "// Modo legado — ainda vulnerável:\n"
            "const legacy = process.env.SUPABASE_PUBLISHABLE_KEY;\n"
            "if (!legacy || !secretsMatch(received, legacy)) return unauthorized();\n"
            "return { ok: true };  // aceita a chave anon, que é pública",
        "por_que":
            "Quando CRON_SECRET não está definida, os hooks públicos "
            "(/api/public/hooks/dispatch-notifications e notify-mensalidades) voltam a "
            "aceitar o header com SUPABASE_PUBLISHABLE_KEY — o mesmo JWT role=anon que o "
            "Vite injeta no bundle e qualquer visitante lê no DevTools. O código só "
            "'grita no log'; não há validação de startup que recuse subir nesse estado.",
        "impacto":
            "Se CRON_SECRET não estiver setada em produção, qualquer pessoa dispara o "
            "worker de WhatsApp em laço para TODAS as academias (o próprio comentário do "
            "código admite isso), processa/gera mensalidades e queima a reputação dos "
            "números de WhatsApp — negação de serviço e custo direto. É o padrão "
            "${VAR:-default-público} que vira segredo real por omissão.",
        "correcao":
            "1) Exigir CRON_SECRET na inicialização: se ausente, recusar as rotas de hook "
            "(retornar 503) em vez de cair no fallback anon. 2) Remover o fallback para "
            "SUPABASE_PUBLISHABLE_KEY. 3) Documentar CRON_SECRET como obrigatória no "
            "deploy e conferir em notification_worker_runs.",
        "criterios": [
            "Sem CRON_SECRET, os hooks respondem 503/401 — nunca aceitam a chave anon.",
            "Com CRON_SECRET setada, chamada sem o header correto é 401.",
            "Startup (ou o primeiro hit) valida a presença de CRON_SECRET e registra.",
        ],
        "explorabilidade":
            "Alta SE CRON_SECRET não estiver configurada (condição de deploy). A chave "
            "anon necessária é pública. O .env.example marca CRON_SECRET como 'troque-por-"
            "um-valor...', o que sugere que ambientes podem subir sem defini-la.",
    },
    {
        "id": 5,
        "categoria": "3. IDOR",
        "titulo": "Contrato aceita aluno_id de outra academia (chave estrangeira "
                  "cruzando tenant não é verificada em contratos_insert nem no handler)",
        "severidade": "media",
        "arquivo": "supabase/migrations/20260701033153_...sql:268  •  "
                   "src/lib/contratos.functions.ts:84",
        "linhas": "contratos_insert WITH CHECK (só confere tenant_id do contrato, "
                  "não do aluno); upsertContratoAtivo insere aluno_id sem checar posse",
        "trecho":
            "CREATE POLICY contratos_insert ... WITH CHECK (\n"
            "  tenant_id = get_current_tenant() AND (is_admin() OR is_recepcao() ...));\n"
            "-- aluno_id não é conferido contra o tenant do chamador\n"
            "// contratos.functions.ts insere { tenant_id: tenantId, aluno_id: data.aluno_id }",
        "por_que":
            "A policy garante que o contrato nasce no tenant de quem chama, mas não exige "
            "que o aluno_id referenciado também seja daquele tenant. upsertContratoAtivo "
            "insere o aluno_id da entrada sem um select de posse. Mesmo padrão em "
            "historico_graduacoes e no antigo matriculas.",
        "impacto":
            "PoC: admin da Academia A cria contrato no próprio tenant apontando para um "
            "aluno da Academia B; gerar_mensalidades_contrato (service_role) gera as "
            "mensalidades e o worker, cujo join notificacoes→alunos!inner roda como "
            "service_role, lê nome e telefone do aluno da vítima e enviaria WhatsApp em "
            "nome da academia errada. Isoladamente exige conhecer o UUID do aluno-alvo "
            "(v4 aleatório); combinado com o achado nº 1, que entrega esses UUIDs, vira alto.",
        "correcao":
            "No upsertContratoAtivo (e em quem grava aluno_id/historico), validar que o "
            "aluno pertence ao tenant antes de inserir (select id from alunos where "
            "id=aluno_id and tenant_id=tenantId). Reforçar no banco com CHECK/gatilho que "
            "exija alunos.tenant_id = contratos.tenant_id.",
        "criterios": [
            "Criar contrato/histórico com aluno_id de outro tenant é recusado (server e banco).",
            "Fluxo normal (aluno do próprio tenant) segue funcionando.",
            "Teste de regressão do cenário cross-tenant na suíte.",
        ],
        "explorabilidade":
            "Média isolada (precisa do UUID do aluno da vítima). Alta em conjunto com o nº 1.",
    },
    {
        "id": 6,
        "categoria": "5. Inputs sem tratamento",
        "titulo": "Injeção de fórmula (CSV) na exportação de logs de acesso, com campos "
                  "controlados por visitante anônimo, aberta pelo admin mestre",
        "severidade": "media",
        "arquivo": "src/routes/admin-master.acessos.tsx:47  •  "
                   "src/lib/acessos.functions.ts:133  •  src/routes/api/public/track-visit.ts:153",
        "linhas": "toCsv() escapa aspas/vírgula mas não neutraliza = + - @ iniciais",
        "trecho":
            "const escape = (v) => { const s = String(v).replace(/\"/g,'\"\"');\n"
            "  return /[\",\\n;]/.test(s) ? `\"${s}\"` : s; };  // não trata = + - @\n"
            "// current_page, referrer, user_agent vêm de track-visit (visitante anônimo)",
        "por_que":
            "visitor_logs guarda current_page, referrer, user_agent e browser vindos do "
            "endpoint público track-visit, ou seja, controlados por qualquer visitante. A "
            "exportação toCsv() só cuida de aspas/; e não prefixa as células que começam "
            "com = + - @. Ao abrir o CSV no Excel/Sheets, o admin mestre executa a fórmula.",
        "impacto":
            "Um visitante anônimo grava um referrer como =HYPERLINK(...) ou fórmula de "
            "exfiltração/comando; quando o admin da plataforma exporta e abre a planilha, "
            "a fórmula roda na máquina dele (injeção de fórmula / possível execução via "
            "recursos do Excel). O mesmo padrão, com risco menor, na exportação XLSX de "
            "alunos (nomes internos).",
        "correcao":
            "Prefixar com apóstrofo (') toda célula que comece com = + - @ | tab, ou "
            "encapsular como texto, tanto no toCsv de acessos quanto no CSV de relatórios "
            "e no XLSX de alunos. Idealmente uma função de sanitização compartilhada.",
        "criterios": [
            "Célula iniciada por = + - @ é neutralizada em toda exportação (CSV e XLSX).",
            "Valores legítimos (números, texto normal) permanecem intactos.",
            "Teste unitário de toCsv com payload de fórmula.",
        ],
        "explorabilidade":
            "Média. Entrada é anônima e trivial (headers HTTP); o gatilho é o admin abrir "
            "o CSV. Impacto recai sobre a conta mais privilegiada (painel mestre).",
    },
    {
        "id": 7,
        "categoria": "4. Chaves / defaults inseguros",
        "titulo": "Defaults inseguros de segredo sem validação de startup: token do painel "
                  "mestre assinado com a senha, e .env versionado no repositório",
        "severidade": "media",
        "arquivo": "src/lib/master-token.server.ts:33  •  .env  •  .gitignore",
        "linhas": "getSecret() cai em MASTER_ADMIN_PASSWORD; .env rastreado no git",
        "trecho":
            "function getSecret() {\n"
            "  const dedicada = process.env.MASTER_TOKEN_SECRET;\n"
            "  if (dedicada) return dedicada;\n"
            "  const s = process.env.MASTER_ADMIN_PASSWORD;  // fallback: senha vira chave\n"
            "  ...console.warn(...); return s; }\n"
            "# .env está no versionamento (contém hoje só a chave anon pública)",
        "por_que":
            "Dois defaults que só avisam no log, sem trava. (a) Sem MASTER_TOKEN_SECRET, o "
            "token de sessão do /admin-master é assinado com a própria MASTER_ADMIN_PASSWORD "
            "— quem obtiver um token pode atacá-lo offline para recuperar a senha do "
            "super-admin. (b) O .env está versionado (o .gitignore não o cobre); hoje só "
            "carrega a chave anon (pública), mas o padrão convida um segredo real a vazar "
            "no próximo commit — o próprio .env.example alerta 'NUNCA acrescente segredo'.",
        "impacto":
            "(a) Recuperação offline da senha do painel que enxerga TODAS as academias, se "
            "o segredo dedicado não for configurado. (b) Superfície latente: qualquer "
            "SUPABASE_SERVICE_ROLE_KEY/STRIPE_SECRET_KEY colocada no .env por engano entra "
            "no histórico git imediatamente. Verifiquei: hoje o histórico só tem a chave "
            "anon; nenhum segredo vivo foi commitado.",
        "correcao":
            "1) Exigir MASTER_TOKEN_SECRET (distinto da senha) na inicialização; recusar "
            "login mestre se ausente, em vez de assinar com a senha. 2) Remover .env do "
            "versionamento (git rm --cached .env) e adicioná-lo ao .gitignore; manter só o "
            ".env.example. 3) Validação de startup que rejeite defaults conhecidos "
            "('troque-por-um-valor...').",
        "criterios": [
            "Sem MASTER_TOKEN_SECRET dedicado, o login mestre é recusado (não usa a senha).",
            ".env deixa de ser rastreado; .gitignore o cobre; .env.example permanece.",
            "Validação de startup recusa valores default de placeholder.",
        ],
        "explorabilidade":
            "Média e condicional à ausência dos segredos dedicados. Sem exposição ativa "
            "hoje, mas remove uma rede de segurança inteira quando a config falha.",
    },
    {
        "id": 8,
        "categoria": "5. Inputs sem tratamento",
        "titulo": "dangerouslySetInnerHTML no componente de gráfico (CSS de tema)",
        "severidade": "informativa",
        "arquivo": "src/components/ui/chart.tsx:73",
        "linhas": "ChartStyle injeta <style> a partir do config de cores",
        "trecho":
            "<style dangerouslySetInnerHTML={{ __html: ...color config... }} />",
        "por_que":
            "É o componente Chart do shadcn/ui. O __html é montado a partir das cores do "
            "objeto config, que nas telas do projeto são definidas pelo desenvolvedor "
            "(constantes), não por entrada de usuário. Não encontrei caminho em que dado "
            "de usuário chegue ao config de cor.",
        "impacto":
            "Sem impacto explorável hoje: os valores são estáticos. Fica registrado como "
            "ponto de atenção — se algum dia uma cor de gráfico passar a vir do banco/"
            "usuário, isso vira vetor de injeção de CSS.",
        "correcao":
            "Manter os valores de cor restritos a um enum/paleta fixa; nunca interpolar "
            "string vinda de usuário no config do gráfico. Opcional: validar o formato "
            "hex antes de injetar.",
        "criterios": [
            "Cores de gráfico permanecem constantes de desenvolvedor.",
            "Se algum dia forem dinâmicas, passam por validação de formato hex.",
        ],
        "explorabilidade":
            "Nenhuma hoje (entrada é de desenvolvedor). Informativa/preventiva.",
    },
]

# ---------------------------------------------------------------------------
# PONTOS FORTES (o que foi verificado e está correto — prova de cobertura)
# ---------------------------------------------------------------------------
PONTOS_FORTES = [
    ("Isolamento por RLS em todas as tabelas de negócio",
     "As 13 tabelas de operação têm RLS habilitada e policies escopadas por "
     "get_current_tenant(). alunos/mensalidades/contratos/etc. exigem papel na "
     "SELECT — o perfil autoinserido do achado nº 1 NÃO vaza a lista de alunos por "
     "RLS direta (só via server functions de módulo ausente)."),
    ("has_role() corrigido para exigir papel no tenant do perfil (C3)",
     "user_roles.tenant_id passou a ser conferido contra profiles.tenant_id. "
     "Verifiquei no PoC: o atacante que entra no tenant da vítima NÃO ganha papel "
     "admin ali — as funções requireAdmin permanecem barradas."),
    ("profiles: mudança do próprio tenant_id por UPDATE bloqueada (C2)",
     "O WITH CHECK reaproveita get_current_tenant() (STABLE, snapshot antigo), "
     "então um perfil existente não consegue se mover de academia via UPDATE."),
    ("Autenticação dos hooks de cron com comparação de tempo constante",
     "Quando CRON_SECRET está setada, ela é o único segredo aceito e a chave anon "
     "é recusada; secretsMatch usa timingSafeEqual sem vazar tamanho."),
    ("Webhook do Stripe: assinatura verificada, idempotência e ordem",
     "constructEventAsync valida a assinatura; stripe_webhook_events (PK em "
     "event_id) faz de-dupe e a guarda de ordem descarta eventos atrasados; o "
     "registro é liberado se o processamento falha, evitando perder o evento."),
    ("Login do painel mestre endurecido",
     "Teto de 5 tentativas/15min por IP (master_login_attempts), comparação de "
     "digests em tempo constante, token HMAC com TTL de 12h e auditoria em "
     "system_logs."),
    ("Portal do aluno com 2º fator e sessões hasheadas",
     "Acesso por matrícula + data de nascimento; sessão em cookie httpOnly/secure/"
     "sameSite=strict com token hasheado (SHA-256); tetos por IP, por matrícula e "
     "diário; matrícula gerada por rejection sampling (sem viés)."),
    ("Endpoint público track-visit tratado",
     "Corpo validado por zod, teto por IP, CORS restrito a APP_URL/origem, user_id "
     "obrigatoriamente UUID e geolocalização com cache — fecha o abuso anterior."),
    ("Bloqueio de escrita por assinatura no próprio banco",
     "O gatilho tg_exigir_assinatura em 12 tabelas recusa INSERT/UPDATE/DELETE de "
     "conta vencida mesmo se alguém chamar o Supabase direto — leitura permanece "
     "liberada (decisão consciente de LGPD)."),
    ("Logs da plataforma fora do alcance do cliente (C5) e bucket de fotos privado (M3)",
     "visitor_logs e system_logs tiveram SELECT/DELETE revogados de authenticated; "
     "o bucket fotos-alunos foi tornado privado e as policies escopadas por tenant."),
    ("Sem segredos vivos no código, no bundle ou no histórico git",
     "Varredura da árvore, do bundle compilado (só a chave anon pública aparece) e "
     "dos 400 commits: nenhuma service_role, sk_live, whsec ou chave privada. Os "
     "price IDs do Stripe no código não são segredos."),
    ("Guardas server-side consistentes na maioria dos handlers",
     "requireAdmin/requirePermissao resolvem o tenant sempre de profiles (fonte "
     "única), não de user_roles; handlers por id (registrarPagamento, "
     "deleteDespesa, resendNotification) usam o client RLS ou checam posse "
     "explicitamente (resendNotification compara n.tenant_id)."),
]

# ---------------------------------------------------------------------------
# RECOMENDAÇÕES PRIORIZADAS
# ---------------------------------------------------------------------------
RECOMENDACOES = [
    ("P1", "Fechar a tomada de conta de tenant (achado nº 1): bloquear INSERT de "
           "profiles por 'authenticated' e ignorar skip_tenant vindo do signUp público. "
           "É o único achado que dá leitura/escrita cruzada entre academias."),
    ("P1", "Tirar billing/ativo e permissions do alcance de escrita do cliente "
           "(achados 2 e 3): via GRANT de coluna ou movendo a escrita para server "
           "functions/service_role. Fecha burla de paywall, anulação de suspensão e "
           "escalonamento de privilégio interno."),
    ("P1", "Tornar CRON_SECRET e MASTER_TOKEN_SECRET obrigatórios com validação de "
           "startup (achados 4 e 7a); remover os fallbacks para a chave anon e para a "
           "senha do mestre."),
    ("P2", "Verificar posse de aluno_id ao gravar contrato/histórico (achado nº 5), no "
           "handler e com CHECK no banco."),
    ("P2", "Neutralizar injeção de fórmula em todas as exportações CSV/XLSX "
           "(achado nº 6) com uma função de sanitização compartilhada."),
    ("P3", "Remover .env do versionamento e cobri-lo no .gitignore (achado nº 7b); "
           "manter apenas .env.example."),
    ("P3", "Manter as cores de gráfico restritas a paleta fixa (achado nº 8) e adicionar "
           "testes de regressão de RLS cruzada na suíte supabase/testes."),
]

# GitHub issues: agrupamentos (para não gerar spam).
# Cada item aponta os achados que compõem a issue.
ISSUES_GITHUB = [
    {"achados": [1], "labels": ["security", "critical"]},
    {"achados": [2], "labels": ["security", "high"]},
    {"achados": [3], "labels": ["security", "high"]},
    {"achados": [4], "labels": ["security", "high"]},
    {"achados": [5], "labels": ["security", "medium"]},
    {"achados": [6], "labels": ["security", "medium"]},
    {"achados": [7], "labels": ["security", "medium"]},  # agrupa 7a+7b (mesmo tema: defaults)
]

CORES = {
    "critica": "#B91C1C",
    "alta": "#EA580C",
    "media": "#D97706",
    "baixa": "#2563EB",
    "informativa": "#6B7280",
    "forte": "#059669",
}

SEV_LABEL = {
    "critica": "Crítica",
    "alta": "Alta",
    "media": "Média",
    "baixa": "Baixa",
    "informativa": "Informativa",
}
