import QueueOption from "../../models/QueueOption";

interface QueueOptionData {
  queueId: number;
  title: string;
  option: string;
  message?: string;
  parentId?: number;
}

const CreateService = async (
  queueOptionData: QueueOptionData
): Promise<QueueOption> => {
  // mediaPath/mediaName só mudam pelo upload de mídia (viram caminho de arquivo lido pelo servidor)
  const { mediaPath, mediaName, ...safeData } = queueOptionData as any;
  const queueOption = await QueueOption.create(safeData);
  return queueOption;
};

export default CreateService;
