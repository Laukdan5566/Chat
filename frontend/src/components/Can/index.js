import rules from "../../rules";
import { managementPermissionKeys } from "../../helpers/userPermissions";

const check = (role, action, data, userPermissions) => {
  if (
    action === "drawer-admin-items:view" &&
    managementPermissionKeys.some(permission => userPermissions?.[permission])
  ) {
    return true;
  }

  if (action.startsWith("user-modal:") && userPermissions?.["users:view"]) {
    return true;
  }

  if (
    action === "tickets-manager:showall" &&
    userPermissions?.["tickets-manager:showQueueTickets"]
  ) {
    return true;
  }

  if (userPermissions?.[action]) {
    return true;
  }

  const rolePermissions = rules[role];
  if (!rolePermissions) {
    // role is not present in the rules
    return false;
  }

  const staticPermissions = rolePermissions.static;

  if (staticPermissions && staticPermissions.includes(action)) {
    // static rule not provided for action
    return true;
  }

  const dynamicPermissions = rolePermissions.dynamic;

  if (dynamicPermissions) {
    const permissionCondition = dynamicPermissions[action];
    if (!permissionCondition) {
      // dynamic rule not provided for action
      return false;
    }

    return permissionCondition(data);
  }
  return false;
};

const Can = ({ role, perform, data, permissions, yes, no }) =>
  check(role, perform, data, permissions) ? yes() : no();

Can.defaultProps = {
  yes: () => null,
  no: () => null
};

export { Can };
