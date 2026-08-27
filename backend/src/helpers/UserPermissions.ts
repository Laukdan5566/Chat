import User from "../models/User";

export const hasPermission = (
  user: Pick<User, "profile" | "super" | "permissions">,
  permission: string
): boolean => {
  if (!user) return false;
  if (user.super || user.profile === "admin") return true;
  return Boolean(user.permissions?.[permission]);
};

export const hasAnyPermission = (
  user: Pick<User, "profile" | "super" | "permissions">,
  permissions: string[]
): boolean => {
  return permissions.some(permission => hasPermission(user, permission));
};
