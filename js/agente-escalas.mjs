import {eventStart, normalize} from './community-model.js';
import {assignments as activeAssignments, openScale, overlaps, scaleIndicators} from './scale-indicators.js';

export class AgentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const validId = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 150 && !/[\/\u0000-\u001f]/.test(value) && !['.', '..'].includes(value);

export function assertAdmin(session) {
  if (session?.role !== 'admin' || !validId(session.igrejaId) || !validId(session.uid)) {
    throw new AgentError('unauthorized', 'A análise exige uma conta Firebase de administrador vinculada a uma igreja.');
  }
}

export function belongsTo(row, igrejaId) {
  return row.igrejaId === igrejaId;
}

function prepare({scale, members, responses, otherScales}, igrejaId, scaleId, now) {
  if (!scale || scale.id !== scaleId || !belongsTo(scale, igrejaId)) {
    throw new AgentError('missing', 'Escala não encontrada na sua igreja.');
  }
  if (!openScale(scale, now)) {
    throw new AgentError('missing', 'Selecione uma escala futura que ainda esteja aberta.');
  }
  if ([members, responses, otherScales].some(rows => rows.some(row => !belongsTo(row, igrejaId)))) {
    throw new AgentError('unauthorized', 'Foi encontrado um registro incompatível com a igreja da sessão.');
  }
  const memberById = new Map(members.map(row => [row.id, row]));
  const activeResponses = responses.filter(row => memberById.has(row.usuarioId));
  const stats = scaleIndicators(scale, activeResponses, now);
  const overlapping = otherScales.filter(other => other.id !== scaleId &&
    openScale(other, now) && overlaps(other, scale));
  const conflicts = new Set();
  const accountByMember = new Map(members.filter(row => row.membroId).map(row => [row.membroId, row.id]));
  for (const other of overlapping) {
    for (const id of scaleIndicators(other, activeResponses, now).available) conflicts.add(id);
    for (const {membroId} of activeAssignments(other)) conflicts.add(accountByMember.get(membroId));
  }
  const assigned = new Set(stats.assigned.map(id => accountByMember.get(id)));
  const hasAssignments = stats.assigned.length > 0 || overlapping.some(item => activeAssignments(item).length);
  const eligible = stats.available.filter(id => !assigned.has(id) && !conflicts.has(id) &&
    (!hasAssignments || memberById.get(id).membroId)).sort();
  const history = new Map();
  const completed = otherScales.filter(other => other.status === 'Concluída' && eventStart(other) && eventStart(other) < now);
  for (const other of completed) {
    for (const id of new Set(activeAssignments(other).map(row => row.membroId))) {
      history.set(id, (history.get(id) || 0) + 1);
    }
  }

  const gaps = stats.demand === null ? null : Math.max(0, stats.demand - stats.filled);
  const slots = Array.isArray(scale.vagas) ? scale.vagas : [];
  const validSlots = slots.every(slot => validId(slot?.id) && typeof slot.funcao === 'string' && slot.funcao.trim()) &&
    new Set(slots.map(slot => slot.id)).size === slots.length;
  const assignments = activeAssignments(scale);
  const occupied = new Set(assignments.map(row => row.vagaId));
  const mappedAssignments = assignments.every(row => slots.some(slot => slot.id === row.vagaId));
  const canUseSlots = slots.length && validSlots && mappedAssignments &&
    (stats.demand === null || slots.length === stats.demand) && stats.filled === occupied.size;
  const remaining = canUseSlots ? slots.filter(slot => !occupied.has(slot.id)) : [];
  const genericCount = !slots.length && assignments.length === stats.assigned.length ? (gaps ?? 0) : 0;
  const slotCount = remaining.length || genericCount;
  const suggestionsLimited = eligible.length > 100 || slotCount > 100;
  const suggestionsEnabled = !suggestionsLimited && slotCount > 0;
  const vacancies = !suggestionsEnabled ? [] : canUseSlots ? remaining :
    Array.from({length: genericCount}, () => ({funcao: null}));
  const candidates = suggestionsEnabled ? eligible.map((id, index) => {
    const member = memberById.get(id);
    return {
      code: 'P' + (index + 1),
      name: member.nome || 'Membro sem nome',
      allowed: vacancies.flatMap((slot, i) => !slot.funcao ||
        (Array.isArray(member.funcoes) && member.funcoes.includes(slot.funcao)) ? ['V' + (i + 1)] : []),
      sameMinistry: member.ministerio && scale.ministerio && normalize(scale.ministerio) !== 'geral'
        ? normalize(member.ministerio) === normalize(scale.ministerio) : null,
      history: member.membroId && completed.some(row => activeAssignments(row).length) ? (history.get(member.membroId) || 0) : null
    };
  }) : [];
  const metrics = {
    demand: stats.demand, available: stats.available.length, unavailable: stats.unavailable,
    assigned: stats.assigned.length, filled: stats.filled, coverage: stats.coverage, gaps,
    conflicts: stats.available.filter(id => conflicts.has(id)).length, reconfirm: stats.reconfirm,
    candidates: eligible.length
  };
  const limitations = [];
  if (stats.demand === null) limitations.push('A quantidade de serviços previstos não foi informada.');
  if (!slots.length) limitations.push('Não há funções por vaga cadastradas. As sugestões representam vagas genéricas.');
  else if (!canUseSlots) limitations.push('As vagas ou designações não permitem identificar com segurança as funções em aberto.');
  if (!candidates.some(candidate => candidate.history !== null)) limitations.push('Não há histórico vinculado aos candidatos no período consultado.');
  if (!scale.horarioFim) limitations.push('Sem horário final, só é possível detectar inícios coincidentes.');
  if (suggestionsLimited) limitations.push('O volume de vagas ou candidatos excede o limite de sugestões desta análise.');
  if (hasAssignments && stats.available.some(id => !memberById.get(id).membroId)) {
    limitations.push('Contas sem cadastro de membro vinculado não entram nas sugestões quando há designações a conferir.');
  }
  if (remaining.length && !candidates.some(candidate => candidate.allowed.length)) {
    limitations.push('Não há candidatos com funções cadastradas que correspondam às vagas abertas.');
  }
  return {
    scale: {name: scale.nome || 'Escala sem nome', date: scale.data, time: scale.horario},
    metrics, candidates, vacancies, limitations,
    // Dados enviados ao Gemini. Nomes, contatos, observações e IDs ficam no sistema.
    modelInput: {
      ...metrics, day: scale.data, start: scale.horario, limitations,
      vacancies: vacancies.map((_, index) => 'V' + (index + 1)),
      candidates: candidates.map(({code, allowed, history, sameMinistry}) => ({code, allowed, history, sameMinistry}))
    },
    ids: eligible
  };
}

function validateResponse(raw, context) {
  const invalid = () => new AgentError('invalid-response', 'O Gemini retornou uma análise inválida. Solicite uma nova análise.');
  let result;
  try { result = JSON.parse(raw); } catch { throw invalid(); }
  const shortText = value => typeof value === 'string' && value.trim() && value.length <= 2500;
  if (!shortText(result?.analise) || !Array.isArray(result.recomendacoes) ||
      result.recomendacoes.length > 8 || !result.recomendacoes.every(shortText) ||
      !Array.isArray(result.distribuicao) || result.distribuicao.length > context.vacancies.length) throw invalid();

  const usedCandidates = new Set();
  const usedSlots = new Set();
  const suggestions = result.distribuicao.map(item => {
    const candidate = context.candidates.find(row => row.code === item?.pessoa);
    if (!candidate || !candidate.allowed.includes(item.vaga) || usedCandidates.has(item.pessoa) ||
        usedSlots.has(item.vaga) || !shortText(item.justificativa)) throw invalid();
    usedCandidates.add(item.pessoa);
    usedSlots.add(item.vaga);
    return {
      member: candidate.name,
      slot: context.vacancies[Number(item.vaga.slice(1)) - 1].funcao || 'Vaga ' + item.vaga.slice(1),
      reason: item.justificativa
    };
  });
  return {analysis: result.analise, recommendations: result.recomendacoes, suggestions};
}

export async function analyzeScale({scaleId, getSession, read, generate, now = () => new Date()}) {
  const session = await getSession();
  assertAdmin(session);
  if (!validId(scaleId)) throw new AgentError('missing', 'Selecione uma escala válida.');
  const loadContext = async () => prepare(await read(session.igrejaId, scaleId, now()), session.igrejaId, scaleId, now());
  const snapshot = await loadContext();
  const verifySession = async () => {
    const current = await getSession();
    assertAdmin(current);
    if (current.uid !== session.uid || current.igrejaId !== session.igrejaId) {
      throw new AgentError('unauthorized', 'A sessão mudou durante a análise.');
    }
  };
  await verifySession();
  const raw = await generate(snapshot.modelInput, session);
  await verifySession();
  const current = await loadContext();
  await verifySession();
  if (JSON.stringify(snapshot) !== JSON.stringify(current)) {
    throw new AgentError('stale', 'Os dados da escala mudaram durante a análise. Solicite uma nova análise.');
  }
  const {scale, metrics, limitations} = snapshot;
  return {scale, metrics, limitations, ...validateResponse(raw, snapshot)};
}
