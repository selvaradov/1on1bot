import { ChannelType } from "discord.js";
import { schedule } from "node-cron";
import { addServer, findUser, getChannel, initialiseDatabase } from "./database.js";
import { removeUser } from "./userUtils.js";
import * as commandHandlers from "./commandHandlers.js";
import { generatePairing } from "./pairing.js";
import {
  sendReminder,
  sendOptoutMessage,
  requestFeedback,
} from "./messages.js";
import client, { shutdownBot } from "./bot.js";

import dotenv from "dotenv";
dotenv.config();

try {
  await initialiseDatabase();
} catch (error) {
  console.error("Error initializing database:", error);
  process.exit(1);
}

client.on("error", (err) => {
  console.error(err.message);
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
      name: "feedback",
      description: "Test the feedback request system.",
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
          description: "Discord tag or ID of the user to remove",
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

async function initializeServer(guild) {
  const channel = await getChannel(guild.id);
  if (!channel) {
    // New server, create channel and add to database
    const category = await guild.channels.create({
      name: "1-1s",
      type: ChannelType.GuildCategory,
    });
    const channel = await guild.channels.create({
      name: "1-on-1s",
      type: ChannelType.GuildText,
      topic: "A channel for 1-1 pairings.",
      parent: category.id,
    });
    await addServer(guild.id, channel.id);
  }
  await setupServerJobs(guild.id);
  await setupCommands(guild);
}

// When added to a new server, add a 1-1s channel, and save to database
client.on("guildCreate", async (guild) => {
  // (hopefully fixed) NOTE if added to a server whilst offline it will not initialise correctly
  console.log("Added to a new server:", guild.name);
  try {
    await initializeServer(guild);
  } catch (err) {
    console.error(`Error initialising bot in new server: ${err}`);
  }
});

client.once("ready", async () => {
  console.log("Bot is ready.");
  for (const guild of client.guilds.cache.values()) {
    await initializeServer(guild);
  }
  client.user.setActivity("slash commands in the server", {
    type: "LISTENING",
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, guild } = interaction;
  console.log("command: ", commandName);
  const handlers = {
    join: () => commandHandlers.handleJoin(interaction, guild),
    leave: () => commandHandlers.handleLeave(interaction, guild),
    "change-frequency": () =>
      commandHandlers.handleChangeFrequency(interaction, guild),
    "add-preferred-partner": () =>
      commandHandlers.handleAddPreferredPartner(interaction, guild),
    "add-previous-partner": () =>
      commandHandlers.handleAddPreviousPartner(interaction, guild),
    "check-current-partner": () =>
      commandHandlers.handleCheckCurrentPartner(interaction, guild),
    "check-previous-partners": () =>
      commandHandlers.handleCheckPreviousPartners(interaction, guild),
    pair: () => commandHandlers.handlePair(interaction, guild),
    debug: () => commandHandlers.handleDebug(interaction, guild),
    kick: () => commandHandlers.handleKick(interaction, guild),
    "set-admin-role": () =>
      commandHandlers.handleSetAdminRole(interaction, guild),
    reminder: () => commandHandlers.handleReminder(interaction, guild),
    optout: () => commandHandlers.handleOptout(interaction, guild),
    feedback: () => commandHandlers.handleFeedback(interaction, guild),
  };
  const handler = handlers[commandName];
  if (handler) {
    await handler();
  } else {
    await interaction.reply({
      content: `Unknown command: ${commandName}`,
      ephemeral: true,
    });
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    const user = await findUser(member.id, member.guild.id);
    if (user && user.status === "active") {
      await removeUser(member.id, member.guild.id);
    }
  } catch (err) {
    console.error(`Error handling member leave: ${err}`);
  }
});

const cronJobs = new Map();

async function setupServerJobs(serverId) {
  // Cancel existing jobs if any
  if (cronJobs.has(serverId)) {
    console.log(`⚠️  Stopping ${cronJobs.get(serverId).length} existing jobs for server ${serverId}`);
    cronJobs.get(serverId).forEach((job) => job.stop());
    cronJobs.delete(serverId);
  }

  console.log(`✅ Setting up cron jobs for server ${serverId}`);
  const jobs = [
    // Weekly pairing
    schedule(
      "0 0 * * 1",
      async () => {
        await generatePairing(serverId);
      },
      { timezone: "UTC" },
    ),

    // Weekly reminder
    schedule(
      "0 0 * * 6",
      async () => {
        await sendReminder(serverId);
      },
      { timezone: "UTC" },
    ),

    // Weekly opt-out message
    schedule(
      "0 0 * * 6",
      async () => {
        await sendOptoutMessage(serverId);
      },
      { timezone: "UTC" },
    ),

    // Weekly feedback collection
    // schedule(
    //   "0 12 * * 1",
    //   async () => {
    //     await requestFeedback(serverId);
    //   },
    //   { timezone: "UTC" },
    // ),
  ];

  cronJobs.set(serverId, jobs);
}

// Handle shutdown signals
process.on("SIGINT", shutdownBot);
process.on("SIGTERM", shutdownBot);
