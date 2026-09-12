# Matrículas e login do Portal do Aluno

## Objetivo

Gerar acesso por **matrícula + senha provisória** para os 60 alunos cadastrados, disponibilizar uma planilha segura para entrega das credenciais e eliminar definitivamente o acesso individual por link público.

## Implementação

### 1. Geração em massa das credenciais

- Criar uma ação administrativa **Gerar acessos dos alunos** disponível apenas para quem pode editar alunos.
- Gerar uma matrícula globalmente única e uma senha provisória forte para cada um dos 60 alunos cadastrados, incluindo ativos e inativos.
- Guardar somente o hash da senha; a senha original existirá apenas no resultado imediato da geração.
- Exigir que cada aluno crie uma nova senha no primeiro login.
- Tornar a operação segura para repetição: alunos que já possuam credencial não terão a senha redefinida silenciosamente.
- Invalidar sessões somente quando houver uma redefinição explícita de senha.

### 2. Planilha de entrega

- Após a geração, disponibilizar um arquivo `.xlsx` com nome do aluno, matrícula, senha provisória, status do aluno e endereço do portal.
- Aplicar cabeçalho, filtros, larguras adequadas e aviso de confidencialidade, mantendo o arquivo simples para impressão ou distribuição individual.
- Gerar a planilha somente com as senhas criadas naquela execução; senhas antigas nunca poderão ser recuperadas.
- Exibir aviso claro para baixar e guardar o arquivo naquele momento.

### 3. Lista de alunos

- Adicionar uma coluna visível **Acesso por matrícula**.
- Mostrar a matrícula e um estado claro: não gerado, troca de senha pendente, ativo ou bloqueado.
- Manter ações individuais de gerar/redefinir senha e bloquear/desbloquear acesso.
- Permitir busca também pela matrícula.
- Não exibir senhas provisórias na lista.

### 4. Login dedicado dos alunos

- Manter `/portal` como a única entrada do aluno, com matrícula e senha.
- Preservar troca obrigatória da senha provisória, sessão segura, limitação de tentativas, bloqueio temporário e saída.
- Preservar a área somente leitura com mensalidades, horários e graduações.
- Revisar mensagens e estados de carregamento/erro no computador e celular.

### 5. Remoção do portal público antigo

- Remover a coluna antiga de token público e a função que fornecia dados por token.
- Remover a rota individual `/portal/{token}` e qualquer geração, cópia ou documentação de links individuais.
- Garantir que nenhum dado de aluno seja consultável sem matrícula, senha e sessão válida.
- Atualizar os testes e referências antigas para refletirem exclusivamente o novo login.

### 6. Validação

- Confirmar que os 60 alunos receberam matrícula e credencial válida.
- Validar que matrículas são únicas e senhas não ficam armazenadas em texto legível.
- Testar login com senha provisória, troca obrigatória, novo login, logout, bloqueio e redefinição.
- Confirmar isolamento entre alunos e academias.
- Conferir a planilha gerada e garantir que não contenha erros.
- Validar a lista em telas grandes e pequenas e verificar a compilação final.

## Detalhes técnicos

- A geração em massa será executada no servidor e protegida pelas permissões administrativas existentes.
- A planilha será montada no navegador a partir do retorno único da operação, sem persistir senhas provisórias em arquivos do servidor ou no banco.
- A limpeza do modelo antigo será feita por migration, removendo `portal_token` e a função pública legada após confirmar que o código não possui dependências restantes.
- O login atual já possui hash PBKDF2, cookie protegido, sessão com expiração, bloqueio por tentativas e mensagens sem enumeração de matrículas; esses controles serão preservados.
