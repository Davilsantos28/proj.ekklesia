import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQLJijel2cGiCS3_H77xorhT62DW_xE-Y",
  authDomain: "ekklesia-10ccf.firebaseapp.com",
  projectId: "ekklesia-10ccf",
  storageBucket: "ekklesia-10ccf.firebasestorage.app",
  messagingSenderId: "805502397034",
  appId: "1:805502397034:web:7f2f3b766b30fbf75ff813"
};

const app = initializeApp(firebaseConfig);

console.log("🔥 Firebase conectado com sucesso!", app);

const db = getFirestore(app);

console.log("🔥 Firestore conectado com sucesso!", db);

export { app, db };