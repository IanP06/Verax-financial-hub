import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isLocalLab = import.meta.env.VITE_LOCAL_LAB === 'true';
if (isLocalLab && (firebaseConfig.projectId !== 'demo-verax-lab' || !['localhost', '127.0.0.1'].includes(window.location.hostname))) {
    throw new Error('El laboratorio solo puede usar demo-verax-lab desde localhost.');
}
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

if (isLocalLab) {
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
    connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001);
    connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
}
