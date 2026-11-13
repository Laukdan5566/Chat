import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import Whatsapp from "../../models/Whatsapp";

// Campos que o cliente pode gravar. mediaPath/mediaName só mudam pelo upload de mídia
// (viram caminho de arquivo lido pelo servidor) e companyId/completedAt são do sistema.
const ALLOWED_FIELDS = [
  "name",
  "status",
  "confirmation",
  "scheduledAt",
  "contactListId",
  "whatsappId",
  ...[1, 2, 3, 4, 5].flatMap(n => [`message${n}`, `confirmationMessage${n}`])
];

export const assertCampaign = async (
  id: string | number,
  companyId: number
): Promise<Campaign> => {
  const campaign = await Campaign.findOne({ where: { id, companyId } });

  if (!campaign) {
    throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
  }

  return campaign;
};

export const pickCampaignData = async (
  body: Record<string, any>,
  companyId: number
): Promise<Record<string, any>> => {
  const data: Record<string, any> = {};
  ALLOWED_FIELDS.forEach(key => {
    if (body[key] !== undefined) data[key] = body[key];
  });

  if (data.whatsappId != null) {
    const whatsapp = await Whatsapp.findOne({
      where: { id: data.whatsappId, companyId },
      attributes: ["id"]
    });
    if (!whatsapp) throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (data.contactListId != null) {
    const list = await ContactList.findOne({
      where: { id: data.contactListId, companyId },
      attributes: ["id"]
    });
    if (!list) throw new AppError("ERR_FORBIDDEN", 403);
  }

  return data;
};
