# Cadastro e acesso — Ekklesia

> Atualização mais recente: a vinculação da conta na edição do membro agora é feita pelo campo **E-mail da conta de acesso**, substituindo a digitação do UID. O sistema normaliza o e-mail, busca uma única conta ativa da mesma igreja e mantém o UID internamente. As referências anteriores a informar UID nesse formulário descrevem a etapa anterior. O cadastro da conta precisa estar aprovado antes da promoção a Líder. A regra que autoriza a busca restrita está acumulada no mesmo `firestore.rules`, para publicação única ao final das alterações.

## Atualização: perfil pessoal e dashboard

O perfil na barra superior das telas administrativas abre uma janela para editar nome, telefone, descrição e foto. O e-mail de acesso fica somente para consulta; cargo, status e igreja não podem ser alterados por esse formulário. A foto é reduzida para JPEG 256 × 256, com limite de 120 mil caracteres, e armazenada no documento da própria conta em `usuarios/{uid}`. Não requer Cloud Storage. A edição não altera o cadastro administrativo da pessoa em `membros`, que é um registro separado.

Para habilitar a gravação, publique o arquivo atualizado `firestore.rules` em **Firestore Database → Regras**, preservando uma cópia das regras publicadas antes da substituição. A permissão nova permite somente ao dono da conta atualizar `nome`, `telefone`, `descricao` e `foto`. Não é necessário criar campos ou coleções manualmente. Sem a regra publicada, o formulário informa que a gravação não está autorizada e preserva os dados para nova tentativa.

Os contadores do dashboard abrem prévias de até cinco registros usando os dados já carregados. A agenda usa as escalas cadastradas, permite navegar por mês, selecionar dias e consultar detalhes. Eventos cancelados ou concluídos não aparecem nessa agenda. Não há mais eventos fictícios fixos na lateral. Para buscar alterações feitas por outra sessão, utilize **Atualizar** no dashboard.

> Atualização: a área do membro já foi implementada. Para a configuração atual, consulte [AREA-DO-MEMBRO.md](AREA-DO-MEMBRO.md). As instruções de ativação de Authentication e aprovação do primeiro administrador abaixo continuam válidas; as limitações sobre área de membro indisponível e módulos locais descrevem a etapa anterior.

## O que foi implementado

- `pages/cadastro.html`: escolha Administrador ou Membro, nome, e-mail, senha e confirmação.
- Firebase Authentication: criação de credenciais, login, sessão por aba e recuperação de senha.
- Firestore: um perfil em `usuarios/{uid}`, usando o UID do Authentication como ID do documento.
- Administrador solicitado começa com `perfil: "membro"`, `perfilSolicitado: "administrador"` e `status: "pendente"`. Só a aprovação pelo console concede administração.
- Membro começa com `perfil: "membro"`, `perfilSolicitado: "membro"` e `status: "ativo"`. A área de membros não foi construída nesta etapa. O login informa isso e encerra a sessão, sem abrir a administração.
- As páginas existentes carregam seus módulos apenas após verificar o administrador ativo. A proteção efetiva do Firestore depende da publicação das regras abaixo.
- A senha fica exclusivamente no Authentication. Nunca é gravada em documentos, logs ou URLs.
- `usuarios` representa contas de acesso; `membros` continua representando o cadastro da comunidade. Não há duplicação nem vinculação automática por nome/e-mail. O vínculo com uma pessoa existente será implementado junto à área de membros.

## Antes de testar com o banco real

Não precisa criar coleções manualmente. Precisa configurar Authentication e publicar as regras antes de testar os cadastros. Nenhuma alteração no console foi feita automaticamente.

1. Abra o projeto **ekklesia-10ccf** no console Firebase.
2. Em **Authentication → Sign-in method / Método de login**, habilite **E-mail/senha** e salve. Não é necessário habilitar link de acesso por e-mail.
3. Em **Authentication → Settings / Configurações → Authorized domains / Domínios autorizados**, confira o domínio em que o app será executado. Adicione `localhost` para desenvolvimento local se não estiver presente (somente o host, sem protocolo nem porta).
4. Em **Firestore Database → Regras**, faça uma cópia das regras anteriores e substitua TODO o conteúdo pelo arquivo `firestore.rules` da raiz deste projeto. Publique. Não mantenha os antigos `allow read, write: if true`: uma permissão aberta em outra regra correspondente continua permitindo acesso.
5. Sirva o projeto por HTTP, não abrindo o HTML via `file://`. Na pasta do projeto, por exemplo: `python -m http.server 8000 --bind 127.0.0.1`. Abra `http://localhost:8000/pages/cadastro.html`.
6. Selecione **Administrador** e cadastre seu nome, e-mail e senha. A conta será criada, mas o acesso ficará pendente.
7. No Firestore, abra **usuarios**, localize o perfil pelo e-mail e confira se seu ID corresponde ao UID exibido no Authentication.
8. Nesse documento, altere os campos string **perfil** para `administrador` e **status** para `ativo`. Preserve `perfilSolicitado`, `nome`, `email` e `criadoEm`.
9. Abra a tela de login e entre com a conta aprovada. O painel administrativo será liberado.

Não há necessidade de Cloud Functions, serviço pago de IA ou novo índice composto para este cadastro. O fluxo usa leituras pontuais por UID; a criação do perfil usa uma transação para impedir sobrescrita em tentativas simultâneas. As regras de administração também consultam o perfil; essas verificações podem consumir leituras conforme as regras de cobrança do Firestore.

## Documento criado pelo aplicativo

```text
usuarios/{UID_DO_AUTHENTICATION}
  nome: string
  email: string
  perfilSolicitado: "administrador" | "membro"
  perfil: "membro"                         (na criação pública)
  status: "pendente" | "ativo"            (conforme a escolha)
  criadoEm: timestamp                     (horário do servidor)
```

As regras permitem que cada usuário leia seu próprio perfil e o crie uma única vez com os valores acima. Não permitem listar perfis nem editar o próprio papel. Aprovações e desativações são feitas pelo responsável no console; o cliente web não consegue se promover.

Nesta fase, somente administradores ativos podem ler/gravar `membros`, `bandas` e `celulas`. Os demais caminhos permanecem negados. As futuras permissões de visualização para membros e de registro de disponibilidade exigirão uma nova etapa; não estão abertas agora.

## Verificações no projeto real

1. Senhas diferentes: cadastro bloqueado antes de enviar.
2. Membro: perfil criado sem permissão administrativa; login exibe mensagem sobre a futura área.
3. Administrador pendente: não abre o painel, mesmo digitando a URL diretamente.
4. Administrador aprovado: entra e usa os cadastros existentes.
5. Sair: encerra a sessão; abrir novamente a URL administrativa exige login.
6. E-mail já cadastrado: não sobrescreve nome nem perfil. Use Entrar ou recuperação de senha.
7. Cadastro interrompido: se Authentication criou a conta e Firestore falhou, corrija a configuração e repita o cadastro com o mesmo e-mail e senha. O app autentica essa conta antes de completar o perfil ausente.
8. Sem conexão/permissão: não libera o painel nem trata falha como sucesso.

No simulador de regras, verifique: acesso anônimo negado em todas as coleções; criação do próprio perfil válida; criação com `perfil: "administrador"` negada; perfil de outro UID negado; mudança de papel negada; membro/pendente sem escrita em `membros`; administrador ativo com acesso às três coleções existentes. Use o Emulator Suite antes de ampliar as regras para produção.

## Limites desta entrega

As regras estão preparadas no repositório, mas só entram em vigor após sua publicação no Firebase. A integração precisa ser validada com seu projeto depois dessa configuração. Nenhuma conta real foi criada nos testes locais. Os outros módulos ainda mantêm o armazenamento local existente; este trabalho não migra escalas ou disponibilidades.

Referências: [Authentication com e-mail/senha](https://firebase.google.com/docs/auth/web/password-auth), [persistência de sessão](https://firebase.google.com/docs/auth/web/auth-state-persistence), [condições nas regras do Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).


## Aprovar ou recusar acesso pelo site

Administradores ativos vinculados a uma igreja acessam **Solicitações** no menu lateral ou pelo sino da barra superior. A lista consulta apenas pedidos da mesma `igrejaId`, com páginas de até 100 registros. O filtro de situação atua sobre a página atual. Use Atualizar para buscar pedidos novos.

Ao aprovar, a solicitação fica `aprovada` e o perfil da conta recebe `status: ativo` e o `perfilSolicitado` (Administrador ou Membro). Ao recusar, a solicitação fica `recusada` e o perfil fica `status: recusado`, sem acesso. A conta do Authentication é preservada. As duas mudanças ocorrem na mesma transação, com `decididoPor` e `decididoEm` registrados na solicitação. Pedidos já decididos não podem ser reprocessados por esta tela. Não se cria automaticamente um cadastro na coleção `membros`.

**Ativação no Firebase:** guarde as regras atuais e publique o conteúdo completo do arquivo `firestore.rules` em Firestore Database → Regras → Publicar. Essa é uma configuração única; aprovações posteriores são feitas no site. Não é necessário mudar cada usuário manualmente. Contas legadas sem `igrejaId` precisam receber um vínculo validado pela migração antes de gerenciar pedidos; não existe acesso global a solicitações de outras igrejas.

Somente administradores da mesma igreja podem decidir. As regras exigem perfil e pedido pendentes, identidade e igreja correspondentes, o papel originalmente solicitado e atualização conjunta dos dois documentos. Elas não permitem autoaprovação, promoção por edição do perfil pessoal nem aprovação por membro. A criação da primeira igreja com seu administrador inicial continua seguindo o fluxo de cadastro existente.


## Alterações acumuladas — Membro e Líder (publicação ao final)

Todas as regras anteriores e desta etapa estão consolidadas no arquivo único `firestore.rules`. Não há publicação automática e não é necessário publicar uma versão a cada alteração. Ao terminar o conjunto de mudanças, guardar as regras do console e publicar o arquivo completo uma vez, após os testes de segurança no emulador.

Na tela Membros, Função substitui a coluna de e-mail. O e-mail continua no formulário do pastor. O lápis permite ao administrador escolher Membro ou Líder. Para conceder acesso real de Líder, o cadastro da pessoa precisa estar vinculado a uma conta ativa de `usuarios` da mesma igreja: informar seu UID no formulário. O sistema não infere vínculo por nome/e-mail. Uma conta não pode ser vinculada simultaneamente a duas pessoas: `usuarios.membroId` registra o vínculo canônico e `membros.usuarioId` identifica a conta. Depois de vinculado, o formulário não permite trocar arbitrariamente a identidade.

Alterar a função grava `membros.funcao` e `usuarios.perfil` na mesma transação. Apenas perfis de acesso Membro/Líder podem ser alterados por esse fluxo; não rebaixa Administradores. Cadastros sem função explícita aparecem como Membro e podem continuar sem conta de acesso; nesse caso não recebem privilégios de liderança.

O Líder entra na área de vínculos com acesso a Membros, Ministérios e Células. Não possui acesso às telas de Solicitações, Configurações, Relatórios, Escalas ou Campanhas nesta etapa, conforme a restrição mais recente. O lápis de um membro permite somente selecionar/desvincular ministério, célula e banda existentes. Não permite cadastrar/excluir pessoas, alterar função, contatos, status ou identidade, nem criar/editar/excluir estruturas. As regras validam IDs dos grupos e sua igreja. A desvinculação preserva o cadastro e a conta.

Essa alteração não cria grupos nem transfere registros antigos. Pessoas de dados legados precisam ter igreja e vínculos consistentes. O controle de migração existente (`system/tenancy`) permanece nas regras. A tela não pede que você publique mudanças agora; até a publicação final, as operações novas podem ser recusadas pelas regras antigas.


## Página inicial do Líder

Contas ativas com `perfil: lider` passam a entrar em `pages/inicio-lider.html`. A página identifica o usuário como Líder, consulta cultos futuros da mesma `igrejaId` e oferece atalhos para Membros, Ministérios e Células. O link Início também aparece no menu das telas de vínculos. Não se atribui liderança de uma célula específica com base apenas no nome da pessoa: o cabeçalho identifica somente o perfil de Líder. A edição de vínculos e as restrições anteriores são preservadas. Esta página utiliza as permissões de leitura já existentes e não adiciona regras novas.

Atualização visual: a página inicial do Líder agora utiliza o mesmo layout administrativo de Membros/Ministérios/Células, com menu lateral, Topbar, perfil editável e cartões compartilhados. A navegação é construída pelo componente `leader-layout.js`. O conteúdo continua reduzido às funções do Líder; não há inclusão de permissões administrativas nem regras novas.
