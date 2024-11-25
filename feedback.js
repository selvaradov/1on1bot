import {
  setStatus,
  updatePreviousPairStatus,
  getLastNStatusesAbout,
  getFeedbackForWeek,
} from "./database.js";
import client from "./bot.js";

export async function sendFeedbackDM(userId, partnerId, serverId, week) {
  try {
    const user = await client.users.fetch(userId);
    const partner = await client.users.fetch(partnerId);
    const message = await user.send({
      content: `Did your 1:1 meeting with ${partner.username} happen last week ${week}?`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2, // Button
              style: 3, // Success
              label: "Yes, it happened",
              custom_id: "happened",
            },
            {
              type: 2,
              style: 2, // Secondary
              label: "It's scheduled for later",
              custom_id: "scheduled",
            },
            {
              type: 2,
              style: 4, // Danger
              label: "No, we missed it",
              custom_id: "missed",
            },
          ],
        },
      ],
    });

    const collector = message.createMessageComponentCollector({
      time: 604800000, // 1 week
    });

    collector.on("collect", async (interaction) => {
      const status = interaction.customId;
      await handleFeedbackResponse(userId, partnerId, serverId, status, week);
      await interaction.update({
        content: "Thank you for your feedback!",
        components: [],
      });
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        // No feedback received within the time limit, record with null status
        await handleFeedbackResponse(userId, partnerId, serverId, null, week);
      }
    });
  } catch (error) {
    console.error(`Error sending feedback DM to ${userId}:`, error);
  }
}

async function handleFeedbackResponse(
  userId,
  partnerId,
  serverId,
  status,
  week,
) {
  const existingFeedback = await getFeedbackForWeek(userId, partnerId, serverId, week);
  
  if (existingFeedback) {
    if (existingFeedback.meetingStatus && existingFeedback.meetingStatus !== status) {
      console.error(`Feedback mismatch for week ${week}: ${existingFeedback.meetingStatus} (${partnerId}) vs ${status} (${userId})`);
    }
    // Update the existing record
    await updatePreviousPairStatus(userId, partnerId, serverId, week, status);
  }

  if (status === "missed") {
    const consecutiveMisses = await getConsecutiveMisses(partnerId, serverId);
    if (consecutiveMisses >= 3) {
      await setStatus(partnerId, serverId, "left");
      const user = await client.users.fetch(partnerId);
      await user.send(
        "You've been automatically opted out of the 1:1 program due to missing 3 consecutive meetings. You can opt back in using the `/join` command.",
      );
    }
  }
}

async function getConsecutiveMisses(userId, serverId) {
  const result = await getLastNStatusesAbout(userId, serverId, 3);

  let consecutiveMisses = 0;
  for (const row of result) {
    if (row.meetingStatus === "missed") {
      consecutiveMisses++;
    } else {
      break;
    }
  }
  return consecutiveMisses;
}
