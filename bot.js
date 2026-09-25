const http = require('http');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

function cleanEnv(value) {
  if (!value) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

const TOKEN = cleanEnv(process.env.TOKEN || process.env.DISCORD_TOKEN);
const CLIENT_ID = cleanEnv(process.env.CLIENT_ID);
const GUILD_ID = cleanEnv(process.env.GUILD_ID);
const PORT = process.env.PORT || 3000;

const CONSOLE_CHANNEL_NAME = "🚫-console";
const VERIFIED_ROLE = "MDC verified";
const ROBLOX_VERIFIED_ROLE = "Roblox Verified";
const OWNER_ROLE = "Owner";
const MOD_ROLE = "Moderator";

const usedCodes = new Set();
const warnings = new Map();
const robloxLinks = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your account with an MDC code')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('Your verification code (must start with MDC-)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('linkroblox')
    .setDescription('Link your Roblox account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Your Roblox username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('unlinkroblox')
    .setDescription('Unlink your Roblox account'),

  new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Check linked Roblox account of a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check')
        .setRequired(false)
    )
].map(cmd => cmd.toJSON());

client.on('debug', (info) => {
  if (info.includes('Heartbeat') || info.includes('heartbeat')) return;
  console.log('[debug]', info);
});

client.on('warn', (info) => console.log('[warn]', info));
client.on('error', (err) => console.error('[client error]', err));
client.on('shardError', (err) => console.error('[shard error]', err));
client.on('shardDisconnect', (event) => console.log('[disconnect]', event && event.code, event && event.reason));

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (!CLIENT_ID) {
    console.log('CLIENT_ID is missing. Slash commands will not register.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Started refreshing application (/) commands.');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    }
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Command register error:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member, guild, user } = interaction;

  async function sendLog(embed) {
    const channel = guild.channels.cache.find(c => c.name === CONSOLE_CHANNEL_NAME || c.name.includes('console'));
    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  if (commandName === 'verify') {
    const code = options.getString('code').trim().toUpperCase();

    if (!code.startsWith('MDC-')) {
      return interaction.reply({ content: 'Invalid code. Code must start with **MDC-**', ephemeral: true });
    }

    if (usedCodes.has(code)) {
      return interaction.reply({ content: 'This code has already been used.', ephemeral: true });
    }

    usedCodes.add(code);

    const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (role) {
      await member.roles.add(role).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('Verification Successful')
      .setDescription(`${user} has been verified with code \`${code}\``)
      .setTimestamp();

    await interaction.reply({ content: 'You have been successfully verified!', ephemeral: true });
    await sendLog(embed);
  }

  if (commandName === 'linkroblox') {
    const username = options.getString('username').trim();

    if (robloxLinks.has(user.id)) {
      return interaction.reply({ content: 'You already have a Roblox account linked. Use `/unlinkroblox` first.', ephemeral: true });
    }

    if (username.length < 3 || username.length > 20) {
      return interaction.reply({ content: 'Invalid Roblox username.', ephemeral: true });
    }

    robloxLinks.set(user.id, username);

    const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
    if (role) {
      await member.roles.add(role).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Roblox Account Linked')
      .setDescription(`${user} linked Roblox account: **${username}**`)
      .setTimestamp();

    await interaction.reply({ content: `Successfully linked Roblox account: **${username}**`, ephemeral: true });
    await sendLog(embed);
  }

  if (commandName === 'unlinkroblox') {
    if (!robloxLinks.has(user.id)) {
      return interaction.reply({ content: 'You do not have a Roblox account linked.', ephemeral: true });
    }

    const oldName = robloxLinks.get(user.id);
    robloxLinks.delete(user.id);

    const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
    if (role) {
      await member.roles.remove(role).catch(() => {});
    }

    await interaction.reply({ content: `Unlinked Roblox account: **${oldName}**`, ephemeral: true });
  }

  if (commandName === 'roblox') {
    const target = options.getUser('user') || user;
    const linked = robloxLinks.get(target.id);

    if (!linked) {
      return interaction.reply({ content: `${target} has no Roblox account linked.`, ephemeral: true });
    }

    await interaction.reply({ content: `**${target.username}** is linked to Roblox: **${linked}**`, ephemeral: true });
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.toLowerCase();
  const member = message.member;
  if (!member) return;

  if (member.roles.cache.some(r => r.name === OWNER_ROLE || r.name === MOD_ROLE)) return;

  const badWords = ['http://', 'https://', 'discord.gg', 'discord.com/invite'];
  const isSpam = badWords.some(w => content.includes(w));

  if (isSpam) {
    const userId = message.author.id;
    const currentWarnings = warnings.get(userId) || 0;

    if (currentWarnings === 0) {
      warnings.set(userId, 1);
      await message.delete().catch(() => {});
      await message.channel.send(`${message.author}, First Warning: Do not post links. Next time you will be banned.`).catch(() => {});
    } else {
      await message.delete().catch(() => {});
      await member.ban({ reason: 'Repeated link/spam violation' }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('User Banned')
        .setDescription(`${message.author.tag} was banned for repeated violations.`)
        .setTimestamp();

      const channel = message.guild.channels.cache.find(c => c.name === CONSOLE_CHANNEL_NAME || c.name.includes('console'));
      if (channel) channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(client.isReady() ? `MDC Bot online as ${client.user.tag}` : 'MDC Bot starting');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

if (!TOKEN) {
  console.error('TOKEN is missing. Add TOKEN or DISCORD_TOKEN in Render Environment.');
  process.exit(1);
}

console.log(`Token loaded. Length: ${TOKEN.length}`);
console.log(`Token starts with: ${TOKEN.slice(0, 4)}...`);

client.login(TOKEN)
  .then(() => {
    console.log('client.login resolved');
  })
  .catch((err) => {
    console.error('LOGIN FAILED:', err && err.message ? err.message : err);
  });
