import { getAI, getGenerativeModel, GoogleAIBackend } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import { app, appCheckSiteKey } from './firebase-config.js';

const types = new Set(['Aviso', 'Convite', 'Campanha', 'Agradecimento']);
const audiences = new Set(['Comunidade toda', 'Membros', 'Visitantes']);
const tones = new Set(['Acolhedor', 'Formal', 'Animado', 'Inspirador']);
let appCheckInitialized = false;

function clean(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

export async function generateChurchText({ type, audience, tone, subject, details }) {
  subject = clean(subject, 120);
  details = clean(details, 700);
  if (!types.has(type) || !audiences.has(audience) || !tones.has(tone) || subject.length < 3 || details.length < 10) {
    throw new Error('Preencha o assunto e explique o que o texto precisa comunicar.');
  }
  if (!appCheckSiteKey) {
    throw new Error('A IA precisa ser configurada no Firebase antes do primeiro uso. Falta a chave pública do App Check.');
  }
  if (!appCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
    appCheckInitialized = true;
  }

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash-lite',
    generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
  });
  const prompt = [
    'Você é um assistente de redação para uma igreja cristã no Brasil.',
    'Escreva apenas um rascunho em português brasileiro, claro, acolhedor e apropriado ao contexto.',
    'Não invente datas, horários, endereços, valores, links, nomes, promessas ou citações bíblicas.',
    'Use somente as informações fornecidas. Se faltar um dado essencial, deixe um marcador entre colchetes para revisão.',
    'Não inclua explicações sobre como você escreveu o texto.',
    `Tipo de texto: ${type}.`,
    `Público: ${audience}.`,
    `Tom: ${tone}.`,
    `Assunto: ${subject}.`,
    `Informações que devem aparecer: ${details}.`
  ].join('\n');

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (!text) throw new Error('A IA não retornou um texto. Tente novamente.');
    return text;
  } catch (error) {
    if (error.message?.includes('App Check') || error.code?.includes('app-check')) {
      throw new Error('A proteção App Check ainda não está ativa para esta página. Confira a configuração do Firebase.');
    }
    throw new Error('Não foi possível gerar o texto agora. Confira a configuração da IA e tente novamente.');
  }
}
