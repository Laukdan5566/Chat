import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import QueueOption from "../../models/QueueOption";

// QueueOption não tem companyId: a empresa é a da fila no topo da árvore de opções.
export const assertQueueInCompany = async (
  queueId: number | string,
  companyId: number
): Promise<void> => {
  const queue = await Queue.findOne({
    where: { id: queueId, companyId },
    attributes: ["id"]
  });
  if (!queue) throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
};

export const assertQueueOptionInCompany = async (
  queueOptionId: number | string,
  companyId: number
): Promise<void> => {
  const option = await QueueOption.findOne(
    QueueOption.withTopParentQueue({ where: { id: queueOptionId } })
  );
  if (!option || option.topParentQueue?.companyId !== companyId) {
    throw new AppError("ERR_NO_QUEUE_OPTION_FOUND", 404);
  }
};
