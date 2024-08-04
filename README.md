# 1on1 Bot
A discord bot that pairs up users within a server for weekly 1-1 calls. 
Used by Atlas Fellows and SPARC2024 attendees. 
## Installation
1. Create an application on [Discord Developer Portal](https://discord.com/developers/applications). Invite it to your server with the permission to use applications.commands, manage roles, send messages and ping members.
2. Select or create a channel in your server for the bot to send messages to. 
3. Download app.js. Change serverid, channelid, adminid, and prefix to suitable values.
4. Host the bot on a server. Set the environmental value TOKEN to your bot's token. I'm currently using a DigitalOcean droplet with monitoring done by pm2. 
## FAQ
#### Q: Why are you using txt files to store your data?
A: This is an intentional ✨feature✨ so you don't have to waste time and money setting up a database.
#### Q: Do you have any planned updates?
A: Small group meeting, feedback mechanism, and maybe eventually, a proper database.
