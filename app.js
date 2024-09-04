import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { schedule } from "node-cron";
import { writeFileSync, unlinkSync } from "fs";
import {
  addServer,
  removePreferredPairsForUser,
  removeUnpaired,
  getCurrentPairWithUser,
  removeCurrentPairsForUser,
  removePreviousPair,
  getUnpaired,
  addCurrentPair,
  addUnpaired,
  findUser,
  getChannel,
  updatePersonFrequency,
  isPreferredPair,
  addPreferredPair,
  addPreviousPair,
  getPreviousPairs,
  addPerson,
  getPeople,
  getWeek,
  getCurrentPairs,
  getPreferredPairs,
  initializeDatabase,
  setWeek,
  setUnpaired,
  setCurrentPairs,
  optInAll,
  updatePersonOptIn,
  getAdminRole,
  setAdminRole,
  setStatus,
  getActivePeople,
} from "./database.js";

import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

try {
  await initDb();
} catch (error) {
  console.error("Error initializing database:", error);
  process.exit(1);
}

client.on("error", (err) => {
  console.err(err.message);
});

async function setupCommands(guild) {
  await guild.commands.set([
    {
      name: "join",
      description: "Join the 1-1 programme.",
    },
    {
      name: "leave",
      description: "Leave the 1-1 programme.",
    },
    {
      name: "change-frequency",
      description: "Change your meeting frequency to once every [period] week.",
      options: [
        {
          name: "period",
          description: "The number of weeks between successive meetings.",
          type: 4,
          required: true,
        },
      ],
    },
    {
      name: "add-preferred-partner",
      description: "Suggest a person you would like to meet.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the preferred partner, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "add-previous-partner",
      description:
        "Manually enter into record a person you have recently met with.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the previous partner, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "check-current-partner",
      description: "Outputs your current partner.",
    },
    {
      name: "check-previous-partners",
      description: "Outputs a list of your previous partners.",
    },

    {
      name: "pair",
      description: "Manually run the pairing function.",
    },
    {
      name: "optout",
      description: "Test the message for opting out.",
    },
    {
      name: "reminder",
      description: "Test the reminder function.",
    },
    {
      name: "debug",
      description: "Output all the arrays as a reply.",
    },
    {
      name: "kick",
      description: "Kick the specified user.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the user being kicked, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "set-admin-role",
      description: "Set the admin role for 1-on-1 bot commands",
      options: [
        {
          name: "role",
          description: "The role to set as admin",
          type: 8, // ROLE
          required: true,
        },
      ],
    },
  ]);
}

// When added to a new server, add a 1-1s channel, and save to database
client.on("guildCreate", async (guild) => {
  console.log("Added to a new server:", guild.name);
  try {
    // Create a category for the 1-1s programme
    const category = await guild.channels.create({
      name: "1-1s",
      type: ChannelType.GuildCategory,
    });

    // Create a new text channel with default permissions (no overwrites)
    const channel = await guild.channels.create({
      name: "1-on-1s",
      type: ChannelType.GuildText,
      topic: "A channel for 1-1 pairings.",
      parent: category.id,
    });
    // Save the server to the database
    await addServer(guild.id, channel.id);
    await setupServerJobs(guild.id);

    // Set up commands for the server
    await setupCommands(guild);
  } catch (err) {
    console.error(`Error initialising bot in new server: ${err}`);
  }
});

client.once("ready", async () => {
  console.log("Bot is ready.");
  client.guilds.cache.forEach(async (guild) => {
    // Cron jobs
    await setupServerJobs(guild.id);
  });
  client.user.setActivity("slash commands in the server", {
    type: "LISTENING",
  });
});

async function removeUser(userId, serverId) {
  await removePreferredPairsForUser(userId, serverId);
  await removeUnpaired(userId, serverId);
  const currentPair = await getCurrentPairWithUser(userId, serverId);
  let partnerId;
  let newPartner;
  // NOTE gotcha - an empty array is truthy
  if (currentPair.length > 0) {
    partnerId =
      currentPair.user1Id === userId
        ? currentPair[0].user2Id
        : currentPair[0].user1Id;
    await removeCurrentPairsForUser(userId, serverId);
    // remove user and partner from each other's previous list
    await removePreviousPair(userId, partnerId, serverId);
    // find a new partner for partner
    const unpaired = await getUnpaired(serverId);
    if (unpaired.length > 0) {
      newPartner = unpaired[0].userId;
      await addCurrentPair(partnerId, newPartner, serverId);
      await removeUnpaired(newPartner, serverId);
    } else {
      await addUnpaired(partnerId, serverId);
    }
  }
  await setStatus(userId, serverId, "left");
  return [partnerId, newPartner];
}

async function isAdmin(member, serverId) {
  const adminRoleId = await getAdminRole(serverId);
  return (
    member.roles.cache.has(adminRoleId) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options, guild } = interaction;
  console.log("command: ", commandName);
  let role = guild.roles.cache.find((role) => role.name === "1-1");
  if (!role) {
    role = await guild.roles.create({
      name: "1-1",
      color: 0,
      mentionable: true,
      reason: "Creating role for 1-1 programme",
    });
  }

  // admin only commands
  if (
    commandName === "pair" ||
    commandName === "debug" ||
    commandName === "kick" ||
    commandName === "optout" ||
    commandName === "reminder"
  ) {
    if (await isAdmin(interaction.member, interaction.guild.id)) {
      if (commandName === "optout") {
        await optoutmessage(interaction.guild.id);
        await interaction.reply({
          content: `I sent the message. Try it out!`,
          ephemeral: true,
        });
      }
      if (commandName === "reminder") {
        await reminder(guild.id);
        await interaction.reply({
          content: `I've sent everyone a reminder!`,
          ephemeral: true,
        });
      }
      if (commandName === "pair") {
        await pairing(guild.id);
        await interaction.reply({
          content: `I've paired everyone up!`,
          ephemeral: true,
        });
      }

      if (commandName === "debug") {
        await debug(interaction, guild.id);
      }

      if (commandName === "kick") {
        let tag = options.getString("tag");
        if (tag.length < 3) {
          await interaction.reply({
            content: "Invalid tag format. Please provide a valid Discord tag.",
            ephemeral: true,
          });
          return;
        }
        tag = tag.substring(2, tag.length - 1);
        const confirmationMessage = await interaction.reply({
          content: `Are you sure you want to kick <@${tag}> from the 1-1 programme?`,
          ephemeral: true,
          components: [
            {
              type: 1, // ACTION_ROW
              components: [
                {
                  type: 2, // BUTTON
                  style: 4, // DANGER
                  label: "Yes",
                  customId: "confirm",
                },
                {
                  type: 2, // BUTTON
                  style: 2, // SECONDARY
                  label: "No",
                  customId: "cancel",
                },
              ],
            },
          ],
        });

        const collector = interaction.channel.createMessageComponentCollector({
          time: 15000,
        });

        collector.on("collect", async (i) => {
          if (i.customId === "confirm") {
            // remove the 1-1 role from the user
            const member = guild.members.cache.get(tag);
            if (member) {
              await member.roles.remove(role).catch(console.error);
            }

            const found = await findUser(tag, guild.id);

            if (found) {
              const [partnerId, newPartner] = await removeUser(tag, guild.id);
              if (newPartner) {
                const channelId = await getChannel(guild.id);
                const channel = client.channels.cache.get(channelId);
                await channel.send(
                  `New pair: <@${partnerId}> <@${newPartner}>`
                );
              }
              await i
                .update({
                  content: `I removed <@${tag}> from the 1-1 programme. I'll retain a list of their recent meetings.`,
                  components: [],
                })
                .catch(console.error);
            } else {
              await i
                .update({ content: `User not found`, components: [] })
                .catch(console.error);
            }
          } else if (i.customId === "cancel") {
            await i
              .update({ content: `Kicking cancelled`, components: [] })
              .catch(console.error);
          }
        });
      }
    } else {
      await interaction.reply({
        content: `Only an admin can use this command.`,
        ephemeral: true,
      });
    }
  }

  if (commandName === "set-admin-role") {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: "You need to be a server administrator to use this command.",
        ephemeral: true,
      });
      return;
    }

    const role = interaction.options.getRole("role");
    await setAdminRole(interaction.guild.id, role.id);
    await interaction.reply({
      content: `Set ${role.name} as the admin role for 1-on-1 bot commands.`,
      ephemeral: true,
    });
  }

  // TODO need to handle case where user joined then left and now rejoins
  const user = await findUser(interaction.user.id, guild.id);
  if (user) {
    if (user.status === "left") {
      if (commandName === "join") {
        // handle rejoining
        await setStatus(interaction.user.id, guild.id, "active");
        await interaction.member.roles.add(role);
        await updatePersonFrequency(interaction.user.id, guild.id, 1);
        await interaction.reply(
          `<@${interaction.user.id}> welcome back to the 1-1 programme! We've reset your frequency to weekly, so make sure to use \`/change-frequency\` to alter it if desired.`
        );

        // find a partner for new user, if possible
        const unpaired = await getUnpaired(guild.id);
        const channelId = await getChannel(guild.id);
        const channel = client.channels.cache.get(channelId);
        if (unpaired.length > 0) {
          const partnerId = unpaired[0].userId;

          // add the pair to the database
          await Promise.all([
            addCurrentPair(
              interaction.user.id,
              partnerId,
              interaction.guild.id
            ),
            addPreviousPair(
              interaction.user.id,
              partnerId,
              interaction.guild.id,
              new Date()
            ),
            removeUnpaired(partnerId, interaction.guild.id),
          ]);

          await channel.send(
            `New pair: <@${interaction.user.id}> <@${partnerId}>`
          );
        } else {
          await addUnpaired(interaction.user.id, guild.id);
        }
      } else {
        await interaction.reply({
          content: `You have left the programme. Use /join to rejoin.`,
          ephemeral: true,
        });
      }
    } else {
      if (commandName === "join") {
        await interaction.reply({
          content: `You have already joined the programme!`,
          ephemeral: true,
        });
      }

      // leave 1-1
      if (commandName === "leave") {
        const confirmationMessage = await interaction.reply({
          content:
            "Are you sure you want to leave the 1-1 programme? Your streak will be reset, and your partner will be reassigned another partner.",
          ephemeral: true,
          components: [
            {
              type: 1, // ACTION_ROW
              components: [
                {
                  type: 2, // BUTTON
                  style: 4, // DANGER
                  label: "Yes",
                  customId: "confirm",
                },
                {
                  type: 2, // BUTTON
                  style: 2, // SECONDARY
                  label: "No",
                  customId: "cancel",
                },
              ],
            },
          ],
        });

        const collector = interaction.channel.createMessageComponentCollector({
          time: 15000,
        });

        collector.on("collect", async (i) => {
          if (i.customId === "confirm") {
            await interaction.member.roles.remove(role);

            const [partnerId, newPartner] = await removeUser(
              interaction.user.id,
              guild.id
            );

            const channelId = await getChannel(guild.id);
            const channel = client.channels.cache.get(channelId);
            channel.send(
              `<@${interaction.user.id}> has left the 1:1 programme.`
            );
            if (newPartner) {
              await channel.send(`New pair: <@${partnerId}> <@${newPartner}>`);
            } else if (partnerId) {
              await channel.send(`<@${partnerId}> is now unpaired.`);
            }
            await i
              .update({
                content: `I removed you from the 1-1 programme. I'll retain a list of your recent meetings in case you change your mind :)`,
                components: [],
              })
              .catch(console.error);
            collector.stop();
          } else if (i.customId === "cancel") {
            await i
              .update({ content: `Leaving cancelled`, components: [] })
              .catch(console.error);
            collector.stop();
          }
        });
      }

      // change meeting frequency
      if (commandName === "change-frequency") {
        let period = options.getInteger("period");
        if (period < 1) {
          await interaction.reply({
            content: `You must input a positive integer!`,
            ephemeral: true,
          });
        } else {
          await updatePersonFrequency(interaction.user.id, guild.id, period);
          await interaction.reply({
            content: "Your frequency has been updated successfully.",
            ephemeral: true,
          });
        }
      }

      // add preferred partner
      if (commandName === "add-preferred-partner") {
        let tag = options.getString("tag");
        if (tag.length < 3) {
          await interaction.reply({
            content: "Invalid tag format. Please provide a valid Discord tag.",
            ephemeral: true,
          });
          return;
        }
        let partner = tag.substring(2, tag.length - 1);
        if (partner === interaction.user.id) {
          await interaction.reply({
            content: "You cannot add yourself as a partner.",
            ephemeral: true,
          });
          return;
        }
        const partnerFound = await findUser(partner, guild.id);
        if (!partnerFound) {
          await interaction.reply({
            content: "Partner not found.",
            ephemeral: true,
          });
          return;
        }
        const existingPreference = await isPreferredPair(
          interaction.user.id,
          partner,
          guild.id
        );
        if (existingPreference) {
          await interaction.reply({
            content:
              "This user is already in your list of preferred partners / you are already in their list of preferred partners.",
            ephemeral: true,
          });
          return;
        }
        await addPreferredPair(interaction.user.id, partner, guild.id);
        await interaction.reply({
          content: "Preferred partner added successfully.",
          ephemeral: true,
        });
      }

      // add previous partner
      if (commandName === "add-previous-partner") {
        let tag = options.getString("tag");
        if (tag.length < 3) {
          await interaction.reply({
            content: "Invalid tag format. Please provide a valid Discord tag.",
            ephemeral: true,
          });
          return;
        }
        let partner = tag.substring(2, tag.length - 1);
        if (partner === interaction.user.id) {
          await interaction.reply({
            content: "You cannot add yourself as a partner.",
            ephemeral: true,
          });
          return;
        }
        const partnerFound = await findUser(partner, guild.id);
        if (!partnerFound) {
          await interaction.reply({
            content: "Partner not found.",
            ephemeral: true,
          });
          return;
        }
        await addPreviousPair(interaction.user.id, partner, guild.id);
        await interaction.reply({
          content: "Previous partner added successfully.",
          ephemeral: true,
        });
      }

      // check current partner
      if (commandName === "check-current-partner") {
        const currentPair = await getCurrentPairWithUser(
          interaction.user.id,
          guild.id
        ); // NOTE this returns an array, maybe change driver function to return a single pair

        if (currentPair.length === 0) {
          await interaction.reply({
            content: "You are not currently paired.",
            ephemeral: true,
          });
        } else {
          const partner =
            currentPair[0].user1Id === interaction.user.id
              ? currentPair[0].user2Id
              : currentPair[0].user1Id;
          await interaction.reply({
            content: `Your current partner is <@${partner}>.`,
            ephemeral: true,
          });
        }
      }

      //check previous partners
      if (commandName === "check-previous-partners") {
        // Check if the user has any previous partners
        const previousPartners = await getPreviousPairs(
          interaction.user.id,
          guild.id
        );
        if (previousPartners.length === 0) {
          await interaction.reply({
            content: "You have no previous partners.",
            ephemeral: true,
          });
          return;
        }

        // Output the list of previous partners
        const partners = previousPartners.map((pair) => `<@${pair.user2Id}>`);
        const message = `Your previous partners are: ${partners.join(", ")}`;

        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  } else {
    // joining 1-1
    if (commandName === "join") {
      // update the people array in the db
      await addPerson(interaction.user.id, guild.id, 1, 1);

      // implement the changes in Discord
      await interaction.member.roles.add(role);
      await interaction.reply(
        `<@${interaction.user.id}> welcome to the 1-1 programme! Your meeting frequency is set to weekly by default. Use \`/change-frequency\` to alter it.`
      );

      // find a partner for new user, if possible
      const unpaired = await getUnpaired(guild.id);
      const channelId = await getChannel(guild.id);
      const channel = client.channels.cache.get(channelId);
      if (unpaired.length > 0) {
        const partnerId = unpaired[0].userId;

        // add the pair to the database
        await Promise.all([
          addCurrentPair(interaction.user.id, partnerId, interaction.guild.id),
          addPreviousPair(
            interaction.user.id,
            partnerId,
            interaction.guild.id,
            new Date()
          ),
          removeUnpaired(partnerId, interaction.guild.id),
        ]);

        await channel.send(
          `New pair: <@${interaction.user.id}> <@${partnerId}>`
        );
      } else {
        await addUnpaired(interaction.user.id, guild.id);
      }
    } else {
      await interaction.reply({
        content: `You need to join the 1-1 programme first using /join.`,
        ephemeral: true,
      });
    }
  }
});

async function debug(interaction, serverId) {
  console.log("starting debug");
  let debugOutput = "People:\n";
  const people = await getPeople(serverId);
  people.forEach((person) => {
    debugOutput += JSON.stringify(person) + "\n";
  });
  const week = await getWeek(serverId);
  debugOutput += "\nWeek: " + week + "\n\n";
  debugOutput += "Current Pairs:\n";
  const currentPairs = await getCurrentPairs(serverId);
  currentPairs.forEach((pair) => {
    debugOutput += JSON.stringify(pair) + "\n";
  });
  debugOutput += "\nPreferred Pairs:\n";
  const preferredPairs = await getPreferredPairs(serverId);
  preferredPairs.forEach((pair) => {
    debugOutput += JSON.stringify(pair) + "\n";
  });
  debugOutput += "\nPrevious Pairs:\n";
  const previousPairs = await getPreviousPairs(serverId);
  previousPairs.forEach((pair) => {
    debugOutput += JSON.stringify(pair) + ", ";
    debugOutput += "\n\n";
  });
  debugOutput += "\nUnpaired people:\n";
  const unpaired = await getUnpaired(serverId);
  unpaired.forEach((person) => {
    debugOutput += JSON.stringify(person) + "\n";
  });

  // Write debug output to a file
  const filePath = "./debug_output.txt";
  writeFileSync(filePath, debugOutput);

  // Send debug output as a file attachment
  await interaction.reply({
    content: "See attachment.",
    files: [
      {
        attachment: filePath,
        name: "debug_output.txt",
      },
    ],
    ephemeral: true,
  });

  // Delete the temporary file after sending
  unlinkSync(filePath);
}

async function initDb() {
  await initializeDatabase();
  console.log("Database initialized successfully.");
}

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

async function getPairingData(serverId) {
  const [previousPairs, preferredPairs] = await Promise.all([
    getPreviousPairs(serverId),
    getPreferredPairs(serverId),
  ]);
  return { previousPairs, preferredPairs };
}

async function pairing(serverId) {
  const { week, toPair } = await initWeek(serverId);
  const { previousPairs, preferredPairs } = await getPairingData(serverId);

  const currentPairs = [];
  const remainingToPair = new Set(toPair);

  // create the pairings
  // pair all the preferred pairs
  for (const [user1, user2] of preferredPairs) {
    if (remainingToPair.has(user1) && remainingToPair.has(user2)) {
      currentPairs.push([user1, user2]);
      remainingToPair.delete(user1);
      remainingToPair.delete(user2);
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

async function reminder(serverId) {
  const currentPairs = await getCurrentPairs(serverId);
  for (const [user1Id, user2Id] of currentPairs) {
    const user1 = await client.users.fetch(user1Id);
    const user2 = await client.users.fetch(user2Id);

    user1
      .send(
        `Don't forget to meet up with ${user2.username}, if you haven't already!`
      )
      .catch(console.error);

    user2
      .send(
        `Don't forget to meet up with ${user1.username}, if you haven't already!`
      )
      .catch(console.error);
  }
}

async function optoutmessage(serverId) {
  // Opt everybody in initially
  await optInAll(serverId);
  const channelId = await getChannel(serverId);
  const channel = client.channels.cache.get(channelId);
  const optoutMessage = await channel.send(
    "React to this message with ❌ to opt out of pairings this week!"
  );
  await optoutMessage.react("❌");

  const filter = (reaction, user) => reaction.emoji.name === "❌" && !user.bot;

  const collector = optoutMessage.createReactionCollector({
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

  collector.on("end", (collected, reason) => {
    // could potentially ping everyone who opted out here but that might be annoying
  });
}

const cronJobs = new Map();

async function setupServerJobs(serverId) {
  // Cancel existing jobs if any
  if (cronJobs.has(serverId)) {
    cronJobs.get(serverId).forEach((job) => job.stop());
  }

  const jobs = [
    // Weekly pairing
    // schedule("0 0 * * 1", async () => {
    schedule(
      "*/1 * * * *",
      async () => {
        await pairing(serverId);
      },
      { timezone: "UTC" }
    ),

    // Weekly reminder
    // schedule("0 0 * * 6", async () => {
    schedule(
      "*/1 * * * *",
      async () => {
        await reminder(serverId);
      },
      { timezone: "UTC" }
    ),

    // Weekly opt-out message
    // schedule("0 0 * * 6", async () => {
    schedule(
      "*/1 * * * *",
      async () => {
        await optoutmessage(serverId);
      },
      { timezone: "UTC" }
    ),
  ];

  cronJobs.set(serverId, jobs);
}

try {
  client.login(process.env.TOKEN);
  console.log("Bot logged in successfully.");
} catch (error) {
  console.error("Error logging in:", error);
  process.exit(1);
}

async function shutdownBot() {
  try {
    await client.destroy();
    console.log("Bot connection closed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error shutting down bot:", error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on("SIGINT", shutdownBot);
process.on("SIGTERM", shutdownBot);
