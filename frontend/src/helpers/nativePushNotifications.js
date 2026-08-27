import api from "../services/api";

let registrationStarted = false;
let listenersAttached = false;
let nativeTokenListenerAttached = false;

function isChatFpAndroidApp() {
  return /ChatFPAndroid\//.test(navigator.userAgent);
}

function hasNativeCapacitorBridge() {
  return (
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor?.getPlatform?.() === "android" ||
    !!window.Capacitor?.Plugins?.PushNotifications
  );
}

async function loadNativePushDependencies() {
  const [{ Capacitor }, { PushNotifications }] = await Promise.all([
    import("@capacitor/core"),
    import("@capacitor/push-notifications")
  ]);

  return { Capacitor, PushNotifications };
}

function isNativeAndroidApp(Capacitor) {
  const platform = Capacitor.getPlatform();
  return platform === "android";
}

async function registerToken(token) {
  if (!token) {
    return;
  }

  window.__ticketzNativePushState = {
    ...(window.__ticketzNativePushState || {}),
    tokenReceived: true,
    tokenRegisteredAt: new Date().toISOString()
  };

  await api.post("/push-tokens", {
    token,
    platform: "android",
    deviceName: navigator.userAgent
  });

  window.__ticketzNativePushState = {
    ...(window.__ticketzNativePushState || {}),
    tokenSaved: true,
    tokenSavedAt: new Date().toISOString()
  };
}

function attachNativeTokenBridgeListener() {
  if (nativeTokenListenerAttached) {
    return;
  }

  window.addEventListener("chatfp-native-fcm-token", event => {
    registerToken(event.detail?.token).catch(error => {
      console.debug("Unable to save injected native push token", error);
    });
  });

  nativeTokenListenerAttached = true;
}

function openNotificationTarget(notification = {}) {
  const url =
    notification?.notification?.data?.url ||
    notification?.data?.url ||
    notification?.url;

  if (url && typeof url === "string") {
    window.location.assign(url);
  }
}

export async function registerNativePushNotifications() {
  if (
    (!isChatFpAndroidApp() && !hasNativeCapacitorBridge()) ||
    registrationStarted
  ) {
    return;
  }

  attachNativeTokenBridgeListener();

  if (window.__chatFpNativeFcmToken) {
    registerToken(window.__chatFpNativeFcmToken).catch(error => {
      console.debug("Unable to save native bridge push token", error);
    });
  }

  const { Capacitor, PushNotifications } = await loadNativePushDependencies();

  window.__ticketzNativePushState = {
    platform: Capacitor.getPlatform(),
    native: Capacitor.isNativePlatform(),
    available: !!PushNotifications,
    startedAt: new Date().toISOString()
  };

  if (!isNativeAndroidApp(Capacitor) || !PushNotifications) {
    return;
  }

  registrationStarted = true;

  try {
    if (!listenersAttached) {
      await PushNotifications.addListener("registration", token => {
        registerToken(token?.value).catch(error => {
          console.debug("Unable to save native push token", error);
        });
      });

      await PushNotifications.addListener("registrationError", error => {
        window.__ticketzNativePushState = {
          ...(window.__ticketzNativePushState || {}),
          registrationError: error
        };
        console.debug("Native push registration failed", error);
      });

      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        openNotificationTarget
      );

      listenersAttached = true;
    }

    const permission = await PushNotifications.requestPermissions();
    window.__ticketzNativePushState = {
      ...(window.__ticketzNativePushState || {}),
      permission
    };

    if (permission.receive === "granted") {
      if (PushNotifications.createChannel) {
        await PushNotifications.createChannel({
          id: "ticketz_messages",
          name: /(^|\.)vib\./i.test(window.location.hostname)
            ? "Mensagens VIB"
            : "Mensagens Chat FP",
          description: "Alertas de novas mensagens dos atendimentos",
          importance: 5,
          visibility: 1,
          vibration: true
        });
      }

      await PushNotifications.register();
    }
  } catch (error) {
    registrationStarted = false;
    window.__ticketzNativePushState = {
      ...(window.__ticketzNativePushState || {}),
      error
    };
    console.debug("Native push notifications unavailable", error);
  }
}
