export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function publicMember(row) {
  // Lista explícita: nunca copiar contatos ou outros campos privados.
  return Object.fromEntries(['nome', 'ministerio', 'celula', 'banda', 'status'].map(key => [key, String(row[key] || '')]));
}
export function safePaymentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function eventStart(row) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.horario || '')) return null;
  const day = new Date(row.data + 'T12:00:00Z');
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== row.data) return null;
  return new Date(row.data + 'T' + row.horario + ':00-03:00');
}
export function isOpenWorship(row, now = new Date()) {
  return row?.tipo === 'Culto' && ['Agendada', 'Ativa', 'Pendente'].includes(row.status) && eventStart(row) > now;
}
export function availabilityState(record, scale, now = new Date()) {
  if (!record.disponivel) return 'Cancelada';
  if (!scale) return 'Culto removido';
  if (['Concluída', 'Cancelada'].includes(scale.status)) return 'Encerrada';
  if (scale.tipo !== 'Culto') return 'Evento alterado';
  if (record.data !== scale.data || record.horario !== scale.horario) return 'Reconfirmar';
  return eventStart(scale) > now ? 'Confirmada' : 'Data passada';
}
