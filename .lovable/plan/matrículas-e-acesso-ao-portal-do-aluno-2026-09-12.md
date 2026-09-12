# Matrículas e acesso ao Portal do Aluno

## Objetivo

Gerar uma matrícula para os 60 alunos cadastrados, permitir acesso ao portal usando **somente o número de matrícula**, disponibilizar uma planilha para entrega e eliminar definitivamente o acesso individual por link público.

## Implementação

### 1. Geração em massa das credenciais

- Criar uma ação administrativa **Gerar matrículas dos alunos** disponível apenas para quem pode editar alunos.
- Gerar uma matrícula globalmente única para cada um dos 60 alunos cadastrados, incluindo ativos e inativos.
- Tornar a operação segura para repetição: alunos que já possuam matrícula manterão o mesmo número.
- Permitir bloquear ou liberar individualmente o acesso de cada matrícula.
- Invalidar as sessões abertas quando o acesso de uma matrícula for bloqueado.

### 2. Planilha de entrega

- Após a geração, disponibilizar um arquivo `.xlsx` com nome do aluno, matrícula, status do aluno e endereço do portal.
- Aplicar cabeçalho, filtros, larguras adequadas e aviso de confidencialidade, mantendo o arquivo simples para impressão ou distribuição individual.
- Permitir baixar novamente a relação de matrículas quando necessário, sempre respeitando a academia do usuário conectado.

### 3. Lista de alunos

- Adicionar uma coluna visível **Acesso por matrícula**.
- Mostrar a matrícula e um estado claro: não gerado, ativo ou bloqueado.
- Manter ações individuais de gerar matrícula e bloquear/desbloquear acesso.
- Permitir busca também pela matrícula.
- Não exibir senhas provisórias na lista.

### 4. Login dedicado dos alunos

- Manter `/portal` como a única entrada do aluno, solicitando apenas o número de matrícula.
- Remover todos os campos, regras e etapas relacionados a senha.
- Criar a sessão após validar uma matrícula ativa, mantendo cookie protegido, limitação de tentativas, bloqueio temporário e saída.
- Preservar a área somente leitura com mensalidades, horários e graduações.
- Revisar mensagens e estados de carregamento/erro no computador e celular.
- Manter todos os dados atualmente exibidos, conforme decidido, mesmo com o risco maior inerente ao acesso por matrícula sem segundo fator.

### 5. Remoção do portal público antigo

- Remover a coluna antiga de token público e a função que fornecia dados por token.
- Remover a rota individual `/portal/{token}` e qualquer geração, cópia ou documentação de links individuais.
- Garantir que nenhum dado de aluno seja consultável sem matrícula válida e sessão ativa.
- Atualizar os testes e referências antigas para refletirem exclusivamente o novo login.

### 6. Validação

- Confirmar que os 60 alunos receberam matrícula e credencial válida.
- Validar que todas as matrículas são únicas.
- Testar entrada por matrícula, novo acesso, logout e bloqueio.
- Confirmar isolamento entre alunos e academias.
- Conferir a planilha gerada e garantir que não contenha erros.
- Validar a lista em telas grandes e pequenas e verificar a compilação final.

## Detalhes técnicos

- A geração em massa será executada no servidor e protegida pelas permissões administrativas existentes.
- A planilha será montada no navegador com os alunos e matrículas da academia autenticada, sem expor dados de outras academias.
- A limpeza do modelo antigo será feita por migration, removendo `portal_token` e a função pública legada após confirmar que o código não possui dependências restantes.
- A estrutura de credenciais será simplificada para matrícula sem senha; sessões com expiração, cookie protegido, bloqueio por tentativas e mensagens sem enumeração de matrículas serão preservados.
- Como a matrícula passa a ser o único segredo de acesso, ela não será exposta em áreas públicas, URLs ou mensagens automáticas.
