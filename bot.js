import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config(); // TODO check this is right

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

try {
  client.login(process.env.TOKEN);
  console.log("Bot logged in successfully.");
} catch (error) {
  console.error("Error logging in:", error);
  process.exit(1);
}

export async function shutdownBot() {
  try {
    await client.destroy();
    console.log("Bot connection closed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error shutting down bot:", error);
    process.exit(1);
  }
}

export default client;
