// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAVTdyvPs6rj04P8YszZc_V5CejEqZ67ig",
  authDomain: "base64toimg.firebaseapp.com",
  databaseURL: "https://base64toimg-default-rtdb.firebaseio.com",
  projectId: "base64toimg",
  storageBucket: "base64toimg.firebasestorage.app",
  messagingSenderId: "128235407609",
  appId: "1:128235407609:web:1a70d8bec5aaac3e79ba28",
  measurementId: "G-E66JSM3YQB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore with native persistent offline cache enabled
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Conditionally initialize analytics so it never crashes the app
let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };
export default app;