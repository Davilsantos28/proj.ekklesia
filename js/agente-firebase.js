import {getGenerativeModel, Schema} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
import {collection, doc, getDocFromServer, getDocsFromServer, limit, query, where} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {auth, db} from './firebase-config.js';
import {isAdministrator, readProfile} from './auth-service.js';
import {getChurchAI} from './ai-text-service.js';
import {AgentError, assertAdmin, belongsTo, validId} from './agente-escalas.mjs';
import {openScale} from './scale-indicators.js';

export async function getSession() {
  const user = auth.currentUser;
  if (!user) return null;
  const profile = await readProfile(user);
  return auth.currentUser === user && isAdministrator(profile)
    ? {uid: user.uid, role: 'admin', igrejaId: profile.igrejaId} : null;
}

const row = snapshot => ({...snapshot.data(), id: snapshot.id});
async function scopedRows(name, igrejaId, ...filters) {
  const snapshot = await getDocsFromServer(query(collection(db, name), where('igrejaId', '==', igrejaId), limit(1001), ...filters));
  if (snapshot.size > 1000) throw new AgentError('limit', 'A consulta excedeu o limite de registros da análise.');
  return snapshot.docs.map(row);
}

export async function listScales() {
  const session = await getSession();
  assertAdmin(session);
  const rows = await scopedRows('escalas', session.igrejaId);
  return rows.filter(scale => belongsTo(scale, session.igrejaId) && openScale(scale))
    .sort((a,b) => (a.data + a.horario).localeCompare(b.data + b.horario));
}

export async function read(igrejaId, scaleId, now) {
  const session = await getSession();
  assertAdmin(session);
  if (session.igrejaId !== igrejaId || !validId(scaleId)) throw new AgentError('unauthorized', 'Escala inválida para esta igreja.');
  const scales = await scopedRows('escalas', igrejaId);
  const scale = scales.find(item => item.id === scaleId);
  if (!scale || !openScale(scale, now)) throw new AgentError('missing', 'A escala não está aberta na sua igreja.');
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);
  const otherScales = scales.filter(item => item.id !== scaleId &&
    (item.data === scale.data || (item.status === 'Concluída' && item.data >= cutoff.toISOString().slice(0,10))));
  const [current, sameDay] = await Promise.all([
    scopedRows('disponibilidades', igrejaId, where('escalaId', '==', scaleId)),
    scopedRows('disponibilidades', igrejaId, where('data', '==', scale.data))
  ]);
  const responses = [...new Map([...sameDay, ...current].map(item => [item.id, item])).values()];
  const ids = [...new Set(responses.map(item => item.usuarioId).filter(validId))];
  const members = [];
  for (let i = 0; i < ids.length; i += 20) {
    const accounts = await Promise.all(ids.slice(i, i + 20).map(async id => {
      try {
        const account = await getDocFromServer(doc(db, 'usuarios', id));
        if (!account.exists()) return null;
        const profile = row(account);
        if (!belongsTo(profile, igrejaId) || profile.status !== 'ativo' || !['membro','lider'].includes(profile.perfil)) return null;
        const person = validId(profile.membroId) ? await getDocFromServer(doc(db, 'membros', profile.membroId)) : null;
        if (person?.exists() && belongsTo(person.data(), igrejaId) && person.data().usuarioId === id) {
          if (person.data().status === 'Inativo') return null;
          return {id, igrejaId, nome: person.data().nome, membroId: person.id,
            funcoes: person.data().funcoes, ministerio: person.data().ministerio};
        }
        return {id, igrejaId, nome: profile.nome, ministerio: profile.ministerio};
      } catch (error) {
        if (error.code === 'permission-denied') return null;
        throw error;
      }
    }));
    members.push(...accounts.filter(Boolean));
  }
  return {scale, otherScales, responses, members};
}

export async function generate(context, expectedSession) {
  const session = await getSession();
  assertAdmin(session);
  if (session.uid !== expectedSession.uid || session.igrejaId !== expectedSession.igrejaId) {
    throw new AgentError('unauthorized', 'A sessão mudou durante a análise.');
  }
  const model = getGenerativeModel(getChurchAI(), {
    model: 'gemini-3.5-flash-lite',
    systemInstruction: [
      'Analise escalas do Ekklesia em português brasileiro usando somente os indicadores recebidos.',
      'Diferencie disponibilidade potencial e vagas preenchidas. Explique lacunas, conflitos e reconfirmações.',
      'Recomende ações úteis mesmo se faltarem participantes ou dados. Nunca invente funções, pessoas ou números.',
      'Distribua somente códigos de pessoa e vaga permitidos, cada um no máximo uma vez.',
      'Prefira menor frequência histórica quando disponível. Se não houver distribuição segura use uma lista vazia.',
      'A indicação de mesmo ministério é um critério de preferência e não comprova uma função.',
      'Use os códigos somente nos campos pessoa e vaga. A decisão final é do administrador.'
    ].join(' '),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: Schema.object({properties: {
        analise: Schema.string(),
        recomendacoes: Schema.array({items: Schema.string()}),
        distribuicao: Schema.array({items: Schema.object({properties: {
          pessoa: Schema.string(), vaga: Schema.string(), justificativa: Schema.string()
        }})})
      }})
    }
  }, {timeout: 45000});
  const result = await model.generateContent(JSON.stringify(context));
  return result.response.text();
}
