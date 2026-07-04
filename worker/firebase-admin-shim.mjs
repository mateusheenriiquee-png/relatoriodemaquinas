// Minimal shim for `firebase-admin` so Cloudflare Workers bundling succeeds.
// At runtime this shim throws informative errors for admin operations because
// the official `firebase-admin` SDK cannot run inside Cloudflare Workers.

function notSupported() {
  throw new Error(
    "firebase-admin is not supported in Cloudflare Workers. Use the Firebase REST APIs or run this code in a Node environment."
  );
}

const shim = {
  apps: [],
  initializeApp: () => {
    console.warn("[firebase-admin-shim] initializeApp() called — shim in use");
    const app = { name: "shim" };
    shim.apps.push(app);
    return app;
  },
  app: () => ({ name: "shim" }),
  credential: {
    cert: () => ({ /* no-op */ })
  },
  auth: (app) => ({
    createUser: async () => notSupported(),
    updateUser: async () => notSupported(),
    deleteUser: async () => notSupported(),
    verifyIdToken: async () => notSupported(),
    // other auth methods can be added if needed
  }),
  firestore: (app) => ({
    collection: () => ({
      doc: () => ({
        set: async () => notSupported(),
        update: async () => notSupported(),
        delete: async () => notSupported()
      })
    })
  })
};

export default shim;
