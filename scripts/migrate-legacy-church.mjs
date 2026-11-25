import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = 'ekklesia-10ccf';
const churchName = 'IGREJA DA ARVORE';
const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
const apply = process.argv.includes('--apply');
const modules = [
  'membros', 'bandas', 'ministerios', 'celulas', 'escalas', 'campanhas',
  'comunidadeMembros', 'disponibilidades', 'usuarios'
];

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Uso: node scripts/migrate-legacy-church.mjs [--apply]');
    console.log('Sem --apply, apenas confere quantos documentos seriam vinculados.');
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const churchMatches = await db.collection('igrejas')
    .where('nomeNormalizado', '==', normalize(churchName)).get();
  if (churchMatches.size > 1) throw new Error('Há mais de uma igreja com esse nome normalizado. Resolva a duplicidade antes da migração.');

  const proposedId = 'igreja-da-arvore';
  const churchRef = churchMatches.empty ? db.collection('igrejas').doc(proposedId) : churchMatches.docs[0].ref;
  const migrationRef = db.doc('system/tenancy');
  const migrationState = await migrationRef.get();
  if (migrationState.exists && migrationState.data().churchId !== churchRef.id) {
    throw new Error('A migração global já aponta para outra igreja. Nenhum dado foi alterado.');
  }
  const existingChurch = churchMatches.empty ? await churchRef.get() : churchMatches.docs[0];
  if (existingChurch.exists && normalize(existingChurch.data().nome) !== normalize(churchName)) {
    throw new Error(`O ID ${churchRef.id} já pertence a outra igreja. Nenhum dado foi alterado.`);
  }
  if (existingChurch.exists && !['ativa', 'ativo'].includes(existingChurch.data().status)) {
    throw new Error('A igreja encontrada não está ativa. Nenhum dado foi alterado.');
  }

  const snapshots = await Promise.all(modules.map(async name => [name, await db.collection(name).get()]));
  const conflicts = [];
  const counts = [];
  let activeAdministrators = 0;
  for (const [name, snapshot] of snapshots) {
    let pending = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      if (data.igrejaId && data.igrejaId !== churchRef.id) conflicts.push(`${name}/${document.id}`);
      if (!data.igrejaId) pending++;
      if (name === 'usuarios' && data.perfil === 'administrador' && data.status === 'ativo') activeAdministrators++;
    }
    counts.push({ name, total: snapshot.size, pending });
  }
  if (conflicts.length) {
    throw new Error(`Encontrei ${conflicts.length} documento(s) já vinculado(s) a outra igreja. Nenhum dado foi alterado.`);
  }
  if (!activeAdministrators) throw new Error('Não encontrei administrador ativo em usuarios. Nenhum dado foi alterado.');

  console.log(`Projeto Firebase: ${projectId}`);
  console.log(`Igreja de destino: ${churchName} (${churchRef.id})`);
  for (const { name, total, pending } of counts) console.log(`${name}: ${pending} de ${total} documento(s) receberiam igrejaId`);
  if (!apply) {
    console.log('Prévia concluída; nenhum dado foi alterado. Revise e execute com --apply para gravar apenas o campo igrejaId.');
    return;
  }
  console.log('Use --apply durante uma janela de manutenção; não edite registros enquanto a migração estiver rodando.');

  const writer = db.bulkWriter();
  for (const [name, snapshot] of snapshots) {
    if (name === 'usuarios') continue;
    for (const document of snapshot.docs) {
      if (!document.data().igrejaId) writer.update(document.ref, { igrejaId: churchRef.id });
    }
  }
  await writer.close();

  const userWriter = db.bulkWriter();
  for (const document of snapshots.find(([name]) => name === 'usuarios')[1].docs) {
    if (!document.data().igrejaId) userWriter.update(document.ref, { igrejaId: churchRef.id });
  }
  await userWriter.close();

  if (!existingChurch.exists) {
    await churchRef.create({
      nome: churchName,
      nomeNormalizado: normalize(churchName),
      status: 'ativa',
      criadoEm: FieldValue.serverTimestamp()
    });
  }
  await migrationRef.set({
    migrationComplete: true,
    churchId: churchRef.id,
    completedAt: FieldValue.serverTimestamp()
  });
  console.log('Migração concluída. Os documentos originais foram mantidos; apenas igrejaId foi acrescentado.');
  console.log('O marcador system/tenancy libera gravações isoladas somente após todos os vínculos serem gravados.');
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
