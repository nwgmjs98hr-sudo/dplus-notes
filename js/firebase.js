// Firebase backend: login + Firestore with offline cache on the device.
import { FIREBASE_VERSION } from './config.js';

const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

export async function firebaseBackend(config) {
  const [appM, authM, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'),
  ]);
  const app = appM.initializeApp(config);
  // Email/password only: no popup/redirect helper, so starting offline never waits for the network.
  const auth = authM.initializeAuth(app, { persistence: [authM.indexedDBLocalPersistence, authM.browserLocalPersistence] });
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    console.warn('Offline cache not available, using memory cache', e);
    db = fs.getFirestore(app);
  }
  const ref = (uid, col, id) => fs.doc(db, 'users', uid, col, id);

  return {
    kind: 'firebase',
    onAuth(cb) { authM.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); },
    signIn(email, pw) { return authM.signInWithEmailAndPassword(auth, email, pw); },
    async signOut() {
      await authM.signOut(auth);
      try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (e) { console.warn(e); }
    },
    watch(uid, col, cb, onErr) {
      return fs.onSnapshot(
        fs.collection(db, 'users', uid, col),
        { includeMetadataChanges: true },
        snap => cb(
          snap.docChanges().map(c => ({ type: c.type, id: c.doc.id, data: c.doc.data() })),
          { pending: snap.metadata.hasPendingWrites, cache: snap.metadata.fromCache },
        ),
        err => { console.error('snapshot', col, err); onErr?.(err); },
      );
    },
    set(uid, col, id, data) { fs.setDoc(ref(uid, col, id), data).catch(e => console.error('write failed', e)); },
    del(uid, col, id) { fs.deleteDoc(ref(uid, col, id)).catch(e => console.error('delete failed', e)); },
  };
}
