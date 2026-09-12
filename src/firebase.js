import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDS-vjnRiGnSbLrUpAqNm-7ytlsDzXm5hE',
  authDomain: 'glassy-acolyte-472202-h0.firebaseapp.com',
  projectId: 'glassy-acolyte-472202-h0',
  storageBucket: 'glassy-acolyte-472202-h0.firebasestorage.app',
  messagingSenderId: '1032418782692',
  appId: '1:1032418782692:web:9a265435183409ee8aabf1'
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
