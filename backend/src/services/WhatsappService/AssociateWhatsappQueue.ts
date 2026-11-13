import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";

const AssociateWhatsappQueue = async (
  whatsapp: Whatsapp,
  queueIds: number[]
): Promise<void> => {
  // só filas da mesma empresa da conexão
  const ownQueues = await Queue.findAll({
    where: { id: queueIds, companyId: whatsapp.companyId },
    attributes: ["id"]
  });
  await whatsapp.$set(
    "queues",
    ownQueues.map(q => q.id)
  );

  await whatsapp.reload();
};

export default AssociateWhatsappQueue;
