const ORDER_KEY = "wa_label_orders_v1";
const FROM_KEY = "wa_label_from_v1";

let firebaseReady = false;
let db = null;
let connectPromise = null;
let ordersCache = [];
const ordersListeners = new Set();

function notifyOrdersListeners() {
  const snapshot = [...ordersCache];
  ordersListeners.forEach((listener) => listener(snapshot));
}

function loadOrdersLocal() {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function loadFromAddressLocal() {
  const defaults = {
    fromName: "Your Store Name",
    fromPhone: "0000000000",
    fromAddressText: "Add your permanent sender address from the button above.",
    showFromOnLabel: false,
  };

  try {
    return JSON.parse(localStorage.getItem(FROM_KEY)) || defaults;
  } catch (error) {
    return defaults;
  }
}

function cacheOrdersLocal(orders) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
}

function cacheFromAddressLocal(payload) {
  localStorage.setItem(FROM_KEY, JSON.stringify(payload));
}

function sortOrders(orders) {
  return [...orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function isFirebaseConfigured() {
  const config = window.firebaseConfig;
  return Boolean(
    config &&
      config.enabled &&
      config.apiKey &&
      config.apiKey !== "YOUR_API_KEY" &&
      config.projectId &&
      config.projectId !== "YOUR_PROJECT_ID"
  );
}

function getFirebaseSdkConfig() {
  const config = window.firebaseConfig || {};
  const { enabled, ...sdkConfig } = config;
  return sdkConfig;
}

function tryInitAnalytics() {
  const config = window.firebaseConfig;
  if (!config?.measurementId || typeof firebase.analytics !== "function") return;

  try {
    firebase.analytics();
  } catch (error) {
    console.warn("Firebase Analytics skipped:", error);
  }
}

function setSyncStatus(text, ok) {
  const node = document.getElementById("syncStatus");
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("sync-ok", Boolean(ok));
  node.classList.toggle("sync-off", !ok);
}

function getFirebaseErrorMessage(error) {
  const code = String(error?.code || error?.message || error || "").toLowerCase();
  if (code.includes("permission-denied") || code.includes("insufficient permissions")) {
    return "Firestore rules blocked — deploy rules in Firebase Console";
  }
  if (code.includes("not-found") || code.includes("does not exist")) {
    return "Create Firestore database in Firebase Console";
  }
  if (code.includes("timed out")) {
    return "Cloud connection timed out";
  }
  return "Cloud error";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Firebase connection timed out")), ms);
    }),
  ]);
}

async function migrateLocalToFirebase() {
  const localOrders = loadOrdersLocal();
  const existing = await db.collection("orders").limit(1).get();
  if (!existing.empty || !localOrders.length) return;

  const batch = db.batch();
  localOrders.forEach((order) => {
    batch.set(db.collection("orders").doc(order.id), order);
  });
  await batch.commit();

  const localFrom = loadFromAddressLocal();
  await db.collection("settings").doc("fromAddress").set(localFrom);
}

async function syncOrdersToFirebase(orders) {
  const snapshot = await db.collection("orders").get();
  const batch = db.batch();
  const nextIds = new Set(orders.map((order) => order.id));

  snapshot.docs.forEach((doc) => {
    if (!nextIds.has(doc.id)) {
      batch.delete(doc.ref);
    }
  });

  orders.forEach((order) => {
    batch.set(db.collection("orders").doc(order.id), order);
  });

  await batch.commit();
}

async function connectFirebase() {
  try {
    setSyncStatus("Connecting…", false);
    await withTimeout(migrateLocalToFirebase(), 15000);

    firebaseReady = true;

    db.collection("orders").onSnapshot(
      (snapshot) => {
        ordersCache = sortOrders(snapshot.docs.map((doc) => doc.data()));
        cacheOrdersLocal(ordersCache);
        notifyOrdersListeners();
        setSyncStatus("Cloud synced", true);
      },
      (error) => {
        console.error("Firebase orders listener failed:", error);
        firebaseReady = false;
        setSyncStatus(getFirebaseErrorMessage(error), false);
      }
    );

    const settingsDoc = await db.collection("settings").doc("fromAddress").get();
    if (settingsDoc.exists) {
      cacheFromAddressLocal(settingsDoc.data());
    }

    setSyncStatus("Cloud synced", true);
    return true;
  } catch (error) {
    console.error("Firebase connection failed:", error);
    firebaseReady = false;
    setSyncStatus(getFirebaseErrorMessage(error), false);
    throw error;
  }
}

function ensureFirebaseConnected() {
  if (firebaseReady && db) {
    return Promise.resolve(true);
  }

  if (!connectPromise) {
    connectPromise = connectFirebase().finally(() => {
      connectPromise = null;
    });
  }

  return connectPromise;
}

async function initDataStore() {
  ordersCache = sortOrders(loadOrdersLocal());
  notifyOrdersListeners();

  if (!isFirebaseConfigured()) {
    setSyncStatus("Local only", false);
    return { firebaseReady: false };
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(getFirebaseSdkConfig());
      tryInitAnalytics();
    }
    db = firebase.firestore();
    void ensureFirebaseConnected();
    return { firebaseReady: false };
  } catch (error) {
    console.error("Firebase init failed:", error);
    setSyncStatus(getFirebaseErrorMessage(error), false);
    return { firebaseReady: false };
  }
}

function getOrders() {
  return [...ordersCache];
}

function subscribeOrders(listener) {
  ordersListeners.add(listener);
  listener([...ordersCache]);
  return () => ordersListeners.delete(listener);
}

function loadFromAddress() {
  return loadFromAddressLocal();
}

async function persistOrders(orders) {
  ordersCache = sortOrders(orders);
  cacheOrdersLocal(ordersCache);
  notifyOrdersListeners();

  if (!db || !isFirebaseConfigured()) return;

  setSyncStatus("Saving…", false);

  try {
    await ensureFirebaseConnected();
    await syncOrdersToFirebase(orders);
    setSyncStatus("Cloud synced", true);
  } catch (error) {
    console.error("Firebase order sync failed:", error);
    setSyncStatus(getFirebaseErrorMessage(error), false);
    throw error;
  }
}

async function persistFromAddress(payload) {
  cacheFromAddressLocal(payload);

  if (!db || !isFirebaseConfigured()) return;

  try {
    await ensureFirebaseConnected();
    await db.collection("settings").doc("fromAddress").set(payload);
    setSyncStatus("Cloud synced", true);
  } catch (error) {
    console.error("Firebase settings sync failed:", error);
    setSyncStatus(getFirebaseErrorMessage(error), false);
    throw error;
  }
}
