import {eventStart} from './community-model.js';

export const openScale = (scale, now = new Date()) =>
  ['Agendada', 'Ativa', 'Pendente'].includes(scale?.status) && eventStart(scale) > now;

export function assignments(scale) {
  return (Array.isArray(scale.designacoes) ? scale.designacoes : []).filter(row =>
    row && typeof row.membroId === 'string' && row.membroId &&
    !/^(cancelad[ao]|recusad[ao]|removid[ao]|pendente)$/i.test(row.status || ''));
}

export function scaleIndicators(scale, responses, now = new Date()) {
  const latest = new Map();
  const timestamp = row => row.atualizadoEm?.toMillis?.() ??
    (Date.parse(row.atualizadoEm) || (row.atualizadoEm?.seconds || 0) * 1000);
  for (const row of responses) {
    if (!row.usuarioId || row.escalaId !== scale.id || row.igrejaId !== scale.igrejaId) continue;
    const previous = latest.get(row.usuarioId);
    if (!previous || timestamp(row) > timestamp(previous) ||
      (timestamp(row) === timestamp(previous) && row.disponivel === false)) latest.set(row.usuarioId, row);
  }
  const current = [...latest.values()];
  const matches = row => row.data === scale.data && row.horario === scale.horario;
  const open = openScale(scale, now);
  const available = open ? current.filter(row => row.disponivel === true && matches(row)).map(row => row.usuarioId).sort() : [];
  const unavailable = open ? current.filter(row => row.disponivel === false && row.status === 'indisponivel' && matches(row)).length : 0;
  const reconfirm = open ? current.filter(row => row.disponivel === true && !matches(row)).length : 0;
  const assigned = assignments(scale);
  const slots = new Set((Array.isArray(scale.vagas) ? scale.vagas : []).map(row => row?.id).filter(Boolean));
  const filled = new Set(assigned.map(row => slots.size ? row.vagaId : row.vagaId || row.membroId)
    .filter(id => id && (!slots.size || slots.has(id)))).size;
  const demand = Number.isSafeInteger(scale.servicos) && scale.servicos >= 0 ? scale.servicos : null;
  return {available, unavailable, reconfirm, assigned: [...new Set(assigned.map(row => row.membroId))],
    filled, demand, coverage: demand > 0 ? Math.round(100 * available.length / demand) : null};
}

export function overlaps(a, b) {
  if (a.data !== b.data) return false;
  if (a.horario === b.horario) return true;
  const validEnd = row => /^([01]\d|2[0-3]):[0-5]\d$/.test(row.horarioFim) && row.horarioFim > row.horario;
  return validEnd(a) && validEnd(b) && a.horario < b.horarioFim && b.horario < a.horarioFim;
}
