// reset.js
import { open } from "sqlite";
import sqlite3 from "sqlite3";

async function getDb() {
  return await open({
    filename: "data.db",
    driver: sqlite3.Database,
  });
}

async function getServerIds() {
  const db = await getDb();
  try {
    const servers = await db.all("SELECT serverId FROM servers");
    return servers.map(server => server.serverId);
  } finally {
    await db.close();
  }
}

async function resetHistory(serverId) {
  const db = await getDb();
  
  try {
    await db.run("BEGIN TRANSACTION");
    
    await db.run("DELETE FROM current_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM previous_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM preferred_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM unpaired WHERE serverId = ?", serverId);
    await db.run("UPDATE servers SET week = 0 WHERE serverId = ?", serverId);
    await db.run("UPDATE people SET optedIn = 1 WHERE serverId = ?", serverId);
    
    await db.run("COMMIT");
    console.log("Successfully reset history for server", serverId);
  } catch (error) {
    await db.run("ROLLBACK");
    console.error("Error resetting history for server", serverId, ":", error);
  } finally {
    await db.close();
  }
}

async function resetHistoryAndUsers(serverId) {
  const db = await getDb();
  
  try {
    await db.run("BEGIN TRANSACTION");
    
    await db.run("DELETE FROM current_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM previous_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM preferred_pairs WHERE serverId = ?", serverId);
    await db.run("DELETE FROM unpaired WHERE serverId = ?", serverId);
    await db.run("DELETE FROM people WHERE serverId = ?", serverId);
    await db.run("UPDATE servers SET week = 0 WHERE serverId = ?", serverId);
    
    await db.run("COMMIT");
    console.log("Successfully reset history and users for server", serverId);
  } catch (error) {
    await db.run("ROLLBACK");
    console.error("Error resetting history and users for server", serverId, ":", error);
  } finally {
    await db.close();
  }
}

async function resetAllHistory() {
  const serverIds = await getServerIds();
  console.log("Resetting history for all servers:", serverIds);
  for (const serverId of serverIds) {
    await resetHistory(serverId);
  }
  console.log("Finished resetting all servers");
}

async function resetAllHistoryAndUsers() {
  const serverIds = await getServerIds();
  console.log("Resetting history and users for all servers:", serverIds);
  for (const serverId of serverIds) {
    await resetHistoryAndUsers(serverId);
  }
  console.log("Finished resetting all servers");
}

async function listServers() {
  const serverIds = await getServerIds();
  console.log("\nAvailable servers:");
  serverIds.forEach(serverId => console.log(serverId));
}

// Handle command line arguments
const command = process.argv[2];
const serverId = process.argv[3];

if (!command) {
  console.log(`
Usage: 
  node reset.js list                     - List all server IDs
  node reset.js history <serverId|all>   - Reset history for server(s)
  node reset.js complete <serverId|all>  - Reset history and users for server(s)
  `);
} else if (command === 'list') {
  await listServers();
} else if (command === 'history') {
  if (!serverId) {
    console.log("Error: Server ID or 'all' is required");
  } else if (serverId === 'all') {
    await resetAllHistory();
  } else {
    await resetHistory(serverId);
  }
} else if (command === 'complete') {
  if (!serverId) {
    console.log("Error: Server ID or 'all' is required");
  } else if (serverId === 'all') {
    await resetAllHistoryAndUsers();
  } else {
    await resetHistoryAndUsers(serverId);
  }
} else {
  console.log("Unknown command. Use 'list', 'history', or 'complete'");
}