import { writeFileSync, unlinkSync } from "fs";
import {
  getUnpaired,
  getPreviousPairs,
  getPeople,
  getWeek,
  getCurrentPairs,
  getPreferredPairs,
} from "./database.js";

export async function debug(interaction, serverId) {
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
