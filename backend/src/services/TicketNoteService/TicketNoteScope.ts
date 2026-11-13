import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import TicketNote from "../../models/TicketNote";

// TicketNote não tem companyId: a empresa vem do ticket (ou do contato, nas notas sem ticket).
export const assertTicketInCompany = async (
  ticketId: number | string,
  companyId: number
): Promise<void> => {
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    attributes: ["id"]
  });
  if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);
};

export const assertContactInCompany = async (
  contactId: number | string,
  companyId: number
): Promise<void> => {
  const contact = await Contact.findOne({
    where: { id: contactId, companyId },
    attributes: ["id"]
  });
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);
};

export const assertNoteInCompany = async (
  noteId: number | string,
  companyId: number
): Promise<TicketNote> => {
  const note = await TicketNote.findByPk(noteId);
  if (!note) throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);

  if (note.ticketId) {
    await assertTicketInCompany(note.ticketId, companyId);
  } else if (note.contactId) {
    await assertContactInCompany(note.contactId, companyId);
  } else {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  return note;
};
