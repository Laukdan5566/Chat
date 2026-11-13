import QuickMessage from "../../models/QuickMessage";
import AppError from "../../errors/AppError";

const ShowService = async (
  id: string | number,
  companyId: number
): Promise<QuickMessage> => {
  const record = await QuickMessage.findOne({ where: { id, companyId } });

  if (!record) {
    throw new AppError("ERR_NO_TICKETNOTE_FOUND", 404);
  }

  return record;
};

export default ShowService;
