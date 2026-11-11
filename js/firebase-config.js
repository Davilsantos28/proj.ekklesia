import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQLJijel2cGiCS3_H77xorhT62DW_xE-Y",
  authDomain: "ekklesia-10ccf.firebaseapp.com",
  projectId: "ekklesia-10ccf",
  storageBucket: "ekklesia-10ccf.firebasestorage.app",
  messagingSenderId: "805502397034",
  appId: "1:805502397034:web:7f2f3b766b30fbf75ff813"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
export { app, db, auth, firebaseConfig };
