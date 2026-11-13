import QueueOption from "../../models/QueueOption";
import ShowService from "./ShowService";

interface QueueData {
  queueId?: number;
  title?: string;
  option?: string;
  message?: string;
  parentId?: number;
}

const UpdateService = async (
  queueOptionId: number | string,
  queueOptionData: QueueData
): Promise<QueueOption> => {
  const queueOption = await ShowService(queueOptionId);

  // mediaPath/mediaName só mudam pelo upload de mídia; id não se troca
  const { mediaPath, mediaName, id, ...safeData } = queueOptionData as any;
  await queueOption.update(safeData);

  return queueOption;
};

export default UpdateService;
