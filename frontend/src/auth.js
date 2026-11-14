// Google sign-in (Firebase), used only to sync the shortlist. Firebase is loaded on demand, so it never slows
// the first page for someone who hasn't signed in. Without the VITE_FIREBASE_* settings, sign-in is hidden.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const authEnabled = Boolean(config.apiKey);

let loaded;
export function firebase() {
  loaded ??= Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore/lite")])
    .then(([app, auth, store]) => {
      const fb = app.initializeApp(config);
      return { ...auth, ...store, auth: auth.getAuth(fb), db: store.getFirestore(fb) };
    })
    .catch((e) => { loaded = null; throw e; });  // a failed download (offline) can be retried on the next click
  return loaded;
}

// A hint that this browser has a session, so Firebase is loaded at startup only for people who signed in.
const HINT = "signed-in";
export const hadSession = () => { try { return localStorage.getItem(HINT) === "1"; } catch { return false; } };
const hint = (on) => { try { on ? localStorage.setItem(HINT, "1") : localStorage.removeItem(HINT); } catch { /* no storage */ } };

export async function watchUser(onChange) {
  const { auth, onAuthStateChanged } = await firebase();
  return onAuthStateChanged(auth, (user) => { hint(!!user); onChange(user); });
}

export async function signIn() {
  const { auth, signInWithPopup, GoogleAuthProvider } = await firebase();
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOut() {
  const { auth, signOut: out } = await firebase();
  await out(auth);
}

// The whole list lives in one doc per user: users/{uid} = { shortlist, updated_at }. Only the uid and
// professor ids are stored, never the name or email. firestore.rules limits each user to their own doc.
export async function loadList(uid) {
  const { db, doc, getDoc } = await firebase();
  return (await getDoc(doc(db, "users", uid))).data()?.shortlist ?? [];
}

export async function saveList(uid, shortlist) {
  const { db, doc, setDoc, serverTimestamp } = await firebase();
  await setDoc(doc(db, "users", uid), { shortlist, updated_at: serverTimestamp() });
}
