import * as Yup from "yup";
import { randomUUID } from "crypto";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
import { isChannelAllowedByPlan } from "../../helpers/ChannelPlan";

interface Request {
  name: string;
  companyId: number;
  queueIds?: number[];
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  ratingMessage?: string;
  transferMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  provider?: string;
  facebookUserId?: string;
  facebookUserToken?: string;
  tokenMeta?: string;
  channel?: string;
  facebookPageUserId?: string;
  language?: string;
  apiToken?: string;
  apiChannelId?: string;
  apiWebhookSecret?: string;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

const CreateWhatsAppService = async ({
  name,
  status = "OPENING",
  queueIds = [],
  greetingMessage,
  complationMessage,
  outOfHoursMessage,
  ratingMessage,
  transferMessage,
  isDefault = false,
  companyId,
  token = "",
  provider = "beta",
  facebookUserId,
  facebookUserToken,
  facebookPageUserId,
  tokenMeta,
  channel = "whatsapp",
  language,
  apiToken,
  apiChannelId,
  apiWebhookSecret
}: Request): Promise<Response> => {
  const company = await Company.findOne({
    where: {
      id: companyId
    },
    include: [{ model: Plan, as: "plan" }]
  });

  if (company !== null) {
    if (!isChannelAllowedByPlan(company.plan, channel)) {
      throw new AppError("ERR_CHANNEL_NOT_AVAILABLE_IN_PLAN", 403);
    }

    const whatsappCount = await Whatsapp.count({
      where: {
        companyId,
        channel
      }
    });

    if (whatsappCount >= company.plan.connections) {
      throw new AppError(
        `Numero maximo de conexoes ja alcancado: ${whatsappCount}`
      );
    }
  }

  const schema = Yup.object().shape({
    name: Yup.string()
      .required()
      .min(2)
      .test(
        "Check-name",
        "Esse nome já está sendo utilizado por outra conexão",
        async value => {
          if (!value) return false;
          const nameExists = await Whatsapp.findOne({
            where: { name: value, companyId }
          });
          return !nameExists;
        }
      ),
    isDefault: Yup.boolean().required()
  });

  try {
    await schema.validate({ name, status, isDefault });
  } catch (err: unknown) {
    throw new AppError((err as Error).message);
  }

  if (provider === "notificame") {
    if (channel !== "whatsapp") {
      throw new AppError("ERR_OFFICIAL_WHATSAPP_INVALID_CHANNEL", 400);
    }

    if (!apiToken?.trim() || !apiChannelId?.trim()) {
      throw new AppError("ERR_OFFICIAL_WHATSAPP_CREDENTIALS_REQUIRED", 400);
    }
  }

  const whatsappFound = await Whatsapp.findOne({ where: { companyId } });

  isDefault = channel === "whatsapp" ? !whatsappFound : false;

  let oldDefaultWhatsapp: Whatsapp | null = null;

  if (channel === "whatsapp" && isDefault) {
    oldDefaultWhatsapp = await Whatsapp.findOne({
      where: { isDefault: true, companyId, channel }
    });
    if (oldDefaultWhatsapp) {
      await oldDefaultWhatsapp.update({ isDefault: false, companyId });
    }
  }

  if (queueIds.length > 1 && !greetingMessage) {
    throw new AppError("ERR_WAPP_GREETING_REQUIRED");
  }

  if (token !== null && token !== "") {
    const tokenSchema = Yup.object().shape({
      token: Yup.string()
        .required()
        .min(2)
        .test(
          "Check-token",
          "This whatsapp token is already used.",
          async value => {
            if (!value) return false;
            const tokenExists = await Whatsapp.findOne({
              where: { token: value, channel }
            });
            return !tokenExists;
          }
        )
    });

    try {
      await tokenSchema.validate({ token });
    } catch (err: unknown) {
      throw new AppError((err as Error).message);
    }
  }

  const whatsapp = await Whatsapp.create(
    {
      name,
      status,
      greetingMessage,
      complationMessage,
      outOfHoursMessage,
      ratingMessage,
      transferMessage,
      isDefault,
      companyId,
      token,
      provider,
      channel,
      facebookUserId,
      facebookUserToken,
      facebookPageUserId,
      tokenMeta,
      language,
      apiToken: apiToken?.trim() || null,
      apiChannelId: apiChannelId?.trim() || null,
      apiWebhookSecret:
        provider === "notificame"
          ? apiWebhookSecret?.trim() || randomUUID().replace(/-/g, "")
          : null
    },
    { include: ["queues"] }
  );

  await AssociateWhatsappQueue(whatsapp, queueIds);

  return { whatsapp, oldDefaultWhatsapp };
};

export default CreateWhatsAppService;
