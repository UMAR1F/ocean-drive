import { getAnalytics, isSupported } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCbVYP0VtIfZDZmueF-TaNr1ejPIjm5XP4',
  authDomain: 'nhealthfitness-9f0d0.firebaseapp.com',
  databaseURL: 'https://nhealthfitness-9f0d0-default-rtdb.firebaseio.com',
  projectId: 'nhealthfitness-9f0d0',
  storageBucket: 'nhealthfitness-9f0d0.firebasestorage.app',
  messagingSenderId: '72072154106',
  appId: '1:72072154106:web:354b7788a3df6d8197f243',
  measurementId: 'G-N0THSN228M',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
export default app;
