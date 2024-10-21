# 1on1 Bot
A discord bot that pairs up users within a server for weekly 1-1 calls. 
Used by Atlas Fellows and SPARC2024 attendees. 
## Installation
Click [this link](https://discord.com/oauth2/authorize?client_id=1279836130409447486) to add the bot to a server you are an administrator on. It will ask for the following permissions:
- Manage roles
  - To create a new 1-1 role, and add/remove it from users as they join/leave
- Manage channels
  - To create a channel for 1-1s to happen in
- Send messages
  - To notify users about the weekly pairings
- Send reactions
  - To add an ❌ emoji to the opt-out message

*If you already have a role on the server called "1-1", please ensure you either remove that role or move the "1-1 Bot" role above it before anybody tries to join the 1-1 programme, or there will be permission issues.*

## Functions
1. **/join:** add the user to the 1-1 programme.
2. **/leave:** remove the user from the 1-1 programme, while retaining a copy of their 10 most recent partners.
3. **/change-frequency:** change the user's meeting frequency to once every n weeks; default is once every week.
4. **/add-preferred-partner:** suggest a person the user would like to meet.
5. **/add-previous-partner:** manually add a person to the user's list of previous partners; normally done automatically after every meeting.
6. **/check-current-partner:** return the user's current partner.
7. **/check-previous-partners:** return the user's previous partners.
8. **/pair:** admin function; manually run the pairing function; normally done automatically every Monday.
9. **/debug:** admin function; return the values of the programme's arrays.
10. **/kick:** admin function; remove another user from the 1-1 programme.  
11. **/optout:** test sending a message 48 hours in advance, which allows users to opt-out for a week by reacting to it.
12. **/feedback:** test requesting feedback from all paired users about whether their meetings went ahead as scheduled.
13. **/set-admin-role:** choose an existing role to be the 1-1 admin role, in the case that you want people who aren't server admins to be able to manage the bot. 
## FAQ
#### Q: Do you have any planned updates?
A: Small group meeting, handling pairing across multiple servers to avoid duplicates, and refactoring code.
## Areas to develop
### Handling of frequencies
The code is configured so that when somebody joins they immediately get a partner if possible. But say they only want fortnightly meetings, if they're matched up in the first week and the next week is even, perhaps they'll be paired two weeks in a row -- so we might need an offset property? (this may be overly complex though). Equally, maybe somebody doesn't get paired up immediately, the next week is odd, then they will go for two whole weeks without a pair. So we want to deal with this too (and in the general case of frequency n).

One problem with this is that two people who set fortnightly frequency and join in consecutive weeks will never be paired up with each other. Giving everybody an offset of zero avoids this.

### Handling of feedback
- Once a week, 12 hours after the new pairings are sent out, we DM everybody to ask whether their meeting last week happened.
  - They can say it happened, didn't, or is scheduled to occur.
- If users conflict on their response, we just keep the first one and log an error message (I expect this not to happen often; if it does then I'll implement something more robust)
- If for three consecutive weeks, person A is reported to have missed a meeting, they will be automatically removed from the programme
  - This isn't a "punishment"; they can rejoin right away. It's just a behavioural nudge.
  - The program is implemented to get feedback _about_ the user, so if person B misses three meetings in a row because their partners were disorganised, then they shouldn't be removed all (although even if they are, it's no big deal ideally)
  - The way I achieve this is a pretty simple heuristic - probably an engaged participant will report feedback and the disengaged one won't, so the "missed" feedback will show up against the non-engaged participant, letting us identify them
    - There's probably a more sophisticated approach here, e.g. tracking feedback in both directions etc etc.
    - Or just accepting that in the rare case where an engaged user was for three consecutive weeks paired with disengaged users, they'll be removed and will have to rejoin
- One somewhat by design feature is that if you re-join and miss your first meeting, that will count as going over the three consecutive misses immediately, and you'll get removed straight away.
  - I think this is OK to have, but with a bit of effort it can be changed.
- Also, if a user leaves during the middle of a week, their ex-partner won't be asked to give feedback, since they're no longer in the programme. Again, I think this makes sense.
- I'm open to modifying the definition of "disengaged", e.g. maybe it should be cumulative not consecutive, maybe three is too low/high, etc.
