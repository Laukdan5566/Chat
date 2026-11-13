import { Op } from "sequelize";
import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import assertSafeWebhookUrl from "../../helpers/assertSafeWebhookUrl";
import ShowQueueService from "./ShowQueueService";

interface QueueData {
  name?: string;
  color?: string;
  greetingMessage?: string;
  outOfHoursMessage?: string;
  n8nWebhookEnabled?: boolean;
  n8nWebhookUrl?: string;
  schedules?: any[];
}

const UpdateQueueService = async (
  queueId: number | string,
  queueData: QueueData,
  companyId: number
): Promise<Queue> => {
  const { color, name } = queueData;
  assertSafeWebhookUrl(queueData.n8nWebhookUrl);

  const queueSchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_QUEUE_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_QUEUE_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const queueWithSameName = await Queue.findOne({
              where: { name: value, id: { [Op.ne]: queueId }, companyId }
            });

            return !queueWithSameName;
          }
          return true;
        }
      ),
    color: Yup.string()
      .required("ERR_QUEUE_INVALID_COLOR")
      .test("Check-color", "ERR_QUEUE_INVALID_COLOR", async value => {
        if (value) {
          const colorTestRegex = /^#[0-9a-f]{3,6}$/i;
          return colorTestRegex.test(value);
        }
        return true;
      })
      .test(
        "Check-color-exists",
        "ERR_QUEUE_COLOR_ALREADY_EXISTS",
        async value => {
          if (value) {
            const queueWithSameColor = await Queue.findOne({
              where: { color: value, id: { [Op.ne]: queueId }, companyId }
            });
            return !queueWithSameColor;
          }
          return true;
        }
      )
  });

  try {
    await queueSchema.validate({ color, name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const queue = await ShowQueueService(queueId, companyId);

  if (queue.companyId !== companyId) {
    throw new AppError("Não é permitido alterar registros de outra empresa");
  }

  // mediaPath/mediaName só mudam pelo upload de mídia; a fila não muda de empresa
  const { mediaPath, mediaName, id, companyId: _empresa, ...safeData } = queueData as any;
  await queue.update(safeData);

  return queue;
};

export default UpdateQueueService;
