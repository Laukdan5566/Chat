import { initWASocket } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import { wbotMessageListener } from "./wbotMessageListener";
import wbotMonitor from "./wbotMonitor";
import { logger } from "../../utils/logger";
import { sendWhatsappUpdate } from "../WhatsappService/SocketSendWhatsappUpdate";

const startingSessions = new Map<number, NodeJS.Timeout>();
const START_SESSION_GUARD_MS = 2 * 60 * 1000;

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp,
  companyId: number,
  isRefresh = false
): Promise<void> => {
  const previousGuard = startingSessions.get(whatsapp.id);

  if (previousGuard && !isRefresh) {
    logger.warn(
      { whatsappId: whatsapp.id, name: whatsapp.name },
      "StartWhatsAppSession ignored because session start is already in progress"
    );
    return;
  }

  if (previousGuard) {
    // A stream restart happens before the initial socket resolves. Replace its
    // guard so the reconnection is not held back by the stale opening attempt.
    clearTimeout(previousGuard);
    startingSessions.delete(whatsapp.id);
  }

  const releaseGuard = (guardTimer: NodeJS.Timeout) => {
    if (startingSessions.get(whatsapp.id) === guardTimer) {
      clearTimeout(guardTimer);
      startingSessions.delete(whatsapp.id);
    }
  };

  const guardTimer = setTimeout(() => {
    releaseGuard(guardTimer);
  }, START_SESSION_GUARD_MS);
  startingSessions.set(whatsapp.id, guardTimer);

  await whatsapp.update({ status: "OPENING" });

  sendWhatsappUpdate(whatsapp);

  initWASocket(whatsapp, null, isRefresh)
    .then(wbot => {
      wbotMessageListener(wbot, companyId);
      wbotMonitor(wbot, whatsapp, companyId);
    })
    .catch(async err => {
      logger.error(err);
      await whatsapp.update({ status: "PENDING" }).catch(updateError => {
        logger.error(updateError);
      });
      sendWhatsappUpdate(whatsapp);
    })
    .finally(() => {
      releaseGuard(guardTimer);
    });
};
