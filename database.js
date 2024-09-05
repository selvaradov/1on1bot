import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;

async function initializeDatabase() {
  db = await open({
    filename: "data.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS servers (
      serverId TEXT PRIMARY KEY,
      week INTEGER DEFAULT 0,
      start TEXT DEFAULT CURRENT_TIMESTAMP,
      channel TEXT,
      adminRole TEXT
    );

    CREATE TABLE IF NOT EXISTS people (
      userId TEXT,
      serverId TEXT,
      frequency INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      optedIn INTEGER DEFAULT 1,
      PRIMARY KEY (userId, serverId),
      FOREIGN KEY (serverId) REFERENCES servers(serverId)
    );

    CREATE TABLE IF NOT EXISTS current_pairs (
      user1Id TEXT,
      user2Id TEXT,
      serverId TEXT,
      PRIMARY KEY (user1Id, user2Id, serverId),
      FOREIGN KEY (serverId) REFERENCES servers(serverId),
      FOREIGN KEY (user1Id, serverId) REFERENCES people(userId, serverId),
      FOREIGN KEY (user2Id, serverId) REFERENCES people(userId, serverId)
    );

    CREATE TABLE IF NOT EXISTS preferred_pairs (
      user1Id TEXT,
      user2Id TEXT,
      serverId TEXT,
      PRIMARY KEY (user1Id, user2Id, serverId),
      FOREIGN KEY (serverId) REFERENCES servers(serverId),
      FOREIGN KEY (user1Id, serverId) REFERENCES people(userId, serverId),
      FOREIGN KEY (user2Id, serverId) REFERENCES people(userId, serverId)
    );

    CREATE TABLE IF NOT EXISTS previous_pairs (
      user1Id TEXT,
      user2Id TEXT,
      serverId TEXT,
      date TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user1Id, user2Id, serverId, date),
      FOREIGN KEY (serverId) REFERENCES servers(serverId),
      FOREIGN KEY (user1Id, serverId) REFERENCES people(userId, serverId),
      FOREIGN KEY (user2Id, serverId) REFERENCES people(userId, serverId)
    );

    CREATE TABLE IF NOT EXISTS unpaired (
      userId TEXT,
      serverId TEXT,
      PRIMARY KEY (userId, serverId),
      FOREIGN KEY (serverId) REFERENCES servers(serverId),
      FOREIGN KEY (userId, serverId) REFERENCES people(userId, serverId)
    );
  `);

  console.log("Database initialized");
}

async function getWeek(serverId) {
  const result = await db.get(
    "SELECT week FROM servers WHERE serverId = ?",
    serverId,
  );
  return result ? result.week : 0;
}

async function setWeek(serverId, week) {
  await db.run(
    "UPDATE servers SET week = ? WHERE serverId = ?",
    week,
    serverId,
  );
}

async function getPeople(serverId) {
  return await db.all(
    "SELECT userId, frequency, optedIn, status FROM people WHERE serverId = ?",
    serverId,
  );
}

async function findUser(userId, serverId) {
  const result = await db.get(
    "SELECT status FROM people WHERE userId = ? AND serverId = ?",
    userId,
    serverId,
  );
  return result;
}

async function addPerson(userId, serverId, frequency = 1, isOptedIn = 1) {
  await db.run(
    "INSERT OR REPLACE INTO people (userId, serverId, frequency, optedIn) VALUES (?, ?, ?, ?)",
    userId,
    serverId,
    frequency,
    isOptedIn,
  );
}

async function removePerson(userId, serverId) {
  await db.run(
    "DELETE FROM people WHERE userId = ? AND serverId = ?",
    userId,
    serverId,
  );
}

async function setStatus(userId, serverId, status) {
  await db.run(
    "UPDATE people SET status = ? WHERE userId = ? AND serverId = ?",
    status,
    userId,
    serverId,
  );
}

async function getStatus(userId, serverId) {
  const result = await db.get(
    "SELECT status FROM people WHERE userId = ? AND serverId = ?",
    userId,
    serverId,
  );
  return result;
}

async function getActivePeople(serverId) {
  return await db.all(
    'SELECT userId, frequency FROM people WHERE serverId = ? AND status = "active" AND optedIn = 1',
    serverId,
  );
}

async function updatePersonFrequency(userId, serverId, frequency) {
  await db.run(
    "UPDATE people SET frequency = ? WHERE userId = ? AND serverId = ?",
    frequency,
    userId,
    serverId,
  );
}

async function updatePersonOptIn(userId, serverId, isOptedIn) {
  await db.run(
    "UPDATE people SET optedIn = ? WHERE userId = ? AND serverId = ?",
    isOptedIn,
    userId,
    serverId,
  );
}

async function optInAll(serverId) {
  await db.run("UPDATE people SET optedIn = 1 WHERE serverId = ?", serverId);
}

async function getCurrentPairs(serverId) {
  return await db.all(
    "SELECT user1Id, user2Id FROM current_pairs WHERE serverId = ?",
    serverId,
  );
}

async function getCurrentPairWithUser(userId, serverId) {
  return await db.all(
    "SELECT user1Id, user2Id FROM current_pairs WHERE (user1Id = ? OR user2Id = ?) AND serverId = ?",
    userId,
    userId,
    serverId,
  );
}

async function setCurrentPairs(pairs, serverId) {
  await db.run("DELETE FROM current_pairs WHERE serverId = ?", serverId);
  for (const [user1, user2] of pairs) {
    await db.run(
      "INSERT INTO current_pairs (user1Id, user2Id, serverId) VALUES (?, ?, ?)",
      user1,
      user2,
      serverId,
    );
  }
}

async function addCurrentPair(user1Id, user2Id, serverId) {
  await db.run(
    "INSERT INTO current_pairs (user1Id, user2Id, serverId) VALUES (?, ?, ?)",
    user1Id,
    user2Id,
    serverId,
  );
}

async function removeCurrentPairsForUser(userId, serverId) {
  await db.run(
    "DELETE FROM current_pairs WHERE (user1Id = ? OR user2Id = ?) AND serverId = ?",
    userId,
    userId,
    serverId,
  );
}

async function getPreferredPairs(serverId) {
  return await db.all(
    "SELECT user1Id, user2Id FROM preferred_pairs WHERE serverId = ?",
    serverId,
  );
}

async function getPreferredPairsForUser(userId, serverId) {
  return await db.all(
    "SELECT user2Id FROM preferred_pairs WHERE user1Id = ? AND serverId = ?",
    userId,
    serverId,
  );
}

async function isPreferredPair(user1Id, user2Id, serverId) {
  return await db.get(
    "SELECT 1 FROM preferred_pairs WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?) AND serverId = ?",
    user1Id,
    user2Id,
    user2Id,
    user1Id,
    serverId,
  );
}

async function addPreferredPair(user1Id, user2Id, serverId) {
  await db.run(
    "INSERT OR REPLACE INTO preferred_pairs (user1Id, user2Id, serverId) VALUES (?, ?, ?)",
    user1Id,
    user2Id,
    serverId,
  );
}

async function removePreferredPair(user1Id, user2Id, serverId) {
  await db.run(
    "DELETE FROM preferred_pairs WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?) AND serverId = ?",
    user1Id,
    user2Id,
    user2Id,
    user1Id,
    serverId,
  );
}

async function removePreferredPairsForUser(userId, serverId) {
  await db.run(
    "DELETE FROM preferred_pairs WHERE (user1Id = ? OR user2Id = ?) AND serverId = ?",
    userId,
    userId,
    serverId,
  );
}

async function getPreviousPairs(serverId) {
  return await db.all(
    "SELECT user1Id, user2Id FROM previous_pairs WHERE serverId = ?",
    serverId,
  );
}

async function getPreviousPairsForUser(userId, serverId) {
  return await db.all(
    "SELECT user2Id FROM previous_pairs WHERE user1Id = ? AND serverId = ?",
    userId,
    serverId,
  );
}

async function addPreviousPair(user1Id, user2Id, serverId, date) {
  await db.run(
    "INSERT INTO previous_pairs (user1Id, user2Id, serverId, date) VALUES (?, ?, ?, ?)",
    user1Id,
    user2Id,
    serverId,
    date,
  );
  // Original code kept only the last 10 pairs for each user, but not replicating that here.
}

async function removePreviousPair(user1Id, user2Id, serverId) {
  await db.run(
    "DELETE FROM previous_pairs WHERE (user1Id = ? AND user2Id = ?) OR (user1Id = ? AND user2Id = ?) AND serverId = ?",
    user1Id,
    user2Id,
    user2Id,
    user1Id,
    serverId,
  );
}

async function getUnpaired(serverId) {
  return await db.all(
    "SELECT userId FROM unpaired WHERE serverId = ?",
    serverId,
  );
}

async function setUnpaired(userIds, serverId) {
  await db.run("DELETE FROM unpaired WHERE serverId = ?", serverId);
  for (const userId of userIds) {
    await db.run(
      "INSERT INTO unpaired (userId, serverId) VALUES (?, ?)",
      userId,
      serverId,
    );
  }
}

async function addUnpaired(userId, serverId) {
  await db.run(
    "INSERT INTO unpaired (userId, serverId) VALUES (?, ?)",
    userId,
    serverId,
  );
}

async function removeUnpaired(userId, serverId) {
  await db.run(
    "DELETE FROM unpaired WHERE userId = ? AND serverId = ?",
    userId,
    serverId,
  );
}

async function addServer(serverId, channelId) {
  await db.run(
    "INSERT INTO servers (serverId, channel) VALUES (?, ?)",
    serverId,
    channelId,
  );
}

async function getChannel(serverId) {
  const result = await db.get(
    "SELECT channel FROM servers WHERE serverId = ?",
    serverId,
  );
  return result ? result.channel : null;
}

async function setAdminRole(serverId, roleId) {
  await db.run(
    "UPDATE servers SET adminRole = ? WHERE serverId = ?",
    roleId,
    serverId,
  );
}

async function getAdminRole(serverId) {
  const result = await db.get(
    "SELECT adminRole FROM servers WHERE serverId = ?",
    serverId,
  );
  return result ? result.adminRole : null;
}

export {
  initializeDatabase,
  getWeek,
  setWeek,
  getPeople,
  findUser,
  addPerson,
  removePerson,
  updatePersonFrequency,
  updatePersonOptIn,
  optInAll,
  getCurrentPairs,
  getCurrentPairWithUser,
  setCurrentPairs,
  getPreferredPairsForUser,
  isPreferredPair,
  addCurrentPair,
  removeCurrentPairsForUser,
  getPreferredPairs,
  addPreferredPair,
  removePreferredPair,
  removePreferredPairsForUser,
  getPreviousPairs,
  getPreviousPairsForUser,
  addPreviousPair,
  removePreviousPair,
  getUnpaired,
  setUnpaired,
  addUnpaired,
  removeUnpaired,
  addServer,
  getChannel,
  setAdminRole,
  getAdminRole,
  setStatus,
  getStatus,
  getActivePeople,
};
