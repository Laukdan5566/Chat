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
  fpOpsEnabled?: boolean;
  fpOpsUrl?: string;
  fpOpsToken?: string;
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
  if (companyData.fpOpsUrl) {
    try {
      const url = new URL(companyData.fpOpsUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      throw new AppError("Configure uma URL HTTPS valida para o FP Ops", 400);
    }
  }
  if (companyData.fpOpsEnabled !== undefined && typeof companyData.fpOpsEnabled !== "boolean") {
    throw new AppError("Configuracao FP Ops invalida", 400);
  }
  if (companyData.fpOpsEnabled === true) {
    const configured = await Setting.findAll({ where: { companyId: company.id, key: ["fpOpsUrl", "_fpOpsToken"] } });
    const saved = (key: string) => configured.find(setting => setting.key === key)?.value || "";
    if (!(companyData.fpOpsUrl ?? saved("fpOpsUrl")).trim() ||
        !(companyData.fpOpsToken?.trim() || saved("_fpOpsToken"))) {
      throw new AppError("Cadastre a URL e o token antes de ativar o FP Ops", 400);
    }
  }

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

  if (companyData.fpOpsUrl !== undefined) {
    await upsertSetting(company.id, "fpOpsUrl", companyData.fpOpsUrl.trim());
  }
  if (companyData.fpOpsToken?.trim()) {
    await upsertSetting(company.id, "_fpOpsToken", companyData.fpOpsToken.trim());
  }
  if (companyData.fpOpsEnabled !== undefined) {
    await upsertSetting(company.id, "fpOpsEnabled", companyData.fpOpsEnabled);
    if (companyData.fpOpsEnabled) await upsertSetting(company.id, "zammadEnabled", false);
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
