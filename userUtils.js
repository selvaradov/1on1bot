import {
  removePreferredPairsForUser,
  removeUnpaired,
  getCurrentPairWithUser,
  removeCurrentPairsForUser,
  getUnpaired,
  addCurrentPair,
  addUnpaired,
  getChannel,
  setStatus,
  getPreferredPairs,
  removePreferredPair,
} from "./database.js";

import client from "./bot.js";

export const removeUser = async (userId, serverId) => {
  // Notify the server
  const channelId = await getChannel(serverId);
  const channel = client.channels.cache.get(channelId);
  await channel.send(`<@${userId}> has left the 1-1 programme.`);

  await removePreferredPairsForUser(userId, serverId);
  await removeUnpaired(userId, serverId);
  const currentPair = await getCurrentPairWithUser(userId, serverId);
  if (currentPair.length > 0) {
    const partnerId =
      currentPair[0].user1Id === userId
        ? currentPair[0].user2Id
        : currentPair[0].user1Id;
    await removeCurrentPairsForUser(userId, serverId);
    await findPartnerForUser(partnerId, serverId);
  }
  await setStatus(userId, serverId, "left");
};

export const findPartnerForUser = async (userId, serverId) => {
  const [unpaired, preferredPairs] = await Promise.all([
    getUnpaired(serverId),
    getPreferredPairs(serverId),
  ]);
  const channelId = await getChannel(serverId);
  const channel = client.channels.cache.get(channelId);

  // Check for preferred pairs
  const preferredPair = preferredPairs.find(
    pair => pair.user1Id === userId || pair.user2Id === userId
  );

  if (preferredPair) {
    const partnerId = preferredPair.user1Id === userId ? preferredPair.user2Id : preferredPair.user1Id;
    if (unpaired.some(user => user.userId === partnerId)) {
      await Promise.all([
        addCurrentPair(userId, partnerId, serverId),
        removeUnpaired(partnerId, serverId),
        removePreferredPair(userId, partnerId, serverId),
      ]);
      await channel.send(`New pair: <@${userId}> <@${partnerId}>`);
      return partnerId;
    }
  }

  // Otherwise, use existing unpaired user
  if (unpaired.length > 0) {
    const partnerId = unpaired[0].userId;
    await Promise.all([
      addCurrentPair(userId, partnerId, serverId),
      removeUnpaired(partnerId, serverId),
    ]);
    await channel.send(`New pair: <@${userId}> <@${partnerId}>`);
    return partnerId;
  } else {
    await addUnpaired(userId, serverId);
    await channel.send(`<@${userId}> is now unpaired.`);
    return null;
  }
};
