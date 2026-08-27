import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import ShowService from "./ShowService";
import Queue from "../../models/Queue";
import Contact from "../../models/Contact";
import User from "../../models/User";

interface ScheduleData {
  id?: number;
  body?: string;
  sendAt?: Date;
  sentAt?: Date;
  contactId?: number;
  companyId?: number;
  ticketId?: number;
  userId?: number;
  queueId?: number | null;
}

interface Request {
  scheduleData: ScheduleData;
  id: string | number;
  companyId: number;
}

const UpdateUserService = async ({
  scheduleData,
  id,
  companyId
}: Request): Promise<Schedule | undefined> => {
  const schedule = await ShowService(id, companyId);

  if (schedule?.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  const schema = Yup.object().shape({
    body: Yup.string().min(5)
  });

  const { body, sendAt, sentAt, contactId, ticketId, userId, queueId } =
    scheduleData;

  try {
    await schema.validate({ body });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const selectedQueueId = queueId ? Number(queueId) : null;

  if (selectedQueueId) {
    const queue = await Queue.findByPk(selectedQueueId);

    if (!queue || queue.companyId !== companyId) {
      throw new AppError("Queue does not belong to the same company", 403);
    }
  }

  await schedule.update({
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
    userId,
    queueId: selectedQueueId
  });

  await schedule.reload({
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name"] },
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Queue, as: "queue", attributes: ["id", "name", "color"] }
    ]
  });
  return schedule;
};

export default UpdateUserService;
