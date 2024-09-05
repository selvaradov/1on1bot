import { PermissionFlagsBits } from "discord.js";
import { getAdminRole } from "./database.js";

export async function is1to1Admin(member, serverId) {
  const adminRoleId = await getAdminRole(serverId);
  return (
    member.roles.cache.has(adminRoleId) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

export async function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export async function getRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === "1-1");
  return role;
}

export async function getOrCreateRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === "1-1");
  if (!role) {
    role = await guild.roles.create({
      name: "1-1",
      color: 0,
      mentionable: true,
      reason: "Creating role for 1-1 programme",
    });
  }
  return role;
}
