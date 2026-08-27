import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      INSERT INTO "Messages" (
        "id",
        "ticketId",
        "contactId",
        "companyId",
        "queueId",
        "body",
        "fromMe",
        "read",
        "mediaType",
        "channel",
        "ack",
        "dataJson",
        "createdAt",
        "updatedAt"
      )
      SELECT
        CONCAT('internal-note-', tn."ticketId", '-', tn."id") AS "id",
        tn."ticketId",
        tn."contactId",
        t."companyId",
        t."queueId",
        tn."note",
        true,
        true,
        'internalNote',
        'internal',
        0,
        json_build_object(
          'type', 'internalNote',
          'noteId', tn."id",
          'userId', tn."userId"
        )::text,
        tn."createdAt",
        tn."updatedAt"
      FROM "TicketNotes" tn
      INNER JOIN "Tickets" t ON t."id" = tn."ticketId"
      ON CONFLICT DO NOTHING;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      DELETE FROM "Messages"
      WHERE "mediaType" = 'internalNote'
        AND "id" LIKE 'internal-note-%';
    `);
  }
};
