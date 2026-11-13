import Invoice from "../../models/Invoices";
import AppError from "../../errors/AppError";

const ShowInvoceService = async (
  Invoiceid: string | number,
  companyId?: number
): Promise<Invoice> => {
  const invoice = await Invoice.findByPk(Invoiceid, {
    attributes: [
      "id",
      "companyId",
      "detail",
      "value",
      "currency",
      "dueDate",
      "status",
      "createdAt",
      "updatedAt"
    ]
  });

  if (!invoice || (companyId && invoice.companyId !== companyId)) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  return invoice;
};

export default ShowInvoceService;
