const http = require('http');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.DirectMessages], partials: [Partials.Message, Partials.Channel, Partials.GuildMember] });
function cleanEnv(value) { if (!value) return ''; return String(value).trim().replace(/^[\'"]|[\'"]$/g, ''); }
const TOKEN = cleanEnv(process.env.TOKEN || process.env.DISCORD_TOKEN);
const CLIENT_ID = cleanEnv(process.env.CLIENT_ID);
const GUILD_ID = cleanEnv(process.env.GUILD_ID);
const PORT = process.env.PORT || 3000;
const DM_CLOSE_MS = 15 * 60 * 1000;
const AI_API_KEY = cleanEnv(process.env.AI_API_KEY);
const AI_BASE_URL = (cleanEnv(process.env.AI_BASE_URL) || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const AI_MODEL = cleanEnv(process.env.AI_MODEL) || 'openrouter/auto';
const BH_API_KEY = cleanEnv(process.env.BH_API_KEY);
const BH_DEPLOYMENT_ID = cleanEnv(process.env.BH_DEPLOYMENT_ID);
const BH_RENEW_AT = cleanEnv(process.env.BH_RENEW_AT);
const startedAt = Date.now();
const sentStatusDays = new Set();
const warnedRenew = new Set();
const CONSOLE_CHANNEL_NAME = '🚫-console';
const VOICE_PANEL_NAME = 'creat-voice-chat';
const VERIFIED_ROLE = 'MDC verified';
const ROBLOX_VERIFIED_ROLE = 'Roblox Verified';
const OWNER_ROLE = 'Owner';
const MOD_ROLE = 'Moderator';
const PROTECTED_ROLES = ['Owner', 'Moderator', 'MDC BOT', 'MDC Bot'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STAFF_TESTS = ['testlogs', 'testverify', 'teststatus', 'testai', 'testroblox'];
const CHANNEL_AI_NOTE = '-# Mentioning the bot can look like spam in some channels. Use DMs for longer chats.';
const usedCodes = new Set(); const verifiedUsers = new Set(); const warnings = new Map(); const robloxLinks = new Map(); const aiHistory = new Map(); const voiceRooms = new Map(); const userLang = new Map();
const LANGS = [{id:'en',name:'English'},{id:'tr',name:'Türkçe'},{id:'de',name:'Deutsch'},{id:'es',name:'Español'},{id:'fr',name:'Français'},{id:'ru',name:'Русский'},{id:'ar',name:'العربية'},{id:'pt',name:'Português'}];
const LANG_FILE = './language-prefs.json';
function loadLang() { try { for (const [id, lang] of Object.entries(JSON.parse(fs.readFileSync(LANG_FILE, 'utf8')))) userLang.set(id, lang); } catch {} }
function saveLang() { try { fs.writeFileSync(LANG_FILE, JSON.stringify(Object.fromEntries(userLang))); } catch {} }
function langName(id) { return (LANGS.find(l => l.id === id) || {}).name || id; }
const VOICE_EMPTY_CLOSE = 15 * 60 * 1000;
const VOICE_EMPTY_WARN = 10 * 60 * 1000;
function checksum(body) { let a = 0, b = 0; for (let i = 0; i < body.length; i++) { const n = CODE_CHARS.indexOf(body[i]); if (n < 0) return null; a = (a + (n + 3) * (i + 7)) % CODE_CHARS.length; b = (b + a + n * 5) % CODE_CHARS.length; } return CODE_CHARS[a] + CODE_CHARS[b]; }
function isValidCode(raw) { const code = String(raw || '').trim().toUpperCase(); return /^MDC-[A-Z2-9]{8}$/.test(code) && checksum(code.slice(4, 10)) === code.slice(10); }
function isStaff(member) { return member && member.roles.cache.some(r => r.name === OWNER_ROLE || r.name === MOD_ROLE); }
function isProtected(member) { if (!member) return false; if (member.id === client.user.id || member.user?.bot) return true; return member.roles.cache.some(r => PROTECTED_ROLES.includes(r.name)); }
function formatUptime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'; }
function mb(bytes) { return Math.round((Number(bytes) || 0) / 1048576) + ' MB'; }
function statusEmbed() { return new EmbedBuilder().setColor(0x5865F2).setTitle('MDC Bot Status').addFields({ name: 'Status', value: client.isReady() ? 'Online' : 'Starting', inline: true }, { name: 'Ping', value: Math.round(client.ws.ping) + ' ms', inline: true }, { name: 'Uptime', value: formatUptime(Date.now() - startedAt), inline: true }, { name: 'Servers', value: String(client.guilds.cache.size), inline: true }, { name: 'AI chat', value: AI_API_KEY ? 'Enabled' : 'Disabled', inline: true }).setTimestamp(); }
async function sendToConsole(payload) { for (const guild of client.guilds.cache.values()) { const channel = guild.channels.cache.find(c => c.name === CONSOLE_CHANNEL_NAME || c.name.includes('console')); if (channel) await channel.send(payload).catch(() => {}); } }
async function sendStatusToConsole() { await sendToConsole({ embeds: [statusEmbed()] }); }
function turkeyParts() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return Object.fromEntries(parts.map(p => [p.type, p.value])); }
async function isVerifiedUser(userId) { if (verifiedUsers.has(userId)) return true; for (const guild of client.guilds.cache.values()) { const member = await guild.members.fetch(userId).catch(() => null); const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE); if (member && role && member.roles.cache.has(role.id)) { verifiedUsers.add(userId); return true; } } return false; }
async function askAi(userId, text) { if (!AI_API_KEY) return 'AI chat is not set up yet.'; const history = aiHistory.get(userId) || []; history.push({ role: 'user', content: String(text || '').slice(0, 500) }); const trimmed = history.slice(-8); const chosen = langName(userLang.get(userId)); const res = await fetch(AI_BASE_URL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_API_KEY, 'HTTP-Referer': 'https://mdcforlegal.github.io/MDC-VERIFY/', 'X-Title': 'MDC Bot' }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 300, messages: [{ role: 'system', content: 'You are MDC Bot, a friendly Discord assistant. Reply in ' + (chosen || 'the same language the user used') + '. Keep it short and appropriate for all ages. Do not discuss sexual content, violence, or illegal activity.' }, ...trimmed] }) }); if (!res.ok) return 'I could not answer right now. Try again in a moment.'; const data = await res.json(); const safe = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'I do not have an answer.').slice(0, 1700); trimmed.push({ role: 'assistant', content: safe }); aiHistory.set(userId, trimmed.slice(-8)); return safe; }
async function lookupRoblox(input) { const query = input.trim(); const byUsername = await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [query], excludeBannedUsers: true }) }); if (byUsername.ok) { const data = await byUsername.json(); if (data.data && data.data.length) return data.data[0]; } const search = await fetch('https://users.roblox.com/v1/users/search?keyword=' + encodeURIComponent(query) + '&limit=10'); if (!search.ok) throw new Error('Roblox API failed'); const found = await search.json(); const lowered = query.toLowerCase(); return (found.data || []).find(u => (u.displayName || '').toLowerCase() === lowered || (u.name || '').toLowerCase() === lowered) || null; }
async function bhGet(path) { const res = await fetch('https://bot-hosting.net/api/v1' + path, { headers: { Authorization: 'Bearer ' + BH_API_KEY } }); if (!res.ok) throw new Error('Bot-Hosting API ' + res.status); return res.json(); }
function firstDate(values) { for (const value of values) { if (!value) continue; const time = new Date(value).getTime(); if (!Number.isNaN(time)) return time; } return null; }
async function hostingInfo() { if (!BH_API_KEY) throw new Error('BH_API_KEY is missing.'); const listed = await bhGet('/deployments'); const deployments = listed.deployments || listed.items || listed.data || []; const deployment = deployments.find(d => d.id === BH_DEPLOYMENT_ID) || deployments[0]; if (!deployment) throw new Error('No deployment found.'); const [account, resources] = await Promise.all([bhGet('/account').catch(() => null), bhGet('/deployments/' + deployment.id + '/resources').catch(() => null)]); return { deployment, account, resources, renewAt: firstDate([BH_RENEW_AT, account && account.plan && (account.plan.renewsAt || account.plan.expiresAt || account.plan.periodEnd), deployment.renewsAt, deployment.expiresAt]) }; }
function hostingEmbed(info) { const d = info.deployment; const r = info.resources || {}; const plan = info.account && info.account.plan; const renew = info.renewAt ? '<t:' + Math.floor(info.renewAt / 1000) + ':R>' : 'Set BH_RENEW_AT.'; return new EmbedBuilder().setColor(0x57F287).setTitle('Bot-Hosting status').addFields({ name: 'Server', value: d.name || d.id, inline: true }, { name: 'State', value: r.state || d.state || 'unknown', inline: true }, { name: 'Plan', value: plan ? (plan.name || plan.tier || 'unknown') : 'unknown', inline: true }, { name: 'CPU', value: r.cpu ? Math.round(r.cpu.usedPercent || 0) + '%' : 'unknown', inline: true }, { name: 'RAM', value: r.memory ? mb(r.memory.usedBytes) + ' / ' + mb(r.memory.limitBytes) : 'unknown', inline: true }, { name: 'Renew', value: renew, inline: true }).setTimestamp(); }
async function checkRenewWarning() { if (!BH_API_KEY) return; const info = await hostingInfo(); if (!info.renewAt) return; const left = info.renewAt - Date.now(); if (left <= 0 || left > 30 * 60 * 1000 || warnedRenew.has(String(info.renewAt))) return; warnedRenew.add(String(info.renewAt)); await sendToConsole({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Renew warning').setDescription('Bot-Hosting renew time is in under 30 minutes.').addFields({ name: 'Renew', value: '<t:' + Math.floor(info.renewAt / 1000) + ':R>' }).setTimestamp()] }); }
function trackVoice(channel, ownerId) { voiceRooms.set(channel.id, { ownerId, emptySince: Date.now(), warned: false, guildId: channel.guild.id }); }
async function checkVoiceRooms() {
  for (const [id, room] of voiceRooms) {
    const guild = client.guilds.cache.get(room.guildId);
    const channel = guild && guild.channels.cache.get(id);
    if (!channel) { voiceRooms.delete(id); continue; }
    if (channel.members.size > 0) { room.emptySince = Date.now(); room.warned = false; continue; }
    const emptyFor = Date.now() - room.emptySince;
    if (emptyFor >= VOICE_EMPTY_CLOSE) { voiceRooms.delete(id); await channel.delete('Empty for 15 minutes').catch(() => {}); continue; }
    if (emptyFor >= VOICE_EMPTY_WARN && !room.warned) {
      room.warned = true;
      const user = await client.users.fetch(room.ownerId).catch(() => null);
      if (user) await user.send('<@' + room.ownerId + '> Your voice chat **' + channel.name + '** will close in 5 minutes if it stays empty.').catch(() => {});
    }
  }
}
async function ensureLanguagePanel() {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.isTextBased() && (c.name.includes('languange') || c.name.includes('language')));
    if (!channel) continue;
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (messages && messages.some(m => m.author.id === client.user.id && m.components.some(row => row.components.some(b => b.customId === 'set_language')))) continue;
    const menu = new StringSelectMenuBuilder().setCustomId('set_language').setPlaceholder('Choose your language').addOptions(LANGS.map(l => ({ label: l.name, value: l.id })));
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Choose your language').setDescription('Pick a language. The bot will talk to you in that language. You can change it any time.')], components: [new ActionRowBuilder().addComponents(menu)] }).catch((err) => console.error('Language panel failed:', err.message));
  }
}
function voicePanelRow() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_voice').setLabel('Create voice chat').setStyle(ButtonStyle.Primary)); }
async function ensureVoicePanel() {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.isTextBased() && (c.name === '🔊-' + VOICE_PANEL_NAME || c.name.includes(VOICE_PANEL_NAME)));
    if (!channel) continue;
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (messages && messages.some(m => m.author.id === client.user.id && m.components.some(row => row.components.some(b => b.customId === 'create_voice')))) continue;
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Create a voice chat').setDescription('Press the button and set the room yourself.\n\nName, user limit, bitrate, and private room.')], components: [voicePanelRow()] }).catch((err) => console.error('Voice panel failed:', err.message));
  }
}
function verifyDmRow() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_verify_dm').setLabel('Close').setStyle(ButtonStyle.Secondary)); }
const VERIFY_DM = 'Thanks for joining the MDC Discord server.\n\nYour account is now verified. Read the rules, then jump into the channels.\n\nYou can also message me in this DM and I will reply.\n\nPress Close to remove this message. If you leave it, it will be deleted in 15 minutes.';
const commands = [new SlashCommandBuilder().setName('status').setDescription('Show the bot status'), new SlashCommandBuilder().setName('hostingstatus').setDescription('Staff: show Bot-Hosting server status'), new SlashCommandBuilder().setName('testlogs').setDescription('Staff test: send a log to the console channel'), new SlashCommandBuilder().setName('testverify').setDescription('Staff test: send the verify DM without verifying'), new SlashCommandBuilder().setName('teststatus').setDescription('Staff test: send the status report now'), new SlashCommandBuilder().setName('testai').setDescription('Staff test: check the AI reply'), new SlashCommandBuilder().setName('testroblox').setDescription('Staff test: look up a Roblox name without linking').addStringOption(o => o.setName('username').setDescription('Roblox display name').setRequired(true)), new SlashCommandBuilder().setName('verify').setDescription('Verify your account with a code from the MDC verify site').addStringOption(o => o.setName('code').setDescription('Verification code from the site').setRequired(true)), new SlashCommandBuilder().setName('linkroblox').setDescription('Link a real Roblox account').addStringOption(o => o.setName('username').setDescription('Your Roblox display name').setRequired(true)), new SlashCommandBuilder().setName('unlinkroblox').setDescription('Unlink your Roblox account'), new SlashCommandBuilder().setName('roblox').setDescription('Check linked Roblox account of a user').addUserOption(o => o.setName('user').setDescription('The user to check').setRequired(false)), new SlashCommandBuilder().setName('ban').setDescription('Ban a member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Ban reason').setRequired(true)), new SlashCommandBuilder().setName('kick').setDescription('Kick a member').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Kick reason').setRequired(true)), new SlashCommandBuilder().setName('mute').setDescription('Timeout a member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Mute reason').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Timeout minutes (default 60)').setMinValue(1).setMaxValue(40320)), new SlashCommandBuilder().setName('unmute').setDescription('Remove a timeout').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true)), new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o => o.setName('userid').setDescription('User ID to unban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Unban reason').setRequired(false))].map(cmd => cmd.toJSON());
client.on('warn', (info) => console.log('[warn]', info));
client.on('error', (err) => console.error('[client error]', err));
client.on('shardError', (err) => console.error('[shard error]', err));
client.once('clientReady', async () => {
  console.log('Logged in as ' + client.user.tag);
  loadLang();
  await ensureVoicePanel();
  await ensureLanguagePanel();
  setInterval(() => checkVoiceRooms().catch((err) => console.error('Voice check failed:', err.message)), 60 * 1000);
  setInterval(async () => { const p = turkeyParts(); if ((p.weekday !== 'Mon' && p.weekday !== 'Fri') || p.hour !== '12') return; const key = p.month + '-' + p.day; if (sentStatusDays.has(key)) return; sentStatusDays.add(key); await sendStatusToConsole(); }, 60 * 1000);
  setInterval(() => checkRenewWarning().catch((err) => console.error('Renew check failed:', err.message)), 5 * 60 * 1000);
  if (!CLIENT_ID) return;
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try { if (GUILD_ID) await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); else await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log('Successfully reloaded application (/) commands.'); } catch (error) { console.error('Command register error:', error); }
});
client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'set_language') {
    const lang = interaction.values[0];
    userLang.set(interaction.user.id, lang);
    saveLang();
    return interaction.reply({ content: 'Language set to **' + langName(lang) + '**. You can change it any time.', ephemeral: true });
  }
  if (interaction.isButton() && interaction.customId === 'close_verify_dm') { await interaction.message.delete().catch(() => {}); return; }
  if (interaction.isButton() && interaction.customId === 'create_voice') {
    const modal = new ModalBuilder().setCustomId('create_voice_modal').setTitle('Create voice chat').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Room name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit').setLabel('User limit, 0 = unlimited').setStyle(TextInputStyle.Short).setRequired(true).setValue('0').setMaxLength(2)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bitrate').setLabel('Bitrate kbps, 8-96').setStyle(TextInputStyle.Short).setRequired(true).setValue('64').setMaxLength(2)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('private').setLabel('Private? yes or no').setStyle(TextInputStyle.Short).setRequired(true).setValue('no').setMaxLength(3))
    );
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId === 'create_voice_modal') {
    const name = interaction.fields.getTextInputValue('name').trim().slice(0, 80);
    const limit = Math.max(0, Math.min(99, Number(interaction.fields.getTextInputValue('limit')) || 0));
    const bitrate = Math.max(8, Math.min(96, Number(interaction.fields.getTextInputValue('bitrate')) || 64)) * 1000;
    const isPrivate = interaction.fields.getTextInputValue('private').trim().toLowerCase().startsWith('y');
    const panel = interaction.channel;
    const overwrites = isPrivate ? [{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] }, { id: interaction.user.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }] : [];
    try {
      const voice = await interaction.guild.channels.create({ name, type: ChannelType.GuildVoice, parent: panel && panel.parentId, userLimit: limit, bitrate, permissionOverwrites: overwrites });
      trackVoice(voice, interaction.user.id);
      return interaction.reply({ content: 'Voice chat created: <#' + voice.id + '>. It closes after 15 minutes empty.', ephemeral: true });
    } catch (err) { return interaction.reply({ content: 'Could not create the voice chat. Give the bot Manage Channels. ' + err.message, ephemeral: true }); }
  }
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, member, guild, user } = interaction;
  if (commandName === 'status') return interaction.reply({ embeds: [statusEmbed()] });
  async function sendLog(embed) { const channel = guild.channels.cache.find(c => c.name === CONSOLE_CHANNEL_NAME || c.name.includes('console')); if (channel) await channel.send({ embeds: [embed] }).catch(() => {}); }
  async function protectedTarget(targetUser) { if (!targetUser || targetUser.id === client.user.id || targetUser.bot) return true; return isProtected(await guild.members.fetch(targetUser.id).catch(() => null)); }
  if (commandName === 'hostingstatus') { if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true }); await interaction.deferReply({ ephemeral: true }); try { return interaction.editReply({ embeds: [hostingEmbed(await hostingInfo())] }); } catch (err) { return interaction.editReply('Could not read Bot-Hosting: ' + err.message); } }
  if (STAFF_TESTS.includes(commandName)) {
    if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true });
    if (commandName === 'testlogs') { await sendLog(new EmbedBuilder().setColor(0xFEE75C).setTitle('Test log').setDescription(user + ' sent a test log.').setTimestamp()); return interaction.reply({ content: 'Test log sent to the console channel.', ephemeral: true }); }
    if (commandName === 'testverify') { try { const dm = await user.send({ content: '[TEST]\n\n' + VERIFY_DM, components: [verifyDmRow()] }); setTimeout(() => dm.delete().catch(() => {}), DM_CLOSE_MS); return interaction.reply({ content: 'Test verify DM sent. No role was given.', ephemeral: true }); } catch { return interaction.reply({ content: 'Could not send the test DM.', ephemeral: true }); } }
    if (commandName === 'teststatus') { await sendStatusToConsole(); return interaction.reply({ content: 'Status sent to the console channel.', ephemeral: true }); }
    if (commandName === 'testai') { await interaction.deferReply({ ephemeral: true }); return interaction.editReply(await askAi(user.id, 'Reply with: MDC AI test ok.')); }
    if (commandName === 'testroblox') { await interaction.deferReply({ ephemeral: true }); try { const roblox = await lookupRoblox(options.getString('username')); if (!roblox) return interaction.editReply('Not found. No account was linked.'); return interaction.editReply('Found **' + (roblox.displayName || roblox.name) + '**. No account was linked.'); } catch { return interaction.editReply('Roblox lookup failed.'); } }
  }
  if (commandName === 'verify') {
    const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE);
    if (verifiedUsers.has(user.id) || (role && member.roles.cache.has(role.id))) return interaction.reply({ content: 'You are already verified.', ephemeral: true });
    const code = options.getString('code').trim().toUpperCase();
    if (!isValidCode(code)) return interaction.reply({ content: 'Invalid code. Get a code from the verify site.', ephemeral: true });
    if (usedCodes.has(code)) return interaction.reply({ content: 'This code has already been used.', ephemeral: true });
    usedCodes.add(code); verifiedUsers.add(user.id); if (role) await member.roles.add(role).catch(() => {});
    await interaction.reply({ content: 'You have been successfully verified!', ephemeral: true });
    await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('Verification Successful').setDescription(user + ' verified.').setTimestamp());
    try { const dm = await user.send({ content: VERIFY_DM, components: [verifyDmRow()] }); setTimeout(() => dm.delete().catch(() => {}), DM_CLOSE_MS); } catch { console.log('Could not DM verified user.'); }
    return;
  }
  if (commandName === 'linkroblox') { if (robloxLinks.has(user.id)) return interaction.reply({ content: 'You already have a Roblox account linked. Use /unlinkroblox first.', ephemeral: true }); await interaction.deferReply({ ephemeral: true }); let roblox; try { roblox = await lookupRoblox(options.getString('username').trim()); } catch { return interaction.editReply('Could not reach Roblox. Try again.'); } if (!roblox) return interaction.editReply('That Roblox account name was not found.'); const shown = roblox.displayName || roblox.name; robloxLinks.set(user.id, shown); const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE); if (role) await member.roles.add(role).catch(() => {}); let nickNote = ''; if (isStaff(member)) nickNote = ' Staff nickname was left unchanged.'; else { try { await member.setNickname(shown.slice(0, 32)); } catch { nickNote = ' Nickname was not changed.'; } } await interaction.editReply('Linked Roblox account **' + shown + '**.' + nickNote); await sendLog(new EmbedBuilder().setColor(0x5865F2).setTitle('Roblox Account Linked').setDescription(user + ' linked **' + shown + '**').setTimestamp()); return; }
  if (commandName === 'unlinkroblox') { if (!robloxLinks.has(user.id)) return interaction.reply({ content: 'You do not have a Roblox account linked.', ephemeral: true }); const oldName = robloxLinks.get(user.id); robloxLinks.delete(user.id); const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE); if (role) await member.roles.remove(role).catch(() => {}); if (!isStaff(member)) await member.setNickname(null).catch(() => {}); return interaction.reply({ content: 'Unlinked Roblox account: **' + oldName + '**', ephemeral: true }); }
  if (commandName === 'roblox') { const target = options.getUser('user') || user; const linked = robloxLinks.get(target.id); if (!linked) return interaction.reply({ content: target + ' has no Roblox account linked.', ephemeral: true }); return interaction.reply({ content: '**' + target.username + '** is linked to Roblox: **' + linked + '**', ephemeral: true }); }
  if (['ban', 'kick', 'mute', 'unmute'].includes(commandName)) { if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true }); if (await protectedTarget(options.getUser('user'))) { await sendLog(new EmbedBuilder().setColor(0xED4245).setTitle('Blocked moderation').setDescription(user + ' tried to ' + commandName + ' a protected member.').setTimestamp()); return interaction.reply({ content: 'This member is protected. Action refused.', ephemeral: true }); } }
  if (commandName === 'unban' && !isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true });
  if (commandName === 'ban') { const target = options.getUser('user'); const reason = options.getString('reason'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.bannable) return interaction.reply({ content: 'I cannot ban that user. Check role order.', ephemeral: true }); await targetMember.ban({ reason: user.tag + ': ' + reason }); await interaction.reply({ content: 'Banned **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xED4245).setTitle('User Banned').setDescription(user + ' banned ' + target.tag + '\nReason: ' + reason).setTimestamp()); return; }
  if (commandName === 'kick') { const target = options.getUser('user'); const reason = options.getString('reason'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.kickable) return interaction.reply({ content: 'I cannot kick that user. Check role order.', ephemeral: true }); await targetMember.kick(user.tag + ': ' + reason); await interaction.reply({ content: 'Kicked **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xFEE75C).setTitle('User Kicked').setDescription(user + ' kicked ' + target.tag + '\nReason: ' + reason).setTimestamp()); return; }
  if (commandName === 'mute') { const target = options.getUser('user'); const reason = options.getString('reason'); const minutes = options.getInteger('minutes') || 60; const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.moderatable) return interaction.reply({ content: 'I cannot mute that user. Check role order.', ephemeral: true }); await targetMember.timeout(minutes * 60 * 1000, user.tag + ': ' + reason); await interaction.reply({ content: 'Muted **' + target.tag + '** for ' + minutes + ' minutes.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xF1C40F).setTitle('User Muted').setDescription(user + ' muted ' + target.tag).setTimestamp()); return; }
  if (commandName === 'unmute') { const target = options.getUser('user'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); await targetMember.timeout(null); await interaction.reply({ content: 'Unmuted **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unmuted').setDescription(user + ' unmuted ' + target.tag).setTimestamp()); return; }
  if (commandName === 'unban') { const userId = options.getString('userid').trim(); const reason = options.getString('reason') || 'No reason'; if (!/^\d{17,20}$/.test(userId)) return interaction.reply({ content: 'Enter a valid user ID.', ephemeral: true }); if (userId === client.user.id) return interaction.reply({ content: 'This member is protected. Action refused.', ephemeral: true }); await guild.members.unban(userId, user.tag + ': ' + reason); await interaction.reply({ content: 'Unbanned <@' + userId + '>.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unbanned').setDescription(user + ' unbanned ' + userId).setTimestamp()); }
});
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.guild && message.mentions.has(client.user)) {
    const question = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!(isStaff(message.member) || await isVerifiedUser(message.author.id))) return message.reply(CHANNEL_AI_NOTE + '\nVerify before chatting with me.').catch(() => {});
    if (!question) return message.reply(CHANNEL_AI_NOTE + '\nAdd a question after the mention.').catch(() => {});
    try { await message.channel.sendTyping(); await message.reply(CHANNEL_AI_NOTE + '\n' + await askAi(message.author.id, question)); } catch { await message.reply('I could not answer right now.').catch(() => {}); }
    return;
  }
  if (!message.guild) { if (!(await isVerifiedUser(message.author.id))) return message.reply('Verify in the server before chatting with me.').catch(() => {}); try { await message.channel.sendTyping(); await message.reply(await askAi(message.author.id, message.content || '')); } catch { await message.reply('I could not answer right now.').catch(() => {}); } return; }
  if (!message.member || isProtected(message.member)) return;
  const content = message.content.toLowerCase();
  if (!['http://', 'https://', 'discord.gg', 'discord.com/invite'].some(w => content.includes(w))) return;
  const count = warnings.get(message.author.id) || 0;
  if (count === 0) { warnings.set(message.author.id, 1); await message.delete().catch(() => {}); await message.channel.send(message.author + ', First Warning: Do not post links. Next time you will be banned.').catch(() => {}); } else { await message.delete().catch(() => {}); await message.member.ban({ reason: 'Repeated link/spam violation' }).catch(() => {}); }
});
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(client.isReady() ? 'MDC Bot online as ' + client.user.tag : 'MDC Bot starting'); }).listen(PORT, '0.0.0.0');
if (!TOKEN) { console.error('TOKEN is missing.'); process.exit(1); }
client.login(TOKEN).catch((err) => console.error('LOGIN FAILED:', err && err.message ? err.message : err));
