import { Op, col, fn, where } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { GetCompanySetting } from "../../helpers/CheckSettings";

interface Request {
  contactId: string;
  companyId: number;
  excludeTicketId?: string;
  pageNumber?: string;
  searchParam?: string;
  queues?: number[];
}

interface Response {
  messages: Message[];
  count: number;
  hasMore: boolean;
}

const ListContactMessagesService = async ({
  contactId,
  companyId,
  excludeTicketId,
  pageNumber = "1",
  searchParam = "",
  queues = []
}: Request): Promise<Response> => {
  const contact = await Contact.findOne({
    where: {
      id: contactId,
      companyId
    }
  });

  if (!contact) {
    throw new AppError("ERR_CONTACT_NOT_FOUND", 404);
  }

  const limit = 80;
  const offset = limit * (+pageNumber - 1);
  const normalizedSearchParam = searchParam.toLowerCase().trim();

  const messageWhere: any = {
    companyId,
    mediaType: {
      [Op.or]: {
        [Op.ne]: "reactionMessage",
        [Op.is]: null
      }
    }
  };

  if (normalizedSearchParam) {
    messageWhere[Op.and] = [
      where(fn("LOWER", col("body")), {
        [Op.like]: `%${normalizedSearchParam}%`
      })
    ];
  }

  if (
    queues.length > 0 &&
    (await GetCompanySetting(companyId, "messageVisibility", "message")) ===
      "message"
  ) {
    messageWhere["queueId"] = {
      [Op.or]: {
        [Op.in]: queues,
        [Op.eq]: null
      }
    };
  }

  const ticketWhere: any = {
    contactId,
    companyId
  };

  if (excludeTicketId) {
    ticketWhere.id = {
      [Op.ne]: excludeTicketId
    };
  }

  if (queues.length > 0) {
    ticketWhere["queueId"] = {
      [Op.or]: {
        [Op.in]: queues,
        [Op.eq]: null
      }
    };
  }

  const { count, rows: messages } = await Message.findAndCountAll({
    where: messageWhere,
    limit,
    offset,
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        where: ticketWhere,
        required: true,
        include: [
          {
            model: Queue,
            as: "queue"
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "name"]
          }
        ]
      },
      {
        model: Queue,
        as: "queue"
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + messages.length;

  return {
    messages: messages.reverse(),
    count,
    hasMore
  };
};

export default ListContactMessagesService;
