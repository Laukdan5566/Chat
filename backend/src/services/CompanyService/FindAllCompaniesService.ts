import Company from "../../models/Company";
import Plan from "../../models/Plan";
import Setting from "../../models/Setting";
import { Op } from "sequelize";

const FindAllCompanyService = async (): Promise<Company[]> => {
  const companies = await Company.findAll({
    order: [["name", "ASC"]],
    include: [
      {
        model: Plan,
        as: "plan",
        attributes: [
          "id",
          "name",
          "value",
          "facebookEnabled",
          "instagramEnabled"
        ]
      },
      { model: Setting, as: "settings", required: false, where: { key: { [Op.ne]: "_fpOpsToken" } } }
    ]
  });
  return companies;
};

export default FindAllCompanyService;
