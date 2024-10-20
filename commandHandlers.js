import { removeUser, findPartnerForUser, isActive } from "./userUtils.js";
import {
  is1to1Admin,
  getOrCreateRole,
  getRole,
  isAdmin,
} from "./adminUtils.js";
import {
  addPerson,
  findUser,
  setStatus,
  updatePersonFrequency,
  setAdminRole,
  isPreferredPair,
  addPreferredPair,
  addPreviousPair,
  getCurrentPairWithUser,
  getPreviousPairs,
} from "./database.js";
import { generatePairing } from "./pairing.js";
import {
  requestFeedback,
  sendOptoutMessage,
  sendReminder,
} from "./messages.js";
import { debug } from "./tests.js";

export async function handleJoin(interaction, guild) {
  const role = await getOrCreateRole(guild);
  const user = await findUser(interaction.user.id, guild.id);
  if (user && user.status === "left") {
    await setStatus(interaction.user.id, guild.id, "active");
    await interaction.member.roles.add(role);
    await updatePersonFrequency(interaction.user.id, guild.id, 1);
    await interaction.reply(
      `<@${interaction.user.id}> welcome back to the 1-1 programme! We've reset your frequency to weekly, so make sure to use \`/change-frequency\` to alter it if desired.`,
    );
    await findPartnerForUser(interaction.user.id, guild.id);
  } else if (user) {
    await interaction.reply({
      content: `You have already joined the programme!`,
      ephemeral: true,
    });
  } else {
    await addPerson(interaction.user.id, guild.id, 1, 1);
    await interaction.member.roles.add(role);
    await interaction.reply(
      `<@${interaction.user.id}> welcome to the 1-1 programme! Your meeting frequency is set to weekly by default. Use \`/change-frequency\` to alter it.`,
    );
    await findPartnerForUser(interaction.user.id, guild.id);
  }
}

export async function handleLeave(interaction, guild) {
  if (!(await isActive(interaction.user.id, guild.id))) {
    await interaction.reply({
      content: `You are not currently in the 1-1 programme.`,
      ephemeral: true,
    });
    return;
  }
  const role = await getRole(guild, "1-1");
  await interaction.reply({
    content:
      "Are you sure you want to leave the 1-1 programme? Your streak will be reset, and your partner will be reassigned another partner.",
    ephemeral: true,
    components: [
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 4, // Danger
            label: "Yes",
            customId: "confirm",
          },
          {
            type: 2, // Button
            style: 2, // Secondary
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
      await removeUser(interaction.user.id, guild.id);
      await i.update({
        content: `I removed you from the 1-1 programme. I'll retain a list of your recent meetings in case you change your mind :)`,
        components: [],
      });
    } else if (i.customId === "cancel") {
      await i.update({ content: `Leaving cancelled`, components: [] });
    }
    collector.stop();
  });
}

export async function handleKick(interaction, guild) {
  try {
    if (!(await is1to1Admin(interaction.member, guild.id))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    let input = interaction.options.getString("tag");

    // Extract user ID from different possible formats
    let userId;
    if (input.startsWith("<@") && input.endsWith(">")) {
      // It's a mention
      userId = input.substring(2, input.length - 1);
      // Remove the ! if it's a nickname mention
      userId = userId.replace("!", "");
    } else {
      // Assume it's a raw ID
      userId = input.trim();
    }

    // Validate that it looks like a Discord ID
    if (!/^\d{17,19}$/.test(userId)) {
      await interaction.reply({
        content:
          "Invalid user ID format. Please provide either a user mention or a valid Discord user ID (17-19 digits).",
        ephemeral: true,
      });
      return;
    }

    // First check if user exists in our database
    const user = await findUser(userId, guild.id);
    if (user.status === "left") {
      await interaction.reply({
        content: "This user is not in the 1-1 programme.",
        ephemeral: true,
      });
      return;
    }

    // Try to get member, but don't fail if we can't
    const member = await guild.members.fetch(userId);

    await interaction.reply({
      content: `Are you sure you want to remove ${member ? `<@${userId}>` : `user ID ${userId}`} from the 1-1 programme?`,
      ephemeral: true,
      components: [
        {
          type: 1, // ActionRow
          components: [
            {
              type: 2, // Button
              style: 4, // Danger
              label: "Yes",
              customId: "confirm",
            },
            {
              type: 2, // Button
              style: 2, // Secondary
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
        // Only try to remove role if member is still in server
        if (member) {
          const role = await getRole(guild, "1-1");
          await member.roles.remove(role);
        }

        await removeUser(userId, guild.id);
        await i.update({
          content: `I removed ${member ? `<@${userId}>` : `user ID ${userId}`} from the 1-1 programme. I'll retain a list of their recent meetings.`,
          components: [],
        });
      } else if (i.customId === "cancel") {
        await i.update({ content: `Removal cancelled`, components: [] });
      }
      collector.stop();
    });
  } catch (err) {
    console.error(err);
  }
}

export async function handlePair(interaction, guild) {
  if (!(await is1to1Admin(interaction.member, guild.id))) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }
  await generatePairing(guild.id);
  await interaction.reply({
    content: `I've paired everyone up!`,
    ephemeral: true,
  });
}

export async function handleReminder(interaction, guild) {
  if (!(await is1to1Admin(interaction.member, guild.id))) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }
  await sendReminder(guild.id);
  await interaction.reply({
    content: `I've sent everyone a reminder!`,
    ephemeral: true,
  });
}

export async function handleOptout(interaction, guild) {
  if (!(await is1to1Admin(interaction.member, guild.id))) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }
  await sendOptoutMessage(guild.id);
  await interaction.reply({
    content: `I sent the message. Try it out!`,
    ephemeral: true,
  });
}

export async function handleFeedback(interaction, guild) {
  await requestFeedback(guild.id);
  await interaction.reply({
    content: "Feedback test messages sent to all paired users.",
    ephemeral: true,
  });
}

export async function handleDebug(interaction, guild) {
  if (!(await is1to1Admin(interaction.member, guild.id))) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }
  await debug(interaction, guild.id);
}

export async function handleChangeFrequency(interaction, guild) {
  let period = interaction.options.getInteger("period");
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

export async function handleSetAdminRole(interaction, guild) {
  if (!(await isAdmin(interaction.member))) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      ephemeral: true,
    });
    return;
  }
  let role = interaction.options.getRole("role");
  await setAdminRole(guild.id, role.id);
  await interaction.reply({
    content: `Admin role set to ${role.name}`,
    ephemeral: true,
  });
}

export async function handleAddPreferredPartner(interaction, guild) {
  if (!(await isActive(interaction.user.id, guild.id))) {
    await interaction.reply({
      content:
        "You need to be active in the 1-1 programme to use this command. Please use `/join` first.",
      ephemeral: true,
    });
    return;
  }
  let tag = interaction.options.getString("tag");
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
    guild.id,
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

export async function handleAddPreviousPartner(interaction, guild) {
  if (!(await isActive(interaction.user.id, guild.id))) {
    await interaction.reply({
      content:
        "You need to be active in the 1-1 programme to use this command. Please use `/join` first.",
      ephemeral: true,
    });
    return;
  }
  let tag = interaction.options.getString("tag");
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

export async function handleCheckCurrentPartner(interaction, guild) {
  if (!(await isActive(interaction.user.id, guild.id))) {
    await interaction.reply({
      content:
        "You need to be active in the 1-1 programme to use this command. Please use `/join` first.",
      ephemeral: true,
    });
    return;
  }
  const currentPair = await getCurrentPairWithUser(
    interaction.user.id,
    guild.id,
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

export async function handleCheckPreviousPartners(interaction, guild) {
  if (!(await isActive(interaction.user.id, guild.id))) {
    await interaction.reply({
      content:
        "You need to be active in the 1-1 programme to use this command. Please use `/join` first.",
      ephemeral: true,
    });
    return;
  }
  // Check if the user has any previous partners
  const previousPartners = await getPreviousPairs(
    interaction.user.id,
    guild.id,
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
