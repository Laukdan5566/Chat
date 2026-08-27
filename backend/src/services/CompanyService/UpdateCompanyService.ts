import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Invoices from "../../models/Invoices";
import Setting from "../../models/Setting";

interface CompanyData {
  name: string;
  id?: number | string;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string;
  recurrence?: string;
  language?: string;
  zammadEnabled?: boolean;
  zammadUrl?: string;
  zammadToken?: string;
  zammadGroup?: string;
  zammadPriority?: string;
}

const upsertSetting = async (
  companyId: number,
  key: string,
  value: string | number | boolean
) => {
  const [setting, created] = await Setting.findOrCreate({
    where: {
      companyId,
      key
    },
    defaults: {
      companyId,
      key,
      value: `${value}`
    }
  });

  if (!created) {
    await setting.update({ value: `${value}` });
  }
};

const UpdateCompanyService = async (
  companyData: CompanyData
): Promise<Company> => {
  const company = await Company.findByPk(companyData.id);
  const {
    name,
    phone,
    email,
    status,
    planId,
    campaignsEnabled,
    dueDate,
    recurrence,
    language,
    zammadEnabled,
    zammadUrl,
    zammadToken,
    zammadGroup,
    zammadPriority
  } = companyData;

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  const previousPlanId = company.planId;

  await company.update({
    name,
    phone,
    email,
    status,
    planId,
    dueDate,
    recurrence,
    language
  });

  if (companyData.campaignsEnabled !== undefined) {
    await upsertSetting(company.id, "campaignsEnabled", campaignsEnabled);
  }

  if (zammadEnabled !== undefined) {
    await upsertSetting(company.id, "zammadEnabled", zammadEnabled);
  }

  if (zammadUrl !== undefined) {
    await upsertSetting(company.id, "zammadUrl", zammadUrl || "");
  }

  if (zammadToken) {
    await upsertSetting(company.id, "_zammadToken", zammadToken);
  }

  if (zammadGroup !== undefined) {
    await upsertSetting(company.id, "zammadGroup", zammadGroup || "");
  }

  if (zammadPriority !== undefined) {
    await upsertSetting(company.id, "zammadPriority", zammadPriority || "");
  }

  if (dueDate && new Date(dueDate) > new Date()) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open",
        dueDate: {
          [Op.lte]: dueDate
        }
      }
    });
  }

  if (planId && previousPlanId !== planId) {
    await Invoices.destroy({
      where: {
        companyId: company.id,
        status: "open"
      }
    });
  }

  return company;
};

export default UpdateCompanyService;
