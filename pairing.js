import {
  getChannel,
  addPreviousPair,
  getPreviousPairs,
  getPreferredPairs,
  setUnpaired,
  setCurrentPairs,
  getWeek,
  setWeek,
  getActivePeople,
  getCurrentPairs,
  optInAll,
  updatePersonOptIn,
  removePreferredPair,
} from "./database.js";

import client from "./bot.js";

function shuffleArray(array) {
  // Start from the end of the array
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index between 0 and i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements array[i] and array[j]
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function getPairingData(serverId) {
  const [previousPairs, preferredPairs] = await Promise.all([
    getPreviousPairs(serverId),
    getPreferredPairs(serverId),
  ]);
  return { previousPairs, preferredPairs };
}

async function initWeek(serverId) {
  // create a list of users that are waiting to be paired
  const week = await getWeek(serverId);
  const people = await getActivePeople(serverId);

  // make a list of people whose frequency is a factor of the current week
  const toPair = people
    .filter((person) => (week + 1) % person.frequency === 0)
    .map((person) => person.userId);

  // increment week by 1
  await setWeek(serverId, week + 1);
  await setUnpaired(toPair, serverId);

  return { week: week + 1, toPair: shuffleArray(toPair) };
}

export async function generatePairing(serverId) {
  const { week, toPair } = await initWeek(serverId);
  const { previousPairs, preferredPairs } = await getPairingData(serverId);

  const currentPairs = [];
  const remainingToPair = new Set(toPair);

  // create the pairings
  // pair all the preferred pairs
  for (const pair of preferredPairs) {
    const user1 = pair.user1Id;
    const user2 = pair.user2Id;  
    if (remainingToPair.has(user1) && remainingToPair.has(user2)) {
      currentPairs.push([user1, user2]);
      remainingToPair.delete(user1);
      remainingToPair.delete(user2);
      await removePreferredPair(user1, user2, serverId);
    }
  }
  // pair all the previously unpaired pairs
  for (const user1 of remainingToPair) {
    for (const user2 of remainingToPair) {
      if (
        user1 !== user2 &&
        !previousPairs.some(
          (pair) =>
            (pair.user1Id === user1 && pair.user2Id === user2) ||
            (pair.user1Id === user2 && pair.user2Id === user1)
        )
      ) {
        currentPairs.push([user1, user2]);
        remainingToPair.delete(user1);
        remainingToPair.delete(user2);
        break;
      }
    }
    if (!remainingToPair.has(user1)) break;
  }

  // pair all the remaining pairs
  const remainingUsers = Array.from(remainingToPair);
  for (let i = 0; i < remainingUsers.length - 1; i += 2) {
    currentPairs.push([remainingUsers[i], remainingUsers[i + 1]]);
  }

  // handle unpaired user - if there is an odd number of users, save the last
  // (stored as a list in case we introduce option for dispreferred pairs etc)
  const unpairedUsers =
    remainingUsers.length % 2 === 1
      ? [remainingUsers[remainingUsers.length - 1]]
      : [];

  // Save current pairs and update previous pairs
  await Promise.all([
    setCurrentPairs(currentPairs, serverId),
    setUnpaired(unpairedUsers, serverId), // here we only keep users who are opted in
    ...currentPairs.map(([user1, user2]) =>
      addPreviousPair(user1, user2, serverId, new Date())
    ), // NOTE perhaps this is better done in initWeek for the past week's pairs (so you can handle non-attendance etc)
  ]);

  // output the pairings to Discord
  const channelId = await getChannel(serverId);
  const channel = client.channels.cache.get(channelId);
  channel.send(`Week ${week} pairings: `);
  for (const [user1, user2] of currentPairs) {
    await channel.send(`<@${user1}> <@${user2}>`);
  }
  if (unpairedUsers.length > 0) {
    await channel.send(`<@${unpairedUsers[0]}> is not paired this week.`);
  }
}

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

export async function optoutMessage(serverId) {
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