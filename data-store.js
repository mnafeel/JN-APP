const ORDER_KEY = "wa_label_orders_v1";
const FROM_KEY = "wa_label_from_v1";

let firebaseReady = false;
let db = null;
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

async function initDataStore() {
  ordersCache = sortOrders(loadOrdersLocal());

  if (!isFirebaseConfigured()) {
    setSyncStatus("Local only", false);
    notifyOrdersListeners();
    return { firebaseReady: false };
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(getFirebaseSdkConfig());
      tryInitAnalytics();
    }
    db = firebase.firestore();
    firebaseReady = true;
    setSyncStatus("Connecting…", false);

    await migrateLocalToFirebase();

    db.collection("orders").onSnapshot(
      (snapshot) => {
        ordersCache = sortOrders(snapshot.docs.map((doc) => doc.data()));
        cacheOrdersLocal(ordersCache);
        notifyOrdersListeners();
        setSyncStatus("Cloud synced", true);
      },
      (error) => {
        console.error("Firebase orders listener failed:", error);
        setSyncStatus("Cloud error", false);
      }
    );

    const settingsDoc = await db.collection("settings").doc("fromAddress").get();
    if (settingsDoc.exists) {
      cacheFromAddressLocal(settingsDoc.data());
    }

    return { firebaseReady: true };
  } catch (error) {
    console.error("Firebase init failed:", error);
    setSyncStatus("Local only", false);
    notifyOrdersListeners();
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

  if (!firebaseReady || !db) return;

  setSyncStatus("Saving…", false);

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
  setSyncStatus("Cloud synced", true);
}

async function persistFromAddress(payload) {
  cacheFromAddressLocal(payload);

  if (!firebaseReady || !db) return;

  await db.collection("settings").doc("fromAddress").set(payload);
}
