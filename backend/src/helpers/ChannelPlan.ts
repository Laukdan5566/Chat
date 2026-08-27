import AppError from "../errors/AppError";
import Company from "../models/Company";
import Plan from "../models/Plan";

export const isChannelAllowedByPlan = (plan: Plan, channel = "whatsapp") => {
  if (channel === "whatsapp") return true;
  if (channel === "facebook") return !!plan?.facebookEnabled;
  if (channel === "instagram") return !!plan?.instagramEnabled;

  return false;
};

export const assertCompanyCanUseChannel = async (
  companyId: number,
  channel = "whatsapp"
) => {
  if (channel === "whatsapp") return;

  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company || !isChannelAllowedByPlan(company.plan, channel)) {
    throw new AppError("ERR_CHANNEL_NOT_AVAILABLE_IN_PLAN", 403);
  }
};
