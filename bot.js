const http = require('http');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

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
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const usedCodes = new Set();
const warnings = new Map();
const robloxLinks = new Map();

function checksum(body) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < body.length; i++) {
    const n = CODE_CHARS.indexOf(body[i]);
    if (n < 0) return null;
    a = (a + (n + 3) * (i + 7)) % CODE_CHARS.length;
    b = (b + a + n * 5) % CODE_CHARS.length;
  }
  return CODE_CHARS[a] + CODE_CHARS[b];
}

function isValidCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^MDC-[A-Z2-9]{8}$/.test(code)) return false;
  return checksum(code.slice(4, 10)) === code.slice(10);
}

function isStaff(member) {
  return member.roles.cache.some(r => r.name === OWNER_ROLE || r.name === MOD_ROLE);
}

async function lookupRoblox(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
  });
  if (!res.ok) throw new Error('Roblox API failed');
  const data = await res.json();
  if (!data.data || !data.data.length) return null;
  return data.data[0];
}

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your account with a code from the MDC verify site')
    .addStringOption(option => option.setName('code').setDescription('Verification code from the site').setRequired(true)),
  new SlashCommandBuilder()
    .setName('linkroblox')
    .setDescription('Link a real Roblox account')
    .addStringOption(option => option.setName('username').setDescription('Your Roblox username').setRequired(true)),
  new SlashCommandBuilder().setName('unlinkroblox').setDescription('Unlink your Roblox account'),
  new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Check linked Roblox account of a user')
    .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(false)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option => option.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Ban reason').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option => option.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Kick reason').setRequired(true)),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Mute reason').setRequired(true))
    .addIntegerOption(option => option.setName('minutes').setDescription('Timeout minutes (default 60)').setMinValue(1).setMaxValue(40320)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove a timeout')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option => option.setName('user').setDescription('Member to unmute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option => option.setName('userid').setDescription('User ID to unban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Unban reason').setRequired(false))
].map(cmd => cmd.toJSON());

client.on('warn', (info) => console.log('[warn]', info));
client.on('error', (err) => console.error('[client error]', err));
client.on('shardError', (err) => console.error('[shard error]', err));

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (!CLIENT_ID) return console.log('CLIENT_ID is missing.');
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
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
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  }

  if (commandName === 'verify') {
    const code = options.getString('code').trim().toUpperCase();
    if (!isValidCode(code)) return interaction.reply({ content: 'Invalid code. Get a code from the verify site.', ephemeral: true });
    if (usedCodes.has(code)) return interaction.reply({ content: 'This code has already been used.', ephemeral: true });
    usedCodes.add(code);
    const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (role) await member.roles.add(role).catch(() => {});
    await interaction.reply({ content: 'You have been successfully verified!', ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('Verification Successful').setDescription(`${user} verified.`).setTimestamp());
    return;
  }

  if (commandName === 'linkroblox') {
    const username = options.getString('username').trim();
    if (robloxLinks.has(user.id)) {
      return interaction.reply({ content: 'You already have a Roblox account linked. Use `/unlinkroblox` first.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    let roblox;
    try {
      roblox = await lookupRoblox(username);
    } catch {
      return interaction.editReply('Could not reach Roblox. Try again.');
    }
    if (!roblox) return interaction.editReply('That Roblox username does not exist.');

    robloxLinks.set(user.id, roblox.name);
    const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
    if (role) await member.roles.add(role).catch(() => {});

    let nickNote = '';
    try {
      await member.setNickname(roblox.name);
    } catch {
      nickNote = ' Nickname was not changed. Move the bot role above this member.';
    }

    await interaction.editReply(`Linked Roblox account **${roblox.name}**.${nickNote}`);
    await sendLog(new EmbedBuilder().setColor(0x5865F2).setTitle('Roblox Account Linked').setDescription(`${user} linked **${roblox.name}** (ID ${roblox.id})`).setTimestamp());
    return;
  }

  if (commandName === 'unlinkroblox') {
    if (!robloxLinks.has(user.id)) return interaction.reply({ content: 'You do not have a Roblox account linked.', ephemeral: true });
    const oldName = robloxLinks.get(user.id);
    robloxLinks.delete(user.id);
    const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
    if (role) await member.roles.remove(role).catch(() => {});
    await member.setNickname(null).catch(() => {});
    return interaction.reply({ content: `Unlinked Roblox account: **${oldName}**`, ephemeral: true });
  }

  if (commandName === 'roblox') {
    const target = options.getUser('user') || user;
    const linked = robloxLinks.get(target.id);
    if (!linked) return interaction.reply({ content: `${target} has no Roblox account linked.`, ephemeral: true });
    return interaction.reply({ content: `**${target.username}** is linked to Roblox: **${linked}**`, ephemeral: true });
  }

  if (['ban', 'kick', 'mute', 'unmute', 'unban'].includes(commandName) && !isStaff(member)) {
    return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true });
  }

  if (commandName === 'ban') {
    const target = options.getUser('user');
    const reason = options.getString('reason');
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    if (!targetMember.bannable) return interaction.reply({ content: 'I cannot ban that user. Check role order.', ephemeral: true });
    await targetMember.ban({ reason: `${user.tag}: ${reason}` });
    await interaction.reply({ content: `Banned **${target.tag}**. Reason: ${reason}`, ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0xED4245).setTitle('User Banned').setDescription(`${user} banned ${target.tag}\nReason: ${reason}`).setTimestamp());
    return;
  }

  if (commandName === 'kick') {
    const target = options.getUser('user');
    const reason = options.getString('reason');
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    if (!targetMember.kickable) return interaction.reply({ content: 'I cannot kick that user. Check role order.', ephemeral: true });
    await targetMember.kick(`${user.tag}: ${reason}`);
    await interaction.reply({ content: `Kicked **${target.tag}**. Reason: ${reason}`, ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0xFEE75C).setTitle('User Kicked').setDescription(`${user} kicked ${target.tag}\nReason: ${reason}`).setTimestamp());
    return;
  }

  if (commandName === 'mute') {
    const target = options.getUser('user');
    const reason = options.getString('reason');
    const minutes = options.getInteger('minutes') || 60;
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    if (!targetMember.moderatable) return interaction.reply({ content: 'I cannot mute that user. Check role order.', ephemeral: true });
    await targetMember.timeout(minutes * 60 * 1000, `${user.tag}: ${reason}`);
    await interaction.reply({ content: `Muted **${target.tag}** for ${minutes} minutes. Reason: ${reason}`, ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0xF1C40F).setTitle('User Muted').setDescription(`${user} muted ${target.tag} for ${minutes} minutes\nReason: ${reason}`).setTimestamp());
    return;
  }

  if (commandName === 'unmute') {
    const target = options.getUser('user');
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    await targetMember.timeout(null);
    await interaction.reply({ content: `Unmuted **${target.tag}**.`, ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unmuted').setDescription(`${user} unmuted ${target.tag}`).setTimestamp());
    return;
  }

  if (commandName === 'unban') {
    const userId = options.getString('userid').trim();
    const reason = options.getString('reason') || 'No reason';
    if (!/^\d{17,20}$/.test(userId)) return interaction.reply({ content: 'Enter a valid user ID.', ephemeral: true });
    await guild.members.unban(userId, `${user.tag}: ${reason}`);
    await interaction.reply({ content: `Unbanned <@${userId}>.`, ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unbanned').setDescription(`${user} unbanned ${userId}\nReason: ${reason}`).setTimestamp());
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || !message.member || isStaff(message.member)) return;
  const content = message.content.toLowerCase();
  if (!['http://', 'https://', 'discord.gg', 'discord.com/invite'].some(w => content.includes(w))) return;
  const count = warnings.get(message.author.id) || 0;
  if (count === 0) {
    warnings.set(message.author.id, 1);
    await message.delete().catch(() => {});
    await message.channel.send(`${message.author}, First Warning: Do not post links. Next time you will be banned.`).catch(() => {});
  } else {
    await message.delete().catch(() => {});
    await message.member.ban({ reason: 'Repeated link/spam violation' }).catch(() => {});
  }
});

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(client.isReady() ? `MDC Bot online as ${client.user.tag}` : 'MDC Bot starting');
}).listen(PORT, '0.0.0.0');

if (!TOKEN) {
  console.error('TOKEN is missing.');
  process.exit(1);
}
client.login(TOKEN).catch((err) => console.error('LOGIN FAILED:', err && err.message ? err.message : err));
