# Área do membro — ativação no Firebase

## O que você precisa fazer

Não crie outro banco, não apague os cadastros e não cadastre novamente as contas.

1. Abra o projeto **Ekklesia** no Firebase.
2. Entre em **Firestore Database → Regras**.
3. Guarde uma cópia das regras atuais. Substitua o conteúdo completo pelo arquivo **firestore.rules**, na raiz do projeto, e clique em **Publicar**. As regras antigas não permitem ler as novas coleções; por isso esta etapa precisa acontecer antes de utilizar a nova versão.
4. Abra o Ekklesia por HTTP e entre como administrador.
5. Em **Configurações**, clique em **Publicar participantes** uma vez. Isso disponibiliza somente nomes e vínculos dos cadastros existentes. Novos membros, edições e exclusões feitas pelo site atualizam essa lista automaticamente. Se você editar diretamente pelo console Firebase, clique novamente em Publicar participantes para atualizar a projeção.
6. Em **Ministérios**, cadastre os ministérios da congregação. Em **Membros**, confira os nomes dos ministérios e células de cada pessoa. Os vínculos existentes continuam sendo por nome: mantenha a mesma grafia e, se renomear um grupo, atualize os vínculos no cadastro dos membros.
7. Em **Escalas → Nova Escala**, escolha o tipo **Culto**, uma data futura, horário e local. Salve. Ensaio e Evento não recebem disponibilidades neste fluxo.
8. Em **Campanhas**, crie ou edite uma campanha. Para receber doações, escolha **Em andamento** e configure uma ou mais opções: link HTTPS de pagamento, chave Pix acompanhada do beneficiário, ou orientações para entregar alimentos/outros itens. Confira os dados de recebimento antes de publicar.
9. Saia da conta administrativa e entre com sua conta de Membro. O login encaminha automaticamente para **Minha comunidade**.

As coleções novas são criadas automaticamente na primeira gravação. Uma coleção vazia pode não aparecer no console. Se não houver grupos ou cultos publicados, a área do membro mostrará uma mensagem de lista vazia, sem inventar registros.

## O que o membro pode fazer

- Consultar ministérios e células, incluindo os participantes publicados pela administração.
- Consultar cultos futuros e informar sua própria disponibilidade e uma observação opcional.
- Ver, atualizar e cancelar suas próprias respostas. Cancelamentos ficam no histórico.
- Consultar as campanhas, copiar uma chave Pix ou abrir um link oficial de pagamento configurado pelo administrador.

O membro não pode criar, atualizar ou excluir cadastros administrativos, alterar campanhas, ler respostas de outras pessoas nem acessar contatos privados da lista de membros. As regras do Firestore aplicam essas restrições, além dos controles das telas. Administradores continuam entrando no painel administrativo.

## Como a administração acompanha as respostas

Abra **Escalas → Disponibilidades**. Use os filtros por culto, pessoa e situação. Clique em **Atualizar disponibilidades** para buscar novas respostas. O nome exibido corresponde à conta autenticada que respondeu.

`usuarios` (contas de acesso) e `membros` (pessoas cadastradas) continuam separados. Não fazemos associação automática por nome ou e-mail. Nesta versão, as respostas usam o UID autenticado e o nome do perfil; não dependem de um vínculo manual com o cadastro de pessoa. A lista de participantes dos grupos vem dos cadastros administrativos, e criar uma conta não insere automaticamente alguém em um grupo.

## Doações

As formas de recebimento são configuradas por campanha. A tela não inventa uma chave Pix nem gera um QR Code de pagamento sem dados válidos. O Pix é feito no aplicativo do banco; o link abre uma página externa identificada pelo domínio. O membro deve conferir destinatário e valor antes de pagar.

Não há processamento de cartão, webhook, confirmação automática de pagamento ou registro automático de arrecadação. Copiar uma chave ou abrir um link não significa que houve pagamento. A administração atualiza as quantidades recebidas/entregues após conferir o recebimento. As metas atuais continuam sendo quantidades de itens, não valores monetários.

## Dados e regras

| Coleção | Uso | Membro ativo | Administrador ativo |
|---|---|---|---|
| `usuarios` | Conta e perfil | Ler seu próprio perfil; criar conta com papel restrito | Ler seu próprio perfil; aprovação continua pelo console |
| `membros` | Cadastro completo e contatos | Sem acesso | Gerenciar |
| `bandas` | Bandas | Sem acesso direto nesta etapa | Gerenciar conforme funcionalidades existentes |
| `comunidadeMembros` | Nome, ministério, célula, banda e status | Ler | Publicar/atualizar/excluir |
| `ministerios`, `celulas` | Grupos e encontros | Ler | Gerenciar |
| `escalas` | Cultos/eventos e horário | Ler | Gerenciar |
| `campanhas` | Campanhas e instruções de doação | Ler | Gerenciar |
| `disponibilidades` | Respostas identificadas por conta | Ler e responder somente em seu nome; cancelar sua resposta | Consultar todas e cancelar respostas |

`disponibilidades/{uid}_{escalaId}` contém `usuarioId`, `escalaId`, `nome`, `cultoNome`, `data`, `horario`, `local`, `disponivel`, `observacao` e `atualizadoEm`. O ID evita respostas duplicadas por conta/culto. A gravação consulta novamente o evento em transação; as regras exigem culto futuro, status válido e identidade do autor. Atualizações de horário exigem reconfirmação e a interface sinaliza essa situação. Disponibilidade não equivale a estar escalado; não há alocação automática nem bloqueio entre múltiplos cultos concorrentes nesta entrega.

Escalas salvas pelo site incluem `tipo` e `inicioEm` (timestamp), calculado com horário de Brasília. Se criar escalas diretamente no console, mantenha esses campos consistentes; prefira o formulário do site.

## Registros antigos do navegador

Ministérios, escalas e campanhas agora são lidos e gravados no Firestore pela administração e pelos membros. Não há fallback para exemplos locais quando uma consulta falha.

Os registros antigos em `localStorage` não foram apagados nem enviados ao banco automaticamente. Eles podem conter exemplos fictícios. Se você tinha registros reais somente no navegador, consulte essa cópia e recadastre os itens reais nas telas administrativas. As disponibilidades antigas não possuem identidade autenticada; os membros deverão confirmá-las com sua própria conta. Os cadastros de membros, bandas e células já existentes no Firebase são preservados.

## Leituras e atualização

O portal consulta as coleções uma vez ao abrir e reaproveita os dados em memória ao alternar seções ou pesquisar. Busca disponibilidades com filtro por UID. Não usa listeners contínuos nem releituras automáticas a cada foco. O botão Atualizar faz nova consulta; abrir instruções de doação após mais de um minuto atualiza os dados antes. Cada portal ainda carrega as listas completas da comunidade; para bases grandes, a próxima otimização será paginação de consultas. Não é necessário índice composto para os filtros atuais.

## Teste após publicar as regras

1. Entre como membro: confira que não aparecem botões de editar/excluir cadastros e que uma URL administrativa redireciona para o portal.
2. Veja participantes de um ministério e de uma célula.
3. Informe disponibilidade, atualize a página e confira o histórico.
4. Entre com outra conta de membro: ela não deve ver a resposta da primeira.
5. Como administrador, abra Escalas → Disponibilidades e veja a resposta.
6. Altere o horário do culto. O membro deve ver Reconfirmar após atualizar; confirme novamente ou cancele.
7. Teste uma campanha sem dados de recebimento e uma com chave Pix/link oficial configurado.

Os testes locais usam serviços simulados e não criam contas nem fazem pagamentos reais. As regras precisam ser publicadas e o fluxo validado no projeto real. Para verificar as regras no Emulator Suite, há um teste separado em `tests/firestore-rules.test.cjs`; nunca execute esse teste contra um projeto de produção.

Referência técnica: [Firestore não permite ocultar campos individuais de um documento lido](https://firebase.google.com/docs/firestore/security/rules-fields). Por isso os contatos continuam em `membros`, enquanto o portal consulta a projeção `comunidadeMembros`.
