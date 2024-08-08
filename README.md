# 1on1 Bot
A discord bot that pairs up users within a server for weekly 1-1 calls. 
Used by Atlas Fellows and SPARC2024 attendees. 
## Installation
1. Create an application on [Discord Developer Portal](https://discord.com/developers/applications). Invite it to your server with the permission to use applications.commands, manage roles, send messages and ping members.
2. Select or create a channel in your server for the bot to send messages to. Create a role named 1-1 and make sure it is below the bot's role. 
3. Download app.js. Change serverid, channelid, and adminid to suitable values. Set the environmental value TOKEN to your bot's token. 
4. If you are running multiple instances of the bot, create a separate folder for each instance. 
## Functions
1. **/join:** add the user to the 1-1 program.
2. **/leave:** remove the user from the 1-1 program, while retaining a copy of their 10 most recent partners.
3. **/change-frequency:** change the user's meeting frequency to once every n weeks; default is once every week.
4. **/add-preferred-partner:** suggest a person the user would like to meet.
5. **/add-previous-partner:** manually add a person to the user's list of 10 most recent partners; normally done automatically after every meeting.
6. **/check-current-partner:** return the user's current partner.
7. **/check-previous-partners:** return the user's 10 most recent partners.
8. **/pair:** admin function; manually run the pairing function; normally done automatically every Monday.
9. **/debug:** admin function; return the values of the program's arrays.
10. **/kick:** admin function; remove another user from the 1-1 program.  
11. **optout:** send a message 48 hours in advance, which allows users to opt-out for a week by reacting to it. 
## FAQ
#### Q: Why are you using txt files to store your data?
A: This is an ✨intentional feature✨ so you don't have to waste time and money setting up a database.
#### Q: Do you have any planned updates?
A: Small group meeting, feedback mechanism, and maybe eventually, a proper database.
