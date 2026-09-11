# Login do Portal do Aluno

## Objetivo

Substituir os links permanentes individuais por uma tela de login própria para alunos, usando **matrícula + senha**, sem exigir e-mail, CPF ou telefone.

## Fluxo aprovado

1. Cada aluno recebe uma matrícula única gerada automaticamente pelo sistema.
2. A academia ativa o acesso e recebe uma senha provisória para entregar ao aluno.
3. No primeiro acesso, o aluno entra com matrícula e senha provisória e é obrigado a criar uma senha pessoal.
4. Nos próximos acessos, usa a mesma tela de login do Portal do Aluno.
5. Se esquecer a senha, solicita à academia; a equipe redefine e gera uma nova senha provisória.
6. Cada aluno possui seu próprio login, inclusive menores; não haverá conta conjunta de responsável nesta etapa.

## Implementação

### 1. Credenciais e sessões separadas

- Criar uma estrutura exclusiva para credenciais de alunos, vinculada ao cadastro existente e à academia.
- Manter as contas de alunos totalmente separadas das contas da equipe administrativa.
- Guardar somente hash seguro da senha; nunca salvar ou exibir a senha atual.
- Criar sessões seguras, com expiração e cookie protegido, armazenando apenas o hash do identificador da sessão.
- Invalidar sessões quando o acesso for desativado ou a senha for redefinida.
- Aplicar isolamento por academia e regras de acesso no banco, com permissões mínimas.

### 2. Geração e administração do acesso

- Adicionar na tela de alunos a ação **Ativar acesso ao portal**.
- Gerar matrícula única e senha provisória forte, mostrando a senha somente uma vez.
- Permitir copiar/imprimir as credenciais para entrega presencial.
- Exibir o estado do acesso: não ativado, ativo, troca de senha pendente ou bloqueado.
- Disponibilizar ações de redefinir senha, bloquear/desbloquear acesso e encerrar sessões.
- Remover a ação atual de copiar link permanente.

### 3. Login e primeiro acesso

- Criar `/portal` com formulário de matrícula e senha.
- Implementar limitação de tentativas, bloqueio temporário e mensagens que não revelem se uma matrícula existe.
- Criar etapa obrigatória de troca da senha provisória.
- Manter a sessão ao atualizar a página e oferecer saída segura.
- Não incluir recuperação automática por e-mail ou telefone; a redefinição será feita pela academia.

### 4. Área autenticada do aluno

- Migrar a tela atual para uma área acessível somente após login.
- Preservar mensalidades, horários e histórico de graduação já exibidos.
- Buscar os dados pelo aluno da sessão, nunca por matrícula, URL ou valor enviado pelo navegador.
- Adicionar cabeçalho com nome, academia e botão **Sair**.
- Manter o portal somente para consulta nesta etapa.

### 5. Transição dos links antigos

- Revogar o acesso anônimo baseado em `portal_token` e deixar de gerar novos links.
- Fazer links antigos levarem à nova tela de login, sem revelar dados do aluno.
- Remover a função pública que hoje entrega dados mediante token após a transição.

### 6. Validação

- Testar ativação, primeiro acesso, troca de senha, novo login, saída e redefinição pela academia.
- Testar bloqueio por tentativas e expiração/invalidação da sessão.
- Confirmar que um aluno nunca acessa dados de outro aluno ou de outra academia.
- Confirmar que alunos não recebem permissões de funcionário.
- Verificar o fluxo em computador e celular, além dos estados de erro e carregamento.

## Detalhes técnicos

- Autenticação própria do portal com matrícula global única e sessão segura em cookie; não será usado e-mail sintético.
- Hash de senha e tokens com funções criptográficas adequadas, segredos somente no servidor e comparação segura.
- Tabelas novas terão permissões explícitas, proteção por linha e nenhuma leitura direta pelo navegador.
- Endpoints públicos validarão entrada, aplicarão proteção contra força bruta e retornarão apenas dados necessários.
- O portal administrativo e sua autenticação atual permanecerão inalterados.
