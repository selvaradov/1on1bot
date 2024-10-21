import fs from "fs/promises";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { initialiseDatabase } from "./database.js";

try {
  await initialiseDatabase();
} catch (error) {
  console.error("Error initializing database:", error);
  process.exit(1);
}

async function migrateData(
  oldServerPath,
  serverId,
  channel,
  dbPath = "data.db",
) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Read and parse week (data.txt)
  const week = parseInt(
    (await fs.readFile(path.join(oldServerPath, "data.txt"), "utf8")).trim(),
  );

  // Read and parse unpaired (unpaired.txt)
  const unpairedData = (
    await fs.readFile(path.join(oldServerPath, "unpaired.txt"), "utf8")
  ).trim();
  const unpaired = unpairedData ? unpairedData.split("\n") : [];

  // Read and parse people (people.txt)
  const peopleData = await fs.readFile(
    path.join(oldServerPath, "people.txt"),
    "utf8",
  );
  const people = peopleData
    .trim()
    .split("\n")
    .map((line) => {
      const [userId, frequency, is_opted] = line
        .trim()
        .split(",")
        .map((str) => str.trim());
      return [userId, parseInt(frequency), parseInt(is_opted)];
    })
    .filter(([userId]) => userId !== "");

  // Read and parse current pairs (current.txt)
  const currentData = (
    await fs.readFile(path.join(oldServerPath, "current.txt"), "utf8")
  ).trim();
  const current_pairs = currentData
    ? currentData.split("\n").map((pair) => pair.split(","))
    : [];

  // Read and parse preferred pairs (prefer.txt)
  const preferData = (
    await fs.readFile(path.join(oldServerPath, "prefer.txt"), "utf8")
  ).trim();
  const preferred_pairs = preferData
    ? preferData.split("\n").map((pair) => pair.split(","))
    : [];

  // Read and parse previous pairs (previous.txt)
  const previousData = (
    await fs.readFile(path.join(oldServerPath, "previous.txt"), "utf8")
  )
    .trim()
    .split("\n");
  const previous_pairs = {};
  if (previousData.length > 0 && previousData[0] !== "") {
    previousData.forEach((row) => {
      const rowData = row.split(",");
      const key = rowData.shift();
      previous_pairs[key] = rowData;
    });
  }

  // Insert server data
  await db.run(
    "INSERT OR REPLACE INTO servers (serverId, channel, week) VALUES (?, ?, ?)",
    [serverId, channel, week],
  );

  // Insert people data
  for (const [userId, frequency, is_opted] of people) {
    await db.run(
      "INSERT OR REPLACE INTO people (userId, serverId, frequency, optedIn) VALUES (?, ?, ?, ?)",
      [userId, serverId, frequency, is_opted],
    );
  }

  // Insert current pairs
  for (const [user1Id, user2Id] of current_pairs) {
    await db.run(
      "INSERT OR REPLACE INTO current_pairs (user1Id, user2Id, serverId) VALUES (?, ?, ?)",
      [user1Id, user2Id, serverId],
    );
  }

  // Insert preferred pairs
  for (const [user1Id, user2Id] of preferred_pairs) {
    await db.run(
      "INSERT OR REPLACE INTO preferred_pairs (user1Id, user2Id, serverId) VALUES (?, ?, ?)",
      [user1Id, user2Id, serverId],
    );
  }

  // Insert previous pairs
  for (const [user1Id, pairings] of Object.entries(previous_pairs)) {
    for (const user2Id of pairings) {
      if (!user2Id) {
        continue;
      }

      // Check if the pair already exists
      const existingPair = await db.get(
        `SELECT 1 FROM previous_pairs 
               WHERE user1Id = ? AND user2Id = ? AND serverId = ?`,
        [user1Id, user2Id, serverId],
      );
      if (!existingPair) {
        await db.run(
          "INSERT OR REPLACE INTO previous_pairs (user1Id, user2Id, serverId, date) VALUES (?, ?, ?, ?)",
          [user1Id, user2Id, serverId, null],
        );
      }
    }
  }

  // Insert unpaired users
  for (const userId of unpaired) {
    await db.run(
      "INSERT OR REPLACE INTO unpaired (userId, serverId) VALUES (?, ?)",
      [userId, serverId],
    );
  }

  console.log(`Migration completed for server ${serverId}`);
  await db.close();
}

const servers = [
  {
    path: "/root/atlas",
    id: "982436897571881061",
    channel: "1221866923701174393",
  },
];

async function migrateAllServers() {
  for (const server of servers) {
    await migrateData(server.path, server.id, server.channel);
  }
}

migrateAllServers().catch(console.error);
