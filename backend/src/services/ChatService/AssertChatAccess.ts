import Chat from "../../models/Chat";
import ChatUser from "../../models/ChatUser";
import AppError from "../../errors/AppError";

interface Requester {
  id: number | string;
  companyId: number;
}

// O chat precisa ser da empresa de quem chama e quem chama precisa ser membro (ou
// dono, quando ownerOnly). Sem isso, qualquer usuário logado age em chats alheios por id.
const AssertChatAccess = async (
  chatId: number | string,
  user: Requester,
  options: { ownerOnly?: boolean } = {}
): Promise<Chat> => {
  const chat = await Chat.findOne({
    where: { id: chatId, companyId: user.companyId }
  });

  if (!chat) {
    throw new AppError("ERR_NO_CHAT_FOUND", 404);
  }

  const isOwner = chat.ownerId === +user.id;

  if (options.ownerOnly) {
    if (!isOwner) throw new AppError("ERR_FORBIDDEN", 403);
    return chat;
  }

  if (!isOwner) {
    const member = await ChatUser.findOne({
      where: { chatId: chat.id, userId: +user.id }
    });
    if (!member) throw new AppError("ERR_FORBIDDEN", 403);
  }

  return chat;
};

export default AssertChatAccess;
