import * as Yup from "yup";
import AppError from "../../errors/AppError";
import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";
import CreateMessageService from "../MessageServices/CreateMessageService";

interface TicketNoteData {
  note: string;
  userId: number;
  contactId: number;
  ticketId: number;
}

const CreateTicketNoteService = async (
  ticketNoteData: TicketNoteData
): Promise<TicketNote> => {
  const { note } = ticketNoteData;

  const ticketnoteSchema = Yup.object().shape({
    note: Yup.string()
      .min(3, "ERR_TICKETNOTE_INVALID_NAME")
      .required("ERR_TICKETNOTE_INVALID_NAME")
  });

  try {
    await ticketnoteSchema.validate({ note });
  } catch (err) {
    throw new AppError(err.message);
  }

  const ticketNote = await TicketNote.create(ticketNoteData);

  const ticket = await Ticket.findByPk(ticketNoteData.ticketId);

  if (ticket) {
    await CreateMessageService({
      messageData: {
        id: `internal-note-${ticketNoteData.ticketId}-${ticketNote.id}`,
        ticketId: ticketNoteData.ticketId,
        contactId: ticketNoteData.contactId,
        body: note,
        fromMe: true,
        read: true,
        mediaType: "internalNote",
        channel: "internal",
        queueId: ticket.queueId,
        dataJson: JSON.stringify({
          type: "internalNote",
          noteId: ticketNote.id,
          userId: ticketNoteData.userId
        })
      },
      companyId: ticket.companyId
    });
  }

  return ticketNote;
};

export default CreateTicketNoteService;
