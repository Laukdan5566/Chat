export const permissionGroups = [
  {
    title: "Atendimento",
    items: [
      { key: "tickets-manager:showall", label: "Ver todos os tickets" },
      {
        key: "tickets-manager:showQueueTickets",
        label: "Ver tickets das próprias filas"
      },
      {
        key: "ticket-participants:manage",
        label: "Adicionar participantes ao ticket"
      },
      {
        key: "ticket-participants:view",
        label: "Ver tickets onde participa"
      },
      {
        key: "ticket-participants:sendMessage",
        label: "Enviar mensagem como participante"
      },
      { key: "ticket-options:deleteTicket", label: "Excluir tickets" },
      { key: "contacts-page:deleteContact", label: "Excluir contatos" }
    ]
  },
  {
    title: "Gestão",
    items: [
      { key: "dashboard:view", label: "Dashboard" },
      { key: "connections:view", label: "Conexões" },
      { key: "connections-page:addConnection", label: "Adicionar conexão" },
      {
        key: "connections-page:editOrDeleteConnection",
        label: "Editar/remover conexão"
      },
      { key: "queues:view", label: "Filas" },
      { key: "users:view", label: "Usuários" },
      { key: "messages-api:view", label: "API de mensagens" },
      { key: "financeiro:view", label: "Financeiro" },
      { key: "settings:view", label: "Configurações" }
    ]
  },
  {
    title: "Campanhas",
    items: [
      { key: "campaigns:view", label: "Campanhas" },
      { key: "contact-lists:view", label: "Listas de contatos" },
      { key: "campaigns-config:view", label: "Configurações de campanha" }
    ]
  }
];

export const managementPermissionKeys = permissionGroups
  .filter(group => group.title !== "Atendimento")
  .flatMap(group => group.items)
  .map(item => item.key);

export const normalizePermissions = permissions => {
  if (!permissions || typeof permissions !== "object") return {};
  const normalized = Object.keys(permissions).reduce((acc, key) => {
    if (permissions[key]) acc[key] = true;
    return acc;
  }, {});

  if (managementPermissionKeys.some(key => normalized[key])) {
    normalized["drawer-admin-items:view"] = true;
  }

  return normalized;
};

export const hasUserPermission = (user, permission) => {
  if (!user) return false;
  if (user.super || user.profile === "admin") return true;
  return Boolean(user.permissions?.[permission]);
};

export const hasAnyUserPermission = (user, permissions) =>
  permissions.some(permission => hasUserPermission(user, permission));
