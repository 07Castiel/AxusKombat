-- ============================================================================
-- APLICADA EM 01/09/2026 pelo SQL editor do Lovable Cloud, nao pelo sistema de
-- migrations. Fica registrada aqui para o repositorio refletir o schema real.
--
-- E idempotente (DROP ... IF EXISTS antes de cada CREATE, CREATE OR REPLACE nas
-- funcoes), entao um `db push` que a execute de novo nao causa dano.
--
-- Verificacao: supabase/HARDENING_3_VERIFICAR.sql  -> todas as linhas OK
-- Desfazer:    supabase/HARDENING_2_ROLLBACK.sql
-- ============================================================================

-- ============================================================================
-- HARDENING MULTI-TENANT — fecha C2, C3, C4, C5(SQL), M3 e M4
--
-- PREFLIGHT EXECUTADO EM 01/09/2026 — LIBERADO PARA APLICAR.
--   papel em tenant divergente ......... 0   OK
--   papeis orfaos ...................... 0   OK
--   usuarios em mais de um tenant ...... 0   OK
--   desconto maior que o valor ......... 0   OK
--   roles_admin_all existe ............. 1   OK
--
-- Conferido também que nenhuma tela escreve tenant_id em profiles pelo
-- cliente: o único UPDATE fora do service role é configuracoes.tsx, que
-- altera apenas nome_completo e passa no WITH CHECK novo.
--
-- Roda inteira ou não roda: tudo está dentro de BEGIN/COMMIT.
-- Nenhum comando aqui apaga ou altera linha de dado de negócio. As únicas
-- escritas são em policies, na função has_role, no flag `public` do bucket
-- e uma constraint nova.
--
-- O rollback está no fim do arquivo, comentado.
-- ============================================================================

BEGIN;


-- ============================================================================
-- C2 — profiles: impedir que o usuário troque o próprio tenant
--
-- A policy atual declara só USING. Quando o WITH CHECK é omitido, o Postgres
-- reaproveita o USING para validar a linha nova — e `id = auth.uid()` continua
-- verdadeiro depois de o usuário reescrever o próprio tenant_id, o que o move
-- para dentro de outra academia.
--
-- get_current_tenant() é STABLE: dentro do WITH CHECK ela enxerga o snapshot
-- do início do comando, ou seja, o tenant ANTIGO. É exatamente o que queremos:
-- o tenant novo tem de ser igual ao antigo.
-- ============================================================================

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;

CREATE POLICY profiles_update_self_or_admin ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = auth.uid()
  OR (tenant_id = public.get_current_tenant() AND public.is_admin())
)
WITH CHECK (
  tenant_id = public.get_current_tenant()
  AND (id = auth.uid() OR public.is_admin())
);

-- Nota: profiles_insert_self (WITH CHECK id = auth.uid()) fica como está.
-- A chave primária referencia auth.users e o trigger handle_new_user já cria
-- a linha no cadastro, então um INSERT do cliente sempre colide com a PK.
-- Endurecer essa policy arriscaria travar o cadastro sem fechar nada novo.


-- ============================================================================
-- C3 — has_role(): passar a exigir que o papel seja do tenant do próprio perfil
--
-- A tabela user_roles guarda tenant_id e a função nunca olhava para ele: ser
-- admin em qualquer academia era ser admin em todas. Isso é o que transforma
-- C2 e C4 em tomada de conta completa.
--
-- Amarramos ao tenant do PERFIL do usuário (e não ao tenant de quem chama),
-- porque assim a função continua correta quando _user_id != auth.uid() — que
-- é como acessos.functions.ts a invoca.
--
-- Efeito colateral desejado: mesmo que alguém consiga mexer no próprio
-- tenant_id, o papel deixa de casar e a pessoa perde privilégio em vez de
-- ganhar. Defesa em profundidade sobre C2.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles   p ON p.id = ur.user_id
    WHERE ur.user_id   = _user_id
      AND ur.role      = _role
      AND ur.tenant_id = p.tenant_id
  )
$$;

-- CREATE OR REPLACE preserva as ACLs, mas reafirmamos o revoke da migration
-- de 09/07 para o caso de a função ter sido recriada por fora desde então.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;


-- ============================================================================
-- C4 — user_roles: devolver o escopo de tenant às policies de escrita
--
-- A migration de 09/07 acrescentou três policies com WITH CHECK (is_admin())
-- e nenhuma verificação de tenant. Policies permissivas somam em OR, então a
-- roles_admin_all — essa sim correta — não restringia as novas: qualquer admin
-- podia inserir (user_id: eu, tenant_id: concorrente, role: 'admin').
--
-- Derrubar as três basta, porque roles_admin_all é FOR ALL e já cobre insert,
-- update e delete com a checagem certa. Recriada abaixo por garantia.
--
-- Zero impacto no app: toda escrita em user_roles passa por supabaseAdmin
-- (service role), que não é submetido a RLS. O cliente só faz SELECT.
-- ============================================================================

DROP POLICY IF EXISTS user_roles_insert_admin_only ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_admin_only ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_admin_only ON public.user_roles;

DROP POLICY IF EXISTS roles_admin_all ON public.user_roles;
CREATE POLICY roles_admin_all ON public.user_roles
FOR ALL TO authenticated
USING      (tenant_id = public.get_current_tenant() AND public.is_admin())
WITH CHECK (tenant_id = public.get_current_tenant() AND public.is_admin());


-- ============================================================================
-- C5 (parte SQL) — fechar o caminho direto do navegador aos logs da plataforma
--
-- visitor_logs e system_logs não têm tenant_id, e as policies liberavam leitura
-- e exclusão para qualquer has_role(auth.uid(),'admin') — ou seja, todo dono de
-- academia via os logs de todas as outras direto pela chave anon.
--
-- Estes logs são do SaaS, não do cliente: quem precisa deles é o painel mestre,
-- que usa service role e não depende de RLS. Então tiramos o acesso de
-- `authenticated` por completo.
--
-- ATENÇÃO: isto sozinho NÃO fecha o C5. A tela /acessos consulta com
-- supabaseAdmin e continua devolvendo tudo. A correção que importa é no
-- TypeScript (mover a tela para o painel mestre) e vem no próximo passo.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read visitor logs"   ON public.visitor_logs;
DROP POLICY IF EXISTS "Admins can delete visitor logs" ON public.visitor_logs;
DROP POLICY IF EXISTS "Admins can read system logs"    ON public.system_logs;
DROP POLICY IF EXISTS "Admins can delete system logs"  ON public.system_logs;

REVOKE SELECT, DELETE ON public.visitor_logs FROM authenticated;
REVOKE SELECT, DELETE ON public.system_logs  FROM authenticated;

-- notification_worker_runs também é tenant-cego (USING (is_admin())), mas o
-- painel "Status do serviço" lê essa tabela com o client do usuário. Mexer
-- aqui quebraria a tela, e o dado é só volumetria agregada do worker.
-- Fica para o passo de TypeScript, junto com o escopo por tenant.


-- ============================================================================
-- M3 — bucket de fotos deixa de ser público
--
-- O bucket foi criado com public = true. As policies passaram a ser escopadas
-- por tenant em 09/07, o que resolve o caminho autenticado — mas em bucket
-- público a leitura por /storage/v1/object/public/... não passa por RLS.
-- Qualquer pessoa com a URL vê a foto, inclusive as de alunos kids.
--
-- Risco zero de quebrar tela: não existe uma linha de upload ou exibição de
-- foto em todo o src/. O bucket está criado e ocioso (preflight: 0 arquivos).
--
-- O preflight mostrou que o bucket JÁ ESTÁ PRIVADO (public = false) — alguma
-- alteração posterior corrigiu isso fora do histórico de migrations. O comando
-- fica porque é idempotente e deixa o estado explícito.
--
-- O que sobra do M3 continua aberto e é trabalho de outro tipo: retenção e
-- anonimização de IP em visitor_logs, e base legal declarada para o CPF do
-- responsável e as observações médicas dos alunos.
-- ============================================================================

UPDATE storage.buckets SET public = false WHERE id = 'fotos-alunos';


-- ============================================================================
-- M4 — desconto não pode passar do valor
--
-- Existe CHECK (desconto >= 0), mas nada impedia desconto > valor. A coluna
-- gerada valor_final (valor - desconto) ficava negativa e contaminava receita,
-- lucro e relatórios.
--
-- O preflight voltou 0 linhas violando a regra, entao a constraint entra
-- validada, sem precisar do modo NOT VALID.
-- ============================================================================

ALTER TABLE public.mensalidades
  DROP CONSTRAINT IF EXISTS mensalidades_desconto_lte_valor;

ALTER TABLE public.mensalidades
  ADD CONSTRAINT mensalidades_desconto_lte_valor CHECK (desconto <= valor);


COMMIT;
