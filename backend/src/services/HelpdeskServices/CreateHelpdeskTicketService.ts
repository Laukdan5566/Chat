import Setting from "../../models/Setting";
import CreateFpOpsTicketService, { HelpdeskRequest } from "../FpOpsServices/CreateFpOpsTicketService";
import CreateZammadTicketService from "../ZammadServices/CreateZammadTicketService";

const CreateHelpdeskTicketService = async (request: HelpdeskRequest) => {
  const enabled = await Setting.findOne({ where: { companyId: request.companyId, key: "fpOpsEnabled" } });
  if (["true", "enabled"].includes(enabled?.value)) return CreateFpOpsTicketService(request);
  return CreateZammadTicketService(request);
};

export default CreateHelpdeskTicketService;
