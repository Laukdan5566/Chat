import AppError from "../../errors/AppError";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import ShowContactService from "../ContactServices/ShowContactService";
import { getIO } from "../../libs/socket";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { incrementCounter } from "../CounterServices/IncrementCounter";

interface Request {
  contactId: number;
  userId: number;
  companyId: number;
  queueId?: number;
  whatsappId?: number;
}

const resolveTicketWhatsapp = async (
  companyId: number,
  whatsappId?: number
): Promise<Whatsapp> => {
  if (!whatsappId) {
    return GetDefaultWhatsApp(companyId);
  }

  const whatsapp = await Whatsapp.findOne({
    where: {
      id: whatsappId,
      companyId,
      channel: "whatsapp",
      status: "CONNECTED"
    }
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  return whatsapp;
};

const CreateTicketService = async ({
  contactId,
  userId,
  queueId,
  companyId,
  whatsappId
}: Request): Promise<Ticket> => {
  const whatsapp = await resolveTicketWhatsapp(companyId, whatsappId);

  let ticket = await CheckContactOpenTickets(
    contactId,
    whatsapp.id,
    true
  );

  const include = [
    {
      model: Contact,
      as: "contact",
      include: ["tags", "extraInfo"]
    },
    "queue",
    "whatsapp",
    "user",
    "tags"
  ];

  if (ticket) {
    if (ticket.status === "open" && ticket.userId === userId) {
      await ticket.reload({
        include
      });
      return ticket;
    }
    throw new AppError("ERR_OTHER_OPEN_TICKET");
  }

  const { isGroup } = await ShowContactService(contactId, companyId);

  ticket = await Ticket.create({
    contactId,
    companyId,
    queueId,
    whatsappId: whatsapp.id,
    status: "open",
    isGroup,
    userId
  });

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  await FindOrCreateATicketTrakingService({
    ticketId: ticket.id,
    companyId: ticket.companyId,
    whatsappId: ticket.whatsappId,
    userId: ticket.userId
  });

  incrementCounter(ticket.companyId, "ticket-create");

  await ticket.reload({
    include
  });

  const io = getIO();

  io.to(ticket.id.toString()).emit("ticket", {
    action: "update",
    ticket
  });

  return ticket;
};

export default CreateTicketService;
