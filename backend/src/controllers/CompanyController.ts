import * as Yup from "yup";
import { Request, Response } from "express";
import axios from "axios";
import moment from "moment";
import AppError from "../errors/AppError";
import Company from "../models/Company";

import ListCompaniesService from "../services/CompanyService/ListCompaniesService";
import CreateCompanyService from "../services/CompanyService/CreateCompanyService";
import UpdateCompanyService from "../services/CompanyService/UpdateCompanyService";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import UpdateSchedulesService from "../services/CompanyService/UpdateSchedulesService";
import DeleteCompanyService from "../services/CompanyService/DeleteCompanyService";
import FindAllCompaniesService from "../services/CompanyService/FindAllCompaniesService";
import User from "../models/User";
import Plan from "../models/Plan";

import CheckSettings from "../helpers/CheckSettings";
import { OpenHoursData } from "../helpers/checkOpenHours";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

type CompanyData = {
  name: string;
  id?: number;
  phone?: string;
  email?: string;
  status?: boolean;
  planId?: number;
  campaignsEnabled?: boolean;
  dueDate?: string;
  recurrence?: string;
  zammadEnabled?: boolean;
  zammadUrl?: string;
  zammadToken?: string;
  zammadGroup?: string;
  zammadPriority?: string;
  fpOpsEnabled?: boolean;
  fpOpsUrl?: string;
  fpOpsToken?: string;
};

type SchedulesData = {
  schedules: OpenHoursData;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;

  const { companies, count, hasMore } = await ListCompaniesService({
    searchParam,
    pageNumber
  });

  return res.json({ companies, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const newCompany: CompanyData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(newCompany);
  } catch (err) {
    throw new AppError(err.message);
  }

  const company = await CreateCompanyService(newCompany);

  return res.status(200).json(company);
};

export const signup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if ((await CheckSettings("allowSignup")) !== "enabled") {
    return res.status(401).json("🙎🏻‍♂️ Signup disabled");
  }

  if (process.env.RECAPTCHA_SECRET_KEY) {
    if (!req.body.captchaToken) {
      return res.status(401).json("empty captcha");
    }
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${req.body.captchaToken}`
    );

    if (!response.data.success) {
      return res.status(401).json("🤖 be gone");
    }
  }

  const { name, email, phone, password, planId, language } = req.body;

  // cadastro público: e-mail já existente nunca move o usuário para a empresa nova
  // (o CreateCompanyService reaproveita usuário com mesmo nome+e-mail) e só plano público vale
  if (email && (await User.findOne({ where: { email } }))) {
    return res.status(400).json("ERR_USER_ALREADY_EXISTS");
  }

  const plan = await Plan.findOne({ where: { id: planId, isPublic: true } });
  if (!plan) {
    return res.status(400).json("ERR_PLAN_NOT_AVAILABLE");
  }

  // só os campos do formulário: sem recurrence, campaignsEnabled etc. vindos do cliente
  req.body = {
    name,
    email,
    phone,
    password,
    planId,
    language,
    status: "t",
    dueDate: moment().add(3, "day").format()
  };

  return store(req, res);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const requestUser = await User.findByPk(req.user.id);

  if (!requestUser.super && Number.parseInt(id, 10) !== requestUser.companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const company = await ShowCompanyService(id);

  return res.status(200).json(company);
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const companies: Company[] = await FindAllCompaniesService();

  return res.status(200).json(companies);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyData: CompanyData = req.body;

  const schema = Yup.object().shape({
    name: Yup.string()
  });

  try {
    await schema.validate(companyData);
  } catch (err) {
    throw new AppError(err.message);
  }

  const { id } = req.params;

  const company = await UpdateCompanyService({ id, ...companyData });

  return res.status(200).json(company);
};

export const updateSchedules = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { schedules }: SchedulesData = req.body;
  const { id } = req.params;
  const requestUser = await User.findByPk(req.user.id);

  if (!requestUser.super && Number.parseInt(id, 10) !== requestUser.companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const company = await UpdateSchedulesService({
    id,
    schedules
  });

  return res.status(200).json(company);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  if (Number(id) === 1) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const company = await DeleteCompanyService(id);

  return res.status(200).json(company);
};
