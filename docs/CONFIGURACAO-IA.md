# Configuração do assistente de textos com IA

O Ekklesia usa o Firebase AI Logic para criar rascunhos de avisos, convites, campanhas e agradecimentos. O assistente recebe somente os campos digitados nesta tela; não consulta o Firestore e não salva os textos no banco.

## Configuração necessária no Firebase

1. No projeto `ekklesia-10ccf`, habilite o Firebase AI Logic e escolha o backend Gemini Developer API.
2. Em **App Check**, registre o app Web com reCAPTCHA Enterprise.
3. Copie a **site key pública** do reCAPTCHA Enterprise para `appCheckSiteKey` em `js/firebase-config.js`.
4. Configure a chave secreta do reCAPTCHA Enterprise apenas no Console do Firebase. Nunca coloque a chave secreta no código do site.
5. Ative a aplicação do App Check para Firebase AI Logic. Inclua `localhost` entre os domínios permitidos enquanto estiver testando localmente.

O assistente fica disponível para administradores na tela **Configurações**. O texto gerado é um rascunho editável; a pessoa deve revisar antes de copiar e compartilhar.
