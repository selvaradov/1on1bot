import client from "./bot.js";
import {
  getCurrentPairs,
  optInAll,
  getChannel,
  updatePersonOptIn,
  getWeek,
  getPreviousPairsForWeek,
} from "./database.js";
import { sendFeedbackDM } from "./feedback.js";

export async function sendReminder(serverId) {
  const currentPairs = await getCurrentPairs(serverId);
  for (const pair of currentPairs) {
    const user1 = await client.users.fetch(pair.user1Id);
    const user2 = await client.users.fetch(pair.user2Id);

    user1.send(
      `Don't forget to meet up with ${user2.username}, if you haven't already!`
    );

    user2.send(
      `Don't forget to meet up with ${user1.username}, if you haven't already!`
    );
  }
}

export async function sendOptoutMessage(serverId) {
  console.log(`📨 sendOptoutMessage called for server ${serverId} at ${new Date().toISOString()}`);
  // Opt everybody in initially
  await optInAll(serverId);
  const channelId = await getChannel(serverId);
  const channel = client.channels.cache.get(channelId);
  const message = await channel.send(
    "React to this message with ❌ to opt out of pairings this week!"
  );
  await message.react("❌");

  const filter = (reaction, user) => reaction.emoji.name === "❌" && !user.bot;

  const collector = message.createReactionCollector({
    filter,
    time: 172800000,
    dispose: true,
  });

  // Handle reactions added and removed
  collector.on(
    "collect",
    async (reaction, user) => await updatePersonOptIn(user.id, serverId, 0)
  );
  collector.on(
    "remove",
    async (reaction, user) => await updatePersonOptIn(user.id, serverId, 1)
  );

  // could potentially ping everyone who opted out here but that might be annoying
}

export async function requestFeedback(serverId) {
  const currentWeek = await getWeek(serverId);
  if (currentWeek === 0) {
    return;
  }
  const previousWeek = currentWeek - 1;

  const previousPairs = await getPreviousPairsForWeek(serverId, previousWeek);


  for (const pair of previousPairs) {
    await sendFeedbackDM(pair.user1Id, pair.user2Id, serverId, previousWeek);
    await sendFeedbackDM(pair.user2Id, pair.user1Id, serverId, previousWeek);
  }
}