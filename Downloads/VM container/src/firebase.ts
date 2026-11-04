import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function getFirebaseServices() {
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'] as const
  const missing = requiredKeys.filter((key) => !config[key])

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase settings: ${missing.join(', ')}. Copy .env.example to .env and fill in your Firebase web app config.`,
    )
  }

  const app =
    getApps().find((existingApp) => existingApp.name === '[DEFAULT]') ??
    initializeApp(config)

  return {
    auth: getAuth(app),
    db: initializeFirestore(app, { experimentalForceLongPolling: true }),
  }
}
