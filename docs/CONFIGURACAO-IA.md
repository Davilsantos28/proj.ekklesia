# Configuração da IA no Ekklesia

O Ekklesia usa o Firebase AI Logic para criar rascunhos de avisos, convites, campanhas e agradecimentos. O assistente recebe somente os campos digitados nesta tela; não consulta o Firestore e não salva os textos no banco.

## Configuração necessária no Firebase

1. No projeto `ekklesia-10ccf`, habilite o Firebase AI Logic e escolha o backend Gemini Developer API.
2. Em **App Check**, registre o app Web com reCAPTCHA Enterprise.
3. Copie a **site key pública** do reCAPTCHA Enterprise para `appCheckSiteKey` em `js/firebase-config.js`.
4. Mantenha o App Check aplicado ao Firebase AI Logic. Para testes locais, use um app de desenvolvimento e o [provedor de depuração do App Check](https://firebase.google.com/docs/app-check/web/debug-provider), com o token registrado no Console e mantido fora do repositório.

O assistente fica disponível para administradores na tela **Configurações**. O texto gerado é um rascunho editável; a pessoa deve revisar antes de copiar e compartilhar.

## Agente de escalas

O agente usa a sessão já autenticada e verifica no Firestore se o perfil é de administrador ativo com `igrejaId`. As leituras de `escalas`, `disponibilidades`, `usuarios` e `membros` usam as permissões existentes. São considerados eventos que se sobrepõem no mesmo dia e até 90 dias de escalas concluídas. Sem horário de término, só se comparam inícios coincidentes.

O JavaScript calcula os indicadores e dá códigos temporários aos candidatos e vagas. O Gemini 3.5 Flash-Lite recebe esses códigos, totais e restrições operacionais. Nomes, contatos, observações e identificadores do Firestore ficam na aplicação. A resposta precisa ter o formato estruturado esperado. Uma distribuição com pessoa inexistente, indisponível, repetida ou incompatível com a vaga é rejeitada. O aplicativo também descarta a análise se os dados relevantes mudarem durante a chamada. A execução é somente leitura.

O sistema diferencia respostas canceladas, respostas que precisam de reconfirmação e designações formais. A disponibilidade atual registra aceite ou cancelamento. Uma contagem de indisponibilidades explícitas só é possível se esse dado estiver cadastrado. As designações e funções específicas são usadas quando a escala contém `designacoes` e `vagas` e o membro tem `funcoes`. A descrição de equipe em texto livre não comprova designações.

## Como demonstrar e verificar

1. Sirva a raiz do projeto com `py -m http.server 8000 --bind 127.0.0.1` e abra `http://localhost:8000`. Use uma igreja de teste com Firebase AI Logic e App Check configurados.
2. Entre como administrador, crie uma escala futura do tipo **Culto** e defina o número de serviços. Em uma sessão de membro da mesma igreja, confirme disponibilidade para esse culto.
3. Volte à área administrativa e abra **Escalas → Analisar disponibilidades com IA**. Selecione o culto e confira o total de pessoas disponíveis, a diferença para os serviços previstos e as sugestões retornadas.
4. Cancele uma disponibilidade ou altere o horário do culto. Confira a atualização do contador administrativo e execute outra análise para testar a reconfirmação.
5. Abra **Células** e use o ícone de olho. Confira as abas, os filtros de participantes e o retorno à lista. Para testar o cadastro, faça uma solicitação como membro e aprove-a em **Solicitações**. Para um cadastro anteriormente aprovado, use **Conferir vínculo em Membros** na solicitação.

O projeto traz `firestore.rules` com o vínculo obrigatório na aprovação e a projeção autorizada de `celulaId`. Valide a versão no emulador e compare com as regras publicadas antes de implantar. A correção de cadastro requer as regras atualizadas e a migração de igreja já concluída. O agente usa as permissões de leitura administrativas existentes.

`node --test tests/agente-escalas.test.mjs` testa o cálculo, o isolamento e a validação de respostas simuladas. A chave pública de App Check vazia impede a execução da integração real. O contador em tempo real está na visão administrativa. Para Líder e Membro, é necessária uma projeção agregada confiável com leitura por igreja, mantendo a coleção de respostas individuais protegida.

## Arquivos da implementação

- Novos módulos em `js/`: `agente-escalas.mjs`, `agente-firebase.js`, `agente-interface.js`, `scale-indicators.js` e `cell-detail.js`.
- Integrações ajustadas em `js/`: `access-requests.js`, `admin-bootstrap.js`, `admin-icons.js`, `ai-text-service.js`, `community-model.js`, `community-service.js`, `disponibilidades.js`, `gestao.js` e `portal-membro.js`.
- Interface e regras: `pages/escalas.html`, `pages/celulas.html`, `css/admin-theme.css` e `firestore.rules`.
- Testes novos: `tests/agente-escalas.test.mjs` e `tests/cell-participants.test.mjs`. Testes ajustados em `tests/`: `access-requests.test.cjs`, `admin-initialization.test.cjs`, `admin-visual.test.cjs`, `cadastro-ui.test.cjs`, `firestore-rules.test.cjs`, `leader-home.test.cjs` e `portal-ui.test.cjs`.
