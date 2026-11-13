import { Sequelize, Op } from "sequelize";
import TicketNote from "../../models/TicketNote";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  companyId: number;
}

interface Response {
  ticketNotes: TicketNote[];
  count: number;
  hasMore: boolean;
}

const ListTicketNotesService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId
}: Request): Promise<Response> => {
  // só notas de tickets (ou contatos, nas notas sem ticket) da empresa de quem busca
  const whereCondition = {
    [Op.and]: [
      {
        note: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("TicketNote.note")),
          "LIKE",
          `%${searchParam.toLowerCase().trim()}%`
        )
      },
      {
        [Op.or]: [
          { "$ticket.companyId$": companyId },
          {
            // nota sem ticket: vale a empresa do contato
            [Op.and]: [
              { ticketId: { [Op.or]: [null, 0] } },
              { "$contact.companyId$": companyId }
            ]
          }
        ]
      }
    ]
  };
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: ticketNotes } = await TicketNote.findAndCountAll({
    where: whereCondition,
    include: [
      { model: Ticket, as: "ticket", attributes: [], required: false },
      { model: Contact, as: "contact", attributes: [], required: false }
    ],
    subQuery: false,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + ticketNotes.length;

  return {
    ticketNotes,
    count,
    hasMore
  };
};

export default ListTicketNotesService;
