const NOTIFICATION_SW_PATH = "/ticketz-notifications-sw.js";

let serviceWorkerRegistrationPromise = null;

export function isBrowserNotificationSupported() {
  return "Notification" in window;
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function registerNotificationServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register(NOTIFICATION_SW_PATH)
      .then(async registration => {
        if (registration.installing) {
          await new Promise(resolve => {
            registration.installing.addEventListener("statechange", () => {
              if (registration.active) {
                resolve();
              }
            });
          });
        }

        return registration;
      })
      .catch(error => {
        serviceWorkerRegistrationPromise = null;
        throw error;
      });
  }

  return serviceWorkerRegistrationPromise;
}

export async function unregisterNotificationServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter(registration =>
          registration.active?.scriptURL?.includes(NOTIFICATION_SW_PATH)
        )
        .map(registration => registration.unregister())
    );
  } catch (error) {
    console.debug("Unable to unregister notification service worker", error);
  }
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  return Notification.requestPermission();
}

export async function showBrowserNotification(title, options = {}) {
  if (!isBrowserNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  const notificationOptions = {
    badge: "/android-chrome-192x192.png",
    requireInteraction: true,
    silent: false,
    ...options
  };

  return new Notification(title, notificationOptions);
}
