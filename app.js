const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const fs = require("fs");
/*data structure
people : array of [user id, meeting frequency, is opted in?]
week : int
current : array of [user id, user id]
prefer : array of [user id, user id]
previous : dictionary of [array of user id]
backed up using *sprinkles* txt *sprinkles*
*/

let unpaired = [];
let previous_pairs = {};
let current_pairs = [];
let preferred_pairs = [];
let people = [];
let week = 0;
let guild;

let serverid = "YOUR_SERVER_ID";
let channelid = "YOUR_CHANNEL_ID";
let adminid = "YOUR_USER_ID"; 

// Call init_db() if data.txt does not exist
if (!fs.existsSync("data.txt")) {
  init_db();
}
load_data();

client.on('error', (err) => {
  console.log(err.message)
});


client.on("ready", async () => {
  // command declarations
  guild = client.guilds.cache.get(serverid);
  await guild.commands.set([
    {
      name: "join",
      description: "Join the 1-1 program.",
    },
    {
      name: "leave",
      description: "Leave the 1-1 program.",
    },
    {
      name: "change-frequency",
      description: "Change your meeting frequency to once every [period] week.",
      options: [
        {
          name: "period",
          description: "The number of weeks between successive meetings.",
          type: 4,
          required: true,
        },
      ],
    },
    {
      name: "add-preferred-partner",
      description: "Suggest a person you would like to meet.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the preferred partner, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "add-previous-partner",
      description:
        "Manually enter into record a person you have recently met with.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the previous partner, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "check-current-partner",
      description: "Outputs your current partner.",
    },
    {
      name: "check-previous-partners",
      description: "Outputs a list of your previous partners.",
    },

    {
      name: "pair",
      description: "Manually run the pairing function.",
    },
    {
      name: "optout",
      description: "Test the message for opting out.",
    },
    // {
    //   name: 'feedback',
    //   description: 'Test the feedback function.',
    // },
    {
      name: "reminder",
      description: "Test the reminder function.",
    },
    {
      name: "debug",
      description: "Output all the arrays as a reply.",
    },
    {
      name: "kick",
      description: "Kick the specified user.",
      type: 1,
      options: [
        {
          name: "tag",
          description: "Discord tag of the user being kicked, starting with @.",
          type: 3,
          required: true,
        },
      ],
    },
  ]);
  client.user.setActivity("slash commands in the server", {
    type: "LISTENING",
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand() || interaction.guild != guild) return;

  const { commandName, options } = interaction;
  let role = interaction.guild.roles.cache.find((role) => role.name === "1-1");
  if (!role) {
    role = await guild.roles.create({
      name: "1-1",
      color: 0,
      mentionable: true,
      reason: "Creating role for 1-1 program",
    });
  }
  let joined = false;
  for (let i = 0; i < people.length; i++) {
    if (people[i][0] === interaction.user.id) {
      joined = true;
      break;
    }
  }
  if (joined) {
    if (commandName === "join") {
      await interaction.reply({
        content: `You have already joined the program!`,
        ephemeral: true,
      });
    }

    // leave 1-1
    if (commandName === "leave") {
      const confirmationMessage = await interaction.reply({
        content:
          "Are you sure you want to leave the 1-1 program? Your streak will be reset, and your partner will be reassigned another partner.",
        ephemeral: true,
        components: [
          {
            type: 1, // ACTION_ROW
            components: [
              {
                type: 2, // BUTTON
                style: 4, // DANGER
                label: "Yes",
                customId: "confirm",
              },
              {
                type: 2, // BUTTON
                style: 2, // SECONDARY
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
          // remove user from people
          for (let j = 0; j < people.length; j++) {
            if (people[j][0] === interaction.user.id) {
              people.splice(j, 1);
              save_people();
              break;
            }
          }
          // remove user from preferred_pairs
          for (let j = 0; j < preferred_pairs.length; j++) {
            if (
              preferred_pairs[j][0] === interaction.user.id ||
              preferred_pairs[j][1] === interaction.user.id
            ) {
              preferred_pairs.splice(j, 1);
              j--;
            }
          }
          save_preferred_pairs();
          // remove user from unpaired
          for (let j = 0; j < unpaired.length; j++) {
            if (unpaired[j] === interaction.user.id) {
              unpaired.splice(j, 1);
              save_unpaired();
              break;
            }
          }
          // remove user from current_pairs
          for (let j = 0; j < current_pairs.length; j++) {
            if (
              current_pairs[j][0] === interaction.user.id ||
              current_pairs[j][1] === interaction.user.id
            ) {
              let partner =
                current_pairs[j][0] === interaction.user.id
                  ? current_pairs[j][1]
                  : current_pairs[j][0];
              // remove user and partner from each other's previous list
              previous_pairs[interaction.user.id].pop();
              previous_pairs[partner].pop();
              current_pairs.splice(j, 1);
              // find a new partner for partner
              if (unpaired.length > 0) {
                const channel = client.channels.cache.get(channelid);
                await channel.send(`New pair: <@${partner}> <@${unpaired[0]}>`);
                add_pair(partner, unpaired[0]);
              } else {
                unpaired.push(partner);
              }
              save_unpaired();
              save_previous_pairs();
              save_current_pairs();
              break;
            }
          }
          await i
            .update({
              content: `I removed you from the 1-1 program. I'll retain a list of your recent meetings in case you change your mind :)`,
              components: [],
            })
            .catch(console.error);
        } else if (i.customId === "cancel") {
          await i
            .update({ content: `Leaving cancelled`, components: [] })
            .catch(console.error);
        }
      });
    }

    // change meeting frequency
    if (commandName === "change-frequency") {
      let period = options.getInteger("period");
      if (period < 1) {
        await interaction.reply({
          content: `You must input a positive integer!`,
          ephemeral: true,
        });
      } else {
        for (let i = 0; i < people.length; i++) {
          if (people[i][0] === interaction.user.id) {
            people[i][1] = period;
            break;
          }
        }
        save_people();
        await interaction.reply({
          content: "Your frequency has been updated successfully.",
          ephemeral: true,
        });
      }
    }

    // add preferred partner
    if (commandName === "add-preferred-partner") {
      let tag = options.getString("tag");
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
      let partnerFound = false;
      for (let i = 0; i < people.length; i++) {
        if (people[i][0] === partner) {
          partnerFound = true;
        }
      }
      if (!partnerFound) {
        await interaction.reply({
          content: "Partner not found.",
          ephemeral: true,
        });
        return;
      }
      for (let i = 0; i < preferred_pairs.length; i++) {
        if (
          (preferred_pairs[i][0] === interaction.user.id &&
            preferred_pairs[i][1] === partner) ||
          (preferred_pairs[i][1] === interaction.user.id &&
            preferred_pairs[i][0] === partner)
        ) {
          await interaction.reply({
            content:
              "This user is already in your list of preferred partners / you are already in their list of preferred partners.",
            ephemeral: true,
          });
          return;
        }
      }
      preferred_pairs.push([interaction.user.id, partner]);
      save_preferred_pairs();
      await interaction.reply({
        content: "Preferred partner added successfully.",
        ephemeral: true,
      });
    }

    // add previous partner
    if (commandName === "add-previous-partner") {
      let tag = options.getString("tag");
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
      let partnerFound = false;
      for (let i = 0; i < people.length; i++) {
        if (people[i][0] === partner) {
          partnerFound = true;
        }
      }
      if (!partnerFound) {
        await interaction.reply({
          content: "Partner not found.",
          ephemeral: true,
        });
        return;
      }
      previous_pairs[interaction.user.id].push(partner);
      if (previous_pairs[interaction.user.id].length > 10) {
        // If the length exceeds 10, remove the first element
        previous_pairs[interaction.user.id].shift();
      }
      previous_pairs[partner].push(interaction.user.id);
      if (previous_pairs[partner].length > 10) {
        // If the length exceeds 10, remove the first element
        previous_pairs[partner].shift();
      }
      await interaction.reply({
        content: "Previous partner added successfully.",
        ephemeral: true,
      });
    }

    // check current partner
    if (commandName === "check-current-partner") {
      let partner = null;
      for (let i = 0; i < current_pairs.length; i++) {
        if (current_pairs[i][0] === interaction.user.id) {
          partner = current_pairs[i][1];
          break;
        }
        if (current_pairs[i][1] === interaction.user.id) {
          partner = current_pairs[i][0];
          break;
        }
      }
      if (partner === null) {
        await interaction.reply({
          content: "You are not currently paired.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `Your current partner is <@${partner}>.`,
          ephemeral: true,
        });
      }
    }

    //check previous partners
    if (commandName === "check-previous-partners") {
      // Check if the user has any previous partners
      if (
        !previous_pairs[interaction.user.id] ||
        previous_pairs[interaction.user.id].length === 0
      ) {
        await interaction.reply({
          content: "You have no previous partners.",
          ephemeral: true,
        });
        return;
      }

      // Output the list of previous partners
      const partners = previous_pairs[interaction.user.id].map(
        (partnerId) => `<@${partnerId}>`
      );
      const message = `Your previous partners are: ${partners.join(", ")}`;

      await interaction.reply({ content: message, ephemeral: true });
    }

    // admin only commands
    if (
      commandName === "pair" ||
      commandName === "debug" ||
      commandName === "kick" || 
      commandName === "optout" ||
      commandName === "reminder"
    ) {
      if (interaction.user.id === adminid) {
        if (commandName === 'optout') {
          await optoutmessage();
          await interaction.reply({content: `I sent the message. Try it out!`, ephemeral: true}); 
        }
        if (commandName === "reminder") {
          await reminder();
          await interaction.reply({
            content: `I've sent everyone a reminder!`,
            ephemeral: true,
          });
        }    
        if (commandName === "pair") {
          await pairing();
          await interaction.reply({
            content: `I've paired everyone up!`,
            ephemeral: true,
          });
        }

        if (commandName === "debug") {
          await debug(interaction);
        }

        if (commandName === "kick") {
          let tag = options.getString("tag");
          if (tag.length < 3) {
            await interaction.reply({
              content: "Invalid tag format. Please provide a valid Discord tag.",
              ephemeral: true,
            });
            return;
          }
          tag = tag.substring(2, tag.length - 1);
          const confirmationMessage = await interaction.reply({
            content: `Are you sure you want to kick <@${tag}> from the 1-1 program?`,
            ephemeral: true,
            components: [
              {
                type: 1, // ACTION_ROW
                components: [
                  {
                    type: 2, // BUTTON
                    style: 4, // DANGER
                    label: "Yes",
                    customId: "confirm",
                  },
                  {
                    type: 2, // BUTTON
                    style: 2, // SECONDARY
                    label: "No",
                    customId: "cancel",
                  },
                ],
              },
            ],
          });
          
          const collector = interaction.channel.createMessageComponentCollector(
            {
              time: 15000,
            }
          );

          collector.on("collect", async (i) => {
            if (i.customId === "confirm") {
              // remove the 1-1 role from the user
              const member = guild.members.cache.get(tag);
              if (member) {
                await member.roles.remove(role).catch(console.error);
              }

              // remove user from people
              let found = false;
              for (let j = 0; j < people.length; j++) {
                if (people[j][0] === tag) {
                  people.splice(j, 1);
                  save_people();
                  found = true;
                  break;
                }
              }
              if (found) {
                // remove user from preferred_pairs
                for (let j = 0; j < preferred_pairs.length; j++) {
                  if (
                    preferred_pairs[j][0] === tag ||
                    preferred_pairs[j][1] === tag
                  ) {
                    preferred_pairs.splice(j, 1);
                    j--;
                  }
                }
                save_preferred_pairs();
                // remove user from unpaired
                for (let j = 0; j < unpaired.length; j++) {
                  if (unpaired[j] === tag) {
                    unpaired.splice(j, 1);
                    save_unpaired();
                    break;
                  }
                }
                // remove user from current_pairs
                for (let j = 0; j < current_pairs.length; j++) {
                  if (
                    current_pairs[j][0] === tag ||
                    current_pairs[j][1] === tag
                  ) {
                    let partner =
                      current_pairs[j][0] === tag
                        ? current_pairs[j][1]
                        : current_pairs[j][0];
                    // remove user and partner from each other's previous list
                    previous_pairs[tag].pop();
                    previous_pairs[partner].pop();
                    current_pairs.splice(j, 1);
                    // find a new partner for partner
                    if (unpaired.length > 0) {
                      const channel = client.channels.cache.get(
                        channelid
                      );
                      await channel.send(
                        `New pair: <@${partner}> <@${unpaired[0]}>`
                      );
                      add_pair(partner, unpaired[0]);
                    } else {
                      unpaired.push(partner);
                    }
                    save_unpaired();
                    save_previous_pairs();
                    save_current_pairs();
                    break;
                  }
                }
                await i
                  .update({
                    content: `I removed <@${tag}> from the 1-1 program. I'll retain a list of their recent meetings.`,
                    components: [],
                  })
                  .catch(console.error);
              } else {
                await i
                  .update({ content: `User not found`, components: [] })
                  .catch(console.error);
              }
            } else if (i.customId === "cancel") {
              await i
                .update({ content: `Kicking cancelled`, components: [] })
                .catch(console.error);
            }
          });
        }
      } else {
        await interaction.reply({
          content: `Only an admin can use this command.`,
          ephemeral: true,
        });
      }
    }
    // if (commandName === 'feedback') {
    //   await feedback();
    //   await interaction.reply({content: `I've sent everyone a feedback form!`, ephemeral: true});
    // }
  } else {
    // joining 1-1
    if (commandName === "join") {
      // update the people array in the db
      people.push([interaction.user.id, 1, 1]);
      save_people();

      // create a new dictionary entry if it doesn't already exists to store this user's previous_pairs
      if (!previous_pairs.hasOwnProperty(interaction.user.id)) {
        previous_pairs[interaction.user.id] = [];
      }

      // find a partner for user
      if (unpaired.length > 0) {
        const channel = client.channels.cache.get(channelid);
        await channel.send(
          `New pair: <@${interaction.user.id}> <@${unpaired[0]}>`
        );
        add_pair(interaction.user.id, unpaired[0]);
      } else {
        unpaired.push(interaction.user.id);
      }
      save_unpaired();
      save_previous_pairs();
      save_current_pairs();

      // implement the changes in Discord
      interaction.member.roles.add(role);
      await interaction.reply(
        `<@${interaction.user.id}> welcome to the 1-1 program!`
      );
    } else {
      await interaction.reply({
        content: `You need to join the 1-1 program first using /join.`,
        ephemeral: true,
      });
    }
  }
});

function add_pair(user1, user2) {
  // remove user1 and user2 from list of unpaired users
  unpaired.splice(unpaired.indexOf(user1), 1);
  unpaired.splice(unpaired.indexOf(user2), 1);
  // add [user1, user2] to current_pairs
  current_pairs.push([user1, user2]);
  // add [user1, user2] to previous_pairs
  previous_pairs[user1].push(user2);
  if (previous_pairs[user1].length > 10) {
    // If the length exceeds 10, remove the first element
    previous_pairs[user1].shift();
  }
  previous_pairs[user2].push(user1);
  if (previous_pairs[user2].length > 10) {
    // If the length exceeds 10, remove the first element
    previous_pairs[user2].shift();
  }
}

async function debug(interaction) {
  let debugOutput = "People:\n";
  people.forEach((person) => {
    debugOutput += JSON.stringify(person) + "\n";
  });
  debugOutput += "\nWeek: " + week + "\n\n";
  debugOutput += "Current Pairs:\n";
  current_pairs.forEach((pair) => {
    debugOutput += JSON.stringify(pair) + "\n";
  });
  debugOutput += "\nPreferred Pairs:\n";
  preferred_pairs.forEach((pair) => {
    debugOutput += JSON.stringify(pair) + "\n";
  });
  debugOutput += "\nPrevious Pairs:\n";
  for (let key in previous_pairs) {
    debugOutput += key + ":\n";
    previous_pairs[key].forEach((pair) => {
      debugOutput += JSON.stringify(pair) + ", ";
    });
    debugOutput += "\n\n";
  }
  debugOutput += "\nUnpaired people:\n";
  unpaired.forEach((person) => {
    debugOutput += JSON.stringify(person) + "\n";
  });

  // Write debug output to a file
  const filePath = './debug_output.txt';
  fs.writeFileSync(filePath, debugOutput);

  // Send debug output as a file attachment
  await interaction.reply({
    content: "See attachment.",
    files: [{
      attachment: filePath,
      name: "debug_output.txt"
    }],
    ephemeral: true,
  });

  // Delete the temporary file after sending
  fs.unlinkSync(filePath);
}

// most genius DBMS ik

function init_db() {
  fs.writeFileSync("data.txt", "0");
  fs.writeFileSync("current.txt", "");
  fs.writeFileSync("prefer.txt", "");
  fs.writeFileSync("previous.txt", "");
  fs.writeFileSync("unpaired.txt", "");
  fs.writeFileSync("people.txt", "");
  console.log("Database initialized successfully.");
}

function load_data() {
  // Read data.txt and store its value to week
  week = parseInt(fs.readFileSync("data.txt", "utf8").trim());

  // Read unpaired.txt and store its values to an array, unpaired
  const unpairedData = fs.readFileSync("unpaired.txt", "utf8").trim();
  unpaired = unpairedData ? unpairedData.split("\n") : [];

  // Read people.txt
  people = fs
    .readFileSync("people.txt", "utf8")
    .split("\n")
    .map((line) => {
      const [userId, frequency, is_opted] = line
        .trim()
        .split(",")
        .map((str) => str.trim());
      return [userId, parseInt(frequency), parseInt(is_opted)];
    })
    .filter(([userId, frequency, is_opted]) => userId !== "");

  // Read current.txt and store its values to a 2d array, current_pairs
  const currentData = fs.readFileSync("current.txt", "utf8").trim();
  current_pairs = currentData
    ? currentData.split("\n").map((pair) => pair.split(","))
    : [];

  // Read prefer.txt and store its values to a 2d array, preferred_pairs
  const preferData = fs.readFileSync("prefer.txt", "utf8").trim();
  preferred_pairs = preferData
    ? preferData.split("\n").map((pair) => pair.split(","))
    : [];

  // Read previous.txt and store its values to a dictionary, previous_pairs
  const previousData = fs
    .readFileSync("previous.txt", "utf8")
    .trim()
    .split("\n");
  previous_pairs = {};
  if (previousData.length > 0 && previousData[0] === "") {
    previousData.shift(1);
  }
  // console.table(previousData);
  if (previousData.length > 0) {
    previousData.forEach((row) => {
      const rowData = row.split(",");
      const key = rowData.shift();
      previous_pairs[key] = rowData;
    });
  }
}

function save_week() {
  fs.writeFileSync("data.txt", week.toString());
}

function save_unpaired() {
  const data = unpaired.join("\n");
  fs.writeFileSync("unpaired.txt", data);
}

function save_people() {
  // Write people to people.txt
  const peopleData = people
    .map(([userId, frequency, is_opted]) => `${userId}, ${frequency}, ${is_opted}`)
    .join("\n");
  fs.writeFileSync("people.txt", peopleData, "utf8");
}

function save_current_pairs() {
  const data = current_pairs.map((pair) => pair.join(",")).join("\n");
  fs.writeFileSync("current.txt", data);
}

function save_preferred_pairs() {
  const data = preferred_pairs.map((pair) => pair.join(",")).join("\n");
  fs.writeFileSync("prefer.txt", data);
}

function save_previous_pairs() {
  let data = "";
  for (let key in previous_pairs) {
    data += key + "," + previous_pairs[key].join(",") + "\n";
  }
  // console.log(data);
  fs.writeFileSync("previous.txt", data);
}

function shuffleArray(array) {
  // Start from the end of the array
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index between 0 and i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements array[i] and array[j]
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function init_week() {
  // create a list of users that are waiting to be paired
  unpaired = [];
  for (var i = 0; i < people.length; i++) {
    if (week % people[i][1] === 0 && people[i][2] === 1) {
      // check if user opted-in
      if (people[i][2] === 1) {
        unpaired.push(people[i][0]);
      }
    }
  }
  // shuffle the array for the sake of randomness
  unpaired = shuffleArray(unpaired);

  // reset current_pairs
  current_pairs = [];

  // increment week by 1
  week++;
  save_week();
}

async function pairing() {
  await init_week();

  // create the pairings
  // pair all the preferred pairs
  for (let i = 0; i < unpaired.length; i++) {
    for (let j = 0; j < preferred_pairs.length; j++) {
      if (
        (unpaired[i] === preferred_pairs[j][0] &&
          unpaired.includes(preferred_pairs[j][1])) ||
        (unpaired[i] === preferred_pairs[j][1] &&
          unpaired.includes(preferred_pairs[j][0]))
      ) {
        add_pair(preferred_pairs[j][0], preferred_pairs[j][1]);
        preferred_pairs.splice(j, 1);
        i--; // Okay this is kinda sus but since we are removing one element we need to subtact 1. Note that we are always removing exactly 1 element before the current index, not 0 or 2.
        break;
      }
    }
  }
  // pair all the previously unpaired pairs
  for (let i = 0; i < unpaired.length; i++) {
    for (let j = i + 1; j < unpaired.length; j++) {
      if (!previous_pairs[unpaired[i]].includes(unpaired[j])) {
        add_pair(unpaired[i], unpaired[j]);
        i--;
        break;
      }
    }
  }
  // pair all the remaining pairs
  while (unpaired.length > 1) {
    add_pair(unpaired[0], unpaired[1]);
  }

  // save the data
  save_current_pairs();
  save_preferred_pairs();
  save_previous_pairs();
  save_unpaired();

  // output the pairings to Discord
  const channel = client.channels.cache.get(channelid);
  channel.send(`Week ${week} pairings: `);
  for (let i = 0; i < current_pairs.length; i++) {
    channel.send(`<@${current_pairs[i][0]}> <@${current_pairs[i][1]}>`);
  }
  if (unpaired.length > 0) {
    channel.send(`<@${unpaired[0]}> is not paired this week.`);
  }
}

async function reminder() {
  for (let i = 0; i < current_pairs.length; i++) {
    const user1 = await client.users.fetch(current_pairs[i][0]);
    const user2 = await client.users.fetch(current_pairs[i][1]);
    user1.send(
      `Don't forget to meet up with ${user2.username}, if you haven't already!`
    ).catch(console.error); 
    user2.send(
      `Don't forget to meet up with ${user1.username}, if you haven't already!`
    ).catch(console.error);
  }
}

async function optoutmessage() {
  // Set everyone to 1 initially
  for (let i = 0; i < people.length; i++) {
    people[i][2] = 1;
  }

  const channel = client.channels.cache.get(channelid);
  const optoutMessage = await channel.send("React to this message with ❌ to opt out of pairings this week!");
  await optoutMessage.react("❌");

  const filter = (reaction, user) => reaction.emoji.name === '❌' && !user.bot;
  
  const collector = optoutMessage.createReactionCollector({
    filter,
    time: 172800000,
    dispose: true,
  });

  // When a reaction is added
  collector.on('collect', (reaction, user) => {
    // console.log("collected a reaction here");
    for (let i = 0; i < people.length; i++) {
      if (people[i][0] === user.id) {
        people[i][2] = 0; // Opt out the user
        break;
      }
    }
    save_people();
  });

  // When a reaction is removed
  client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.message.id === optoutMessage.id && reaction.emoji.name === '❌' && !user.bot) {
      // console.log("removed a reaction here");
      for (let i = 0; i < people.length; i++) {
        if (people[i][0] === user.id) {
          people[i][2] = 1; // Opt the user back in
          break;
        }
      }
      save_people();
    }
  });

  collector.on('end', (collected, reason) => {
    // could potentially ping everyone who opted out here but i cant be bothered right now oops
  });
}

const cron = require("node-cron");
// generate the weekly pairing
const job1 = cron.schedule(
  "0 0 * * 1",
  async () => {
    // await feedback();
    await pairing();
  },
  {
    timezone: "UTC",
  }
);

// send the weekly reminder
const job2 = cron.schedule(
  "0 0 * * 6",
  async () => {
    await reminder();
  },
  {
    timezone: "UTC",
  }
);

// send the optout
const job3 = cron.schedule(
  "0 0 * * 6",
  async () => {
    await optoutmessage();
  },
  {
    timezone: "UTC",
  }
);

client.login(process.env.TOKEN);
