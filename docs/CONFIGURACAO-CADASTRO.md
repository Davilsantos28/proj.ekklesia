# Cadastro e acesso — Ekklesia

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
