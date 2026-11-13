import Chat from "../../models/Chat";
import ChatUser from "../../models/ChatUser";
import User from "../../models/User";

interface ChatData {
  id: number;
  title?: string;
  users?: any[];
  companyId: number;
}

export default async function UpdateService(data: ChatData) {
  const { users, companyId } = data;
  const record = await Chat.findByPk(data.id, {
    include: [{ model: ChatUser, as: "users" }]
  });
  const { ownerId } = record;

  await record.update({ title: data.title });

  if (Array.isArray(users)) {
    await ChatUser.destroy({ where: { chatId: record.id } });
    await ChatUser.create({ chatId: record.id, userId: ownerId });
    // só entram membros da mesma empresa do chat
    const sameCompany = await User.findAll({
      where: { id: users.map(u => u.id), companyId },
      attributes: ["id"]
    });
    for (const { id: userId } of sameCompany) {
      if (userId !== ownerId) {
        await ChatUser.create({ chatId: record.id, userId });
      }
    }
  }

  await record.reload({
    include: [
      {
        model: ChatUser,
        as: "users",
        include: [{ model: User, as: "user", attributes: ["id", "name"] }]
      },
      { model: User, as: "owner", attributes: ["id", "name"] }
    ]
  });

  return record;
}
