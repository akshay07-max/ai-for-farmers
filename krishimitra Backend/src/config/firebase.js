// ================================================================
// FIREBASE ADMIN SDK — Push notifications (FCM)
// ================================================================
const admin = require("firebase-admin");
const logger = require("../utils/logger");

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK.
 * Reads the service account JSON file you downloaded from Firebase Console.
 * Called once from app.js at startup.
 */
const initFirebase = () => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    logger.warn(
      "⚠️  FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications disabled.",
    );
    return;
  }

  try {
    // Check if already initialized (happens if app.js is hot-reloaded by nodemon)
    if (admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      logger.info("✅ Firebase already initialized");
      return;
    }

    const serviceAccount = require(require("path").resolve(serviceAccountPath));

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    logger.info("✅ Firebase Admin initialized");
  } catch (err) {
    logger.error(`❌ Firebase init failed: ${err.message}`);
    logger.error(
      "   Check that firebase-service-account.json exists and is valid.",
    );
  }
};

/**
 * Send a push notification to a single device.
 *
 * @param {string} fcmToken   — Device FCM token (stored in User.fcmToken)
 * @param {string} title      — Notification title
 * @param {string} body       — Notification body text
 * @param {object} data       — Optional key-value data payload (for deep linking etc.)
 * @returns {boolean}         — true if sent, false if failed
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!firebaseApp || !fcmToken) {
    logger.warn(
      "Push notification skipped — Firebase not initialized or no FCM token.",
    );
    return false;
  }

  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      // data payload — all values must be strings
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: { sound: "default", badge: 1 },
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`✅ Push sent | MessageID: ${response}`);
    return true;
  } catch (err) {
    // messaging/registration-token-not-registered — user uninstalled app
    logger.error(`❌ Push failed: ${err.message}`);
    return false;
  }
};

/**
 * Send push notification to multiple devices at once.
 * Used for broadcast notifications (e.g. weather alert to all farmers in a district).
 *
 * @param {string[]} fcmTokens  — Array of FCM tokens
 * @param {string}   title
 * @param {string}   body
 * @param {object}   data
 */
const sendMulticastPush = async (fcmTokens, title, body, data = {}) => {
  if (!firebaseApp || !fcmTokens?.length)
    return { successCount: 0, failureCount: 0 };

  try {
    const message = {
      tokens: fcmTokens,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: { priority: "high" },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(
      `✅ Multicast push: ${response.successCount} sent, ${response.failureCount} failed`,
    );
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    logger.error(`❌ Multicast push failed: ${err.message}`);
    return { successCount: 0, failureCount: fcmTokens.length };
  }
};

module.exports = { initFirebase, sendPushNotification, sendMulticastPush };
