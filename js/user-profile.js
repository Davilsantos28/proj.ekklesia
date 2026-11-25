import {auth,db} from './firebase-config.js';
import {doc,updateDoc} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {adminIcon} from './admin-icons.js';
export function mountUserProfile(profile) {
 const trigger=document.querySelector('.user-profile');if(!trigger)return;
 const dialog=document.createElement('dialog');dialog.id='user-profile-dialog';dialog.setAttribute('aria-labelledby','profile-title');
 dialog.innerHTML='<div class="dialog-heading"><h2 id="profile-title">Meu perfil</h2><button type="button" class="icon-button" aria-label="Fechar perfil">'+adminIcon('close')+'</button></div><form id="user-profile-form"><div class="profile-photo-area"><img id="profile-photo-preview" alt="Prévia da foto" hidden><span id="profile-photo-initial"></span><div><label for="profile-photo">Foto do perfil</label><input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP. Até 5 MB; a foto será reduzida.</small><button type="button" class="button secondary" id="remove-profile-photo">Remover foto</button></div></div><div class="form-grid"><div class="field full"><label for="profile-name">Nome</label><input id="profile-name" name="nome" required minlength="2" maxlength="120" autocomplete="name"></div><div class="field"><label for="profile-phone">Telefone</label><input id="profile-phone" name="telefone" type="tel" maxlength="30" autocomplete="tel"></div><div class="field"><label for="profile-email">E-mail de acesso</label><input id="profile-email" type="email" readonly></div><div class="field full"><label for="profile-description">Sobre mim</label><textarea id="profile-description" name="descricao" maxlength="500" rows="3" placeholder="Escreva uma breve apresentação"></textarea></div></div><p id="profile-feedback" role="status" tabindex="-1"></p><div class="dialog-actions"><button type="button" class="button secondary" id="cancel-profile">Cancelar</button><button type="submit" class="button" id="save-profile">Salvar perfil</button></div></form>';
 document.body.append(dialog);const $=s=>dialog.querySelector(s);let photo=profile.foto||'';let busy=false;let photoRequest=0;
 function preview(){const img=$('#profile-photo-preview');img.hidden=!photo;$('#profile-photo-initial').hidden=!!photo;$('#profile-photo-initial').textContent=(profile.nome||'U').slice(0,1).toUpperCase();if(photo)img.src=photo;else img.removeAttribute('src');}
 function avatar(){trigger.querySelector('.user-info strong').textContent=profile.nome;const n=trigger.querySelector('.user-avatar');n.replaceChildren();if(profile.foto){const img=document.createElement('img');img.src=profile.foto;img.alt='';n.append(img);}else n.textContent=profile.nome.slice(0,1).toUpperCase();}
 function feedback(message){$('#profile-feedback').textContent=message;}
 function open(){if(busy)return;$('#save-profile').disabled=false;photoRequest++;photo=profile.foto||'';$('#user-profile-form').reset();$('#profile-name').value=profile.nome||'';$('#profile-phone').value=profile.telefone||'';$('#profile-description').value=profile.descricao||'';$('#profile-email').value=profile.email||auth.currentUser?.email||'';feedback('');preview();dialog.showModal();}
 trigger.setAttribute('role','button');trigger.setAttribute('aria-label','Abrir meu perfil');trigger.setAttribute('aria-haspopup','dialog');trigger.tabIndex=0;trigger.onclick=open;trigger.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();open();}};
 dialog.querySelector('.dialog-heading button').onclick=()=>dialog.close();$('#cancel-profile').onclick=()=>dialog.close();
 $('#remove-profile-photo').onclick=()=>{photoRequest++;if(!busy)$('#save-profile').disabled=false;photo='';$('#profile-photo').value='';preview();};
 $('#profile-photo').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;const request=++photoRequest;$('#save-profile').disabled=true;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Escolha JPG, PNG ou WebP com até 5 MB.');
   const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);bitmap.close();
   const image=canvas.toDataURL('image/jpeg',.8);if(image.length>120000)throw new Error('Não foi possível reduzir a foto. Escolha outra imagem.');
   if(request===photoRequest){photo=image;preview();feedback('Foto pronta. Clique em Salvar perfil para confirmar.');}
  }catch(error){if(request===photoRequest)feedback(error.message||'Não foi possível abrir a imagem.');}
  finally{if(request===photoRequest)$('#save-profile').disabled=false;}
 };
 $('#user-profile-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;$('#save-profile').disabled=true;
  const values={nome:$('#profile-name').value.trim(),telefone:$('#profile-phone').value.trim(),descricao:$('#profile-description').value.trim(),foto:photo};
  try{if(values.nome.length<2)throw new Error('Informe seu nome com pelo menos 2 caracteres.');await updateDoc(doc(db,'usuarios',auth.currentUser.uid),values);Object.assign(profile,values);avatar();feedback('Perfil salvo.');}
  catch(error){feedback(error.code==='permission-denied'?'Não foi possível salvar. As regras de edição do perfil precisam ser publicadas no Firebase.':error.code?'Falha ao salvar. Confira sua conexão e tente novamente.':error.message);}
  finally{busy=false;$('#save-profile').disabled=false;}
 };avatar();
}
