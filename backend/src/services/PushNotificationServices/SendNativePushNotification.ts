import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { Op } from "sequelize";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import UserPushToken from "../../models/UserPushToken";
import { logger } from "../../utils/logger";

type PushTicket = Ticket & {
  contact?: {
    name?: string;
    profilePicUrl?: string;
  };
  participants?: Array<{ id: number }>;
};

interface Request {
  companyId: number;
  messageBody: string;
  ticket: PushTicket;
}

let firebaseInitialized = false;

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    "/usr/src/app/private/firebase-service-account.json";

  if (serviceAccountPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(serviceAccountPath);
  }

  return null;
}

function ensureFirebaseInitialized() {
  if (firebaseInitialized || getApps().length) {
    firebaseInitialized = true;
    return true;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    return false;
  }

  initializeApp({
    credential: cert(serviceAccount)
  });
  firebaseInitialized = true;
  return true;
}

function normalizeMessageBody(body: string) {
  if (!body) {
    return "";
  }

  if (body.startsWith('{"ticketzvCard"')) {
    return "[Contato]";
  }

  return body.length > 180 ? `${body.slice(0, 177)}...` : body;
}

async function findTargetUserIds(ticket: PushTicket): Promise<number[]> {
  const participantUserIds = ticket.participants?.map(user => user.id) || [];

  if (ticket.userId) {
    return Array.from(new Set([ticket.userId, ...participantUserIds]));
  }

  const users = await User.findAll({
    where: { companyId: ticket.companyId },
    include: [
      {
        model: Queue,
        as: "queues",
        required: false
      }
    ]
  });

  const queueUserIds = users
    .filter(user => {
      if (user.profile === "admin") {
        return true;
      }

      if (!ticket.queueId) {
        return false;
      }

      return user.queues?.some(queue => queue.id === ticket.queueId);
    })
    .map(user => user.id);

  return Array.from(new Set([...queueUserIds, ...participantUserIds]));
}

export default async function SendNativePushNotification({
  companyId,
  messageBody,
  ticket
}: Request): Promise<void> {
  if (!ensureFirebaseInitialized()) {
    return;
  }

  const targetUserIds = await findTargetUserIds(ticket);
  if (!targetUserIds.length) {
    return;
  }

  const pushTokens = await UserPushToken.findAll({
    where: {
      companyId,
      enabled: true,
      userId: {
        [Op.in]: targetUserIds
      }
    }
  });

  const tokens = pushTokens.map(pushToken => pushToken.token);
  if (!tokens.length) {
    return;
  }

  const title = `Nova mensagem de ${ticket.contact?.name || "cliente"}`;
  const body = normalizeMessageBody(messageBody);

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title,
      body
    },
    data: {
      url: `/tickets/${ticket.uuid}`,
      ticketId: String(ticket.id),
      companyId: String(companyId)
    },
    android: {
      priority: "high",
      notification: {
        channelId: "ticketz_messages"
      }
    }
  });

  const invalidTokens = response.responses
    .map((item, index) => ({ item, token: tokens[index] }))
    .filter(({ item }) => {
      const code = item.error?.code;
      return (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      );
    })
    .map(({ token }) => token);

  if (invalidTokens.length) {
    await UserPushToken.update(
      { enabled: false },
      {
        where: {
          token: {
            [Op.in]: invalidTokens
          }
        }
      }
    );
  }

  logger.debug(
    {
      companyId,
      ticketId: ticket.id,
      successCount: response.successCount,
      failureCount: response.failureCount
    },
    "native push notification sent"
  );
}
