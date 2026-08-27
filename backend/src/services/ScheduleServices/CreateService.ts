import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";

interface Request {
  body: string;
  sendAt: Date;
  contactId: number;
  companyId: number;
  userId?: number;
  saveMessage?: boolean;
  queueId?: number | null;
}

const CreateService = async ({
  body,
  sendAt,
  contactId,
  companyId,
  userId,
  saveMessage,
  queueId
}: Request): Promise<Schedule> => {
  const schema = Yup.object().shape({
    body: Yup.string().required().min(5),
    sendAt: Yup.string().required()
  });

  try {
    await schema.validate({ body, sendAt });
  } catch (err) {
    throw new AppError(err.message);
  }

  const selectedQueueId = queueId ? Number(queueId) : null;

  if (selectedQueueId) {
    const queue = await Queue.findByPk(selectedQueueId);

    if (!queue || queue.companyId !== companyId) {
      throw new AppError("Queue does not belong to the same company", 403);
    }
  }

  const schedule = await Schedule.create({
    body,
    sendAt,
    contactId,
    companyId,
    userId,
    queueId: selectedQueueId,
    saveMessage,
    status: "PENDENTE"
  });

  await schedule.reload({
    include: [
      { model: Contact, as: "contact" },
      { model: Queue, as: "queue", attributes: ["id", "name", "color"] }
    ]
  });

  return schedule;
};

export default CreateService;
