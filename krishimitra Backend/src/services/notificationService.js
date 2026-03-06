// ================================================================
// NOTIFICATION SERVICE
// Every module (auth, market, weather, cattle, payments) calls this
// single service to send notifications. Never call Twilio or Firebase
// directly from a module — always go through here.
//
// Usage example:
//   const notif = require('../../services/notificationService');
//   await notif.send({
//     userId:   user._id,
//     module:   'MARKET',
//     type:     'PRICE_ALERT',
//     title:    'कांदा भाव सूचना',
//     body:     'लासलगाव बाजारात कांद्याचा भाव ₹2400/क्विंटल झाला.',
//     channels: { push: true, sms: false },
//     data:     { crop: 'onion', price: 2400 },
//   });
// ================================================================
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendPushNotification } = require("../config/firebase");
const { sendSMS } = require("../config/twilio");
const logger = require("../utils/logger");

// ── Multilingual message templates ───────────────────────────────────────────
// Every notification type has a template in all 3 languages.
// When you call send(), the language is picked from user.languagePreference.
const TEMPLATES = {
  OTP: {
    en: (otp) => ({
      title: "KrishiMitra OTP",
      body: `Your OTP is ${otp}. Valid for 10 minutes. Do not share it.`,
    }),
    mr: (otp) => ({
      title: "KrishiMitra OTP",
      body: `तुमचा OTP ${otp} आहे. १० मिनिटांत वैध. कोणालाही सांगू नका.`,
    }),
    hi: (otp) => ({
      title: "KrishiMitra OTP",
      body: `आपका OTP ${otp} है। 10 मिनट के लिए वैध। किसी को न बताएं।`,
    }),
  },
  PRICE_ALERT: {
    en: (crop, market, price) => ({
      title: `${crop} Price Alert`,
      body: `${crop} price at ${market}: ₹${price}/quintal`,
    }),
    mr: (crop, market, price) => ({
      title: `${crop} भाव सूचना`,
      body: `${market} बाजारात ${crop} चा भाव: ₹${price}/क्विंटल`,
    }),
    hi: (crop, market, price) => ({
      title: `${crop} मूल्य अलर्ट`,
      body: `${market} मंडी में ${crop} का भाव: ₹${price}/क्विंटल`,
    }),
  },
  PRICE_DROP: {
    en: (crop, market, price, pct) => ({
      title: `⚠️ ${crop} Price Drop`,
      body: `${crop} price dropped ${pct}% at ${market}. Current: ₹${price}/quintal. Consider selling soon.`,
    }),
    mr: (crop, market, price, pct) => ({
      title: `⚠️ ${crop} भाव घसरला`,
      body: `${market} मध्ये ${crop} चा भाव ${pct}% घसरला. सध्या: ₹${price}/क्विंटल. लवकर विक्री करण्याचा विचार करा.`,
    }),
    hi: (crop, market, price, pct) => ({
      title: `⚠️ ${crop} भाव गिरा`,
      body: `${market} में ${crop} का भाव ${pct}% गिरा। अभी: ₹${price}/क्विंटल। जल्द बेचने पर विचार करें।`,
    }),
  },
  PRICE_RISE: {
    en: (crop, market, price, pct) => ({
      title: `📈 ${crop} Price Rising`,
      body: `${crop} price rose ${pct}% at ${market}. Current: ₹${price}/quintal. Good time to sell!`,
    }),
    mr: (crop, market, price, pct) => ({
      title: `📈 ${crop} भाव वाढला`,
      body: `${market} मध्ये ${crop} चा भाव ${pct}% वाढला. सध्या: ₹${price}/क्विंटल. विक्रीची चांगली वेळ!`,
    }),
    hi: (crop, market, price, pct) => ({
      title: `📈 ${crop} भाव बढा`,
      body: `${market} में ${crop} का भाव ${pct}% बढ़ा। अभी: ₹${price}/क्विंटल। बेचने का अच्छा समय!`,
    }),
  },
  WEATHER_RISK: {
    en: (risk, crop) => ({
      title: `🌧️ Weather Alert — ${risk} Risk`,
      body: `Weather conditions pose ${risk} risk to your ${crop} crop. Check app for details.`,
    }),
    mr: (risk, crop) => ({
      title: `🌧️ हवामान सूचना — ${risk} धोका`,
      body: `तुमच्या ${crop} पिकाला हवामानामुळे ${risk} धोका आहे. अधिक माहितीसाठी अ‍ॅप तपासा.`,
    }),
    hi: (risk, crop) => ({
      title: `🌧️ मौसम अलर्ट — ${risk} जोखिम`,
      body: `आपकी ${crop} फसल को मौसम से ${risk} जोखिम है। विवरण के लिए ऐप देखें।`,
    }),
  },
  CATTLE_HEALTH_ALERT: {
    en: (name, issue) => ({
      title: `🐄 Cattle Health Alert`,
      body: `${name}: ${issue}. Consult a vet immediately.`,
    }),
    mr: (name, issue) => ({
      title: `🐄 जनावर आरोग्य सूचना`,
      body: `${name}: ${issue}. ताबडतोब पशुवैद्याशी संपर्क साधा.`,
    }),
    hi: (name, issue) => ({
      title: `🐄 पशु स्वास्थ्य अलर्ट`,
      body: `${name}: ${issue}। तुरंत पशु चिकित्सक से संपर्क करें।`,
    }),
  },
  PAYMENT_SUCCESS: {
    en: (plan, amount) => ({
      title: "✅ Payment Successful",
      body: `Your ${plan} plan is now active. Amount paid: ₹${amount}`,
    }),
    mr: (plan, amount) => ({
      title: "✅ पेमेंट यशस्वी",
      body: `तुमचा ${plan} प्लान सक्रिय झाला. भरलेली रक्कम: ₹${amount}`,
    }),
    hi: (plan, amount) => ({
      title: "✅ भुगतान सफल",
      body: `आपका ${plan} प्लान सक्रिय हो गया। भुगतान राशि: ₹${amount}`,
    }),
  },
  SUBSCRIPTION_EXPIRING: {
    en: (days, plan) => ({
      title: "⏰ Subscription Expiring Soon",
      body: `Your ${plan} plan expires in ${days} days. Renew to keep access.`,
    }),
    mr: (days, plan) => ({
      title: "⏰ सदस्यता लवकरच संपणार",
      body: `तुमचा ${plan} प्लान ${days} दिवसांत संपेल. अ‍ॅक्सेस ठेवण्यासाठी नूतनीकरण करा.`,
    }),
    hi: (days, plan) => ({
      title: "⏰ सदस्यता जल्द समाप्त होगी",
      body: `आपका ${plan} प्लान ${days} दिनों में समाप्त होगा। एक्सेस बनाए रखने के लिए नवीनीकरण करें।`,
    }),
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SEND FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * send() — the single function every module calls to send a notification.
 *
 * @param {object} params
 * @param {ObjectId} params.userId          — Who to notify
 * @param {string}   params.module          — 'AUTH' | 'MARKET' | 'WEATHER' | etc.
 * @param {string}   params.type            — 'OTP' | 'PRICE_ALERT' | etc.
 * @param {string}   params.title           — Notification title (overrides template)
 * @param {string}   params.body            — Notification body (overrides template)
 * @param {object}   params.channels        — { push: true, sms: true }
 * @param {object}   params.data            — Extra data payload
 * @param {string}   [params.templateKey]   — If set, uses TEMPLATES[key] with templateArgs
 * @param {array}    [params.templateArgs]  — Arguments for the template function
 * @param {string}   [params.phone]         — Override phone (used for OTP before user exists)
 * @param {string}   [params.fcmToken]      — Override FCM token
 */
const send = async (params) => {
  const {
    userId,
    module: mod,
    type,
    channels = { push: false, sms: false },
    data = {},
    templateKey,
    templateArgs = [],
    phone: overridePhone,
    fcmToken: overrideFcmToken,
  } = params;

  let { title, body } = params;

  try {
    // ── Resolve user info ──────────────────────────────────────
    let user = null;
    let fcmToken = overrideFcmToken || null;
    let phone = overridePhone || null;
    let lang = "en";

    if (userId) {
      user = await User.findById(userId).select(
        "fcmToken phone languagePreference name",
      );
      fcmToken = fcmToken || user?.fcmToken;
      phone = phone || user?.phone;
      lang = user?.languagePreference || "en";
    }

    // ── Apply template if provided ─────────────────────────────
    if (templateKey && TEMPLATES[templateKey]) {
      const templateFn =
        TEMPLATES[templateKey][lang] || TEMPLATES[templateKey]["en"];
      const rendered = templateFn(...templateArgs);
      title = title || rendered.title;
      body = body || rendered.body;
    }

    if (!title || !body) {
      logger.warn(
        `Notification skipped — missing title or body for type: ${type}`,
      );
      return null;
    }

    // ── Create notification record in DB ───────────────────────
    const notif = await Notification.create({
      userId: userId || null,
      module: mod,
      type,
      title,
      body,
      data,
      channels,
      status: {
        push: channels.push ? "PENDING" : "SKIPPED",
        sms: channels.sms ? "PENDING" : "SKIPPED",
      },
    });

    // ── Send Push Notification ─────────────────────────────────
    if (channels.push && fcmToken) {
      const pushSent = await sendPushNotification(fcmToken, title, body, data);
      notif.status.push = pushSent ? "SENT" : "FAILED";
    } else if (channels.push && !fcmToken) {
      notif.status.push = "SKIPPED"; // user hasn't logged in on app yet
    }

    // ── Send SMS ───────────────────────────────────────────────
    if (channels.sms && phone) {
      // Format phone to E.164 for Twilio: "9876543210" → "+919876543210"
      const e164Phone = phone.startsWith("+") ? phone : `+91${phone}`;
      const smsSent = await sendSMS(e164Phone, body);
      notif.status.sms = smsSent ? "SENT" : "FAILED";
    }

    // ── Save final delivery status ─────────────────────────────
    await notif.save();

    logger.info(
      `Notification [${type}] → user ${userId || phone} | push:${notif.status.push} sms:${notif.status.sms}`,
    );
    return notif;
  } catch (err) {
    // Never let notification failure crash the main request
    logger.error(`Notification send failed [${type}]: ${err.message}`);
    return null;
  }
};

// ── Convenience wrappers ──────────────────────────────────────────────────────
// These are pre-configured calls for the most common notification types.
// Modules import these directly instead of constructing the full params object.

/**
 * Send OTP via SMS (and push if token available)
 * Used by auth.service.js
 */
const sendOTPNotification = async (
  phone,
  otp,
  userId = null,
  fcmToken = null,
) => {
  return send({
    userId,
    module: "AUTH",
    type: "OTP",
    channels: { push: !!fcmToken, sms: true },
    templateKey: "OTP",
    templateArgs: [otp],
    phone,
    fcmToken,
  });
};

/**
 * Send price drop alert
 * Called by market cron job when price drops >10%
 */
const sendPriceDropAlert = async (userId, crop, market, price, pctDrop) => {
  return send({
    userId,
    module: "MARKET",
    type: "PRICE_DROP",
    channels: { push: true, sms: true },
    templateKey: "PRICE_DROP",
    templateArgs: [crop, market, price, pctDrop],
    data: { crop, market, price: String(price) },
  });
};

/**
 * Send price rise alert
 */
const sendPriceRiseAlert = async (userId, crop, market, price, pctRise) => {
  return send({
    userId,
    module: "MARKET",
    type: "PRICE_RISE",
    channels: { push: true, sms: false }, // SMS for rise is optional — just push
    templateKey: "PRICE_RISE",
    templateArgs: [crop, market, price, pctRise],
    data: { crop, market, price: String(price) },
  });
};

/**
 * Send weather risk alert
 * Called by weather service when risk > MEDIUM
 */
const sendWeatherAlert = async (userId, riskLevel, crop) => {
  return send({
    userId,
    module: "WEATHER",
    type: "WEATHER_RISK",
    channels: { push: true, sms: riskLevel === "HIGH" }, // SMS only for HIGH risk
    templateKey: "WEATHER_RISK",
    templateArgs: [riskLevel, crop],
    data: { riskLevel, crop },
  });
};

/**
 * Send cattle health alert
 */
const sendCattleHealthAlert = async (userId, cattleName, issue) => {
  return send({
    userId,
    module: "CATTLE",
    type: "CATTLE_HEALTH_ALERT",
    channels: { push: true, sms: true }, // always SMS for cattle health
    templateKey: "CATTLE_HEALTH_ALERT",
    templateArgs: [cattleName, issue],
    data: { cattleName, issue },
  });
};

/**
 * Send payment success notification
 */
const sendPaymentSuccessNotification = async (userId, plan, amountInRupees) => {
  return send({
    userId,
    module: "PAYMENT",
    type: "PAYMENT_SUCCESS",
    channels: { push: true, sms: true },
    templateKey: "PAYMENT_SUCCESS",
    templateArgs: [plan, amountInRupees],
    data: { plan, amount: String(amountInRupees) },
  });
};

/**
 * Send subscription expiry warning
 * Called by daily cron job
 */
const sendSubscriptionExpiryWarning = async (userId, daysLeft, plan) => {
  return send({
    userId,
    module: "PAYMENT",
    type: "SUBSCRIPTION_EXPIRING",
    channels: { push: true, sms: daysLeft <= 3 }, // SMS only in last 3 days
    templateKey: "SUBSCRIPTION_EXPIRING",
    templateArgs: [daysLeft, plan],
    data: { daysLeft: String(daysLeft), plan },
  });
};

module.exports = {
  send,
  sendOTPNotification,
  sendPriceDropAlert,
  sendPriceRiseAlert,
  sendWeatherAlert,
  sendCattleHealthAlert,
  sendPaymentSuccessNotification,
  sendSubscriptionExpiryWarning,
};
