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
const warnedRenew = new Set();
const CONSOLE_CHANNEL_NAME = '🚫-console';
const VOICE_PANEL_NAME = 'creat-voice-chat';
const VERIFIED_ROLE = 'MDC verified';
const UNVERIFIED_ROLE = 'MDC unverified';
const ROBLOX_VERIFIED_ROLE = 'Roblox Verified';
const OWNER_ROLE = 'Owner';
const MOD_ROLE = 'Moderator';
const PROTECTED_ROLES = ['Owner', 'Moderator', 'MDC BOT', 'MDC Bot'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STAFF_TESTS = ['testlogs', 'testverify', 'teststatus', 'testai', 'testroblox', 'testrank', 'testboost', 'testboostboard', 'postrules'];
const CHANNEL_AI_NOTE = '-# Mentioning the bot can look like spam in some channels. Use DMs for longer chats.';
const verifiedUsers = new Set(); const warnings = new Map(); const swearMutes = new Map();
const SWEAR_FILE = './swear-mutes.json';
function loadSwear() { try { for (const [id, n] of Object.entries(JSON.parse(fs.readFileSync(SWEAR_FILE, 'utf8')))) swearMutes.set(id, n); } catch {} }
function saveSwear() { try { fs.writeFileSync(SWEAR_FILE, JSON.stringify(Object.fromEntries(swearMutes))); } catch {} }
const SWEAR_MINUTES = [5, 15, 30, 60, 360, 1440, 10080];
const SWEAR_WORDS = ['fuck','fucking','fucker','shit','bitch','asshole','bastard','dick','pussy','slut','whore','cunt','nigger','faggot','amk','aq','sik','siktir','orospu','piç','yarrak','göt','sikerim','sikeyim'];
function hasSwear(text) {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9çğıöşü]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  return words.some(w => SWEAR_WORDS.includes(w));
} const robloxLinks = new Map(); const aiHistory = new Map(); const voiceRooms = new Map(); const userLang = new Map();
const LANGS = [{id:'en',name:'English'},{id:'tr',name:'Türkçe'},{id:'de',name:'Deutsch'},{id:'es',name:'Español'},{id:'fr',name:'Français'},{id:'ru',name:'Русский'},{id:'ar',name:'العربية'},{id:'pt',name:'Português'}];
const LANG_FILE = './language-prefs.json';
function loadLang() { try { for (const [id, lang] of Object.entries(JSON.parse(fs.readFileSync(LANG_FILE, 'utf8')))) userLang.set(id, lang); } catch {} }
function saveLang() { try { fs.writeFileSync(LANG_FILE, JSON.stringify(Object.fromEntries(userLang))); } catch {} }
const activity = new Map();
const ACTIVITY_FILE = './activity.json';
const RANKS = [
  { name: 'silver', emoji: '⚪', min: 25, activeDays: 30 },
  { name: 'iron', emoji: '⚙️', min: 100, activeDays: 30 },
  { name: 'gold', emoji: '⭐', min: 300, activeDays: 21 },
  { name: 'diamond', emoji: '💎', min: 750, activeDays: 21 },
  { name: 'amethyst', emoji: '💜', min: 1500, activeDays: 14 },
  { name: 'emerald', emoji: '💚', min: 3000, activeDays: 14 },
  { name: 'GOD', emoji: '👑', min: 7500, activeDays: 7 }
];
const RANK_NAMES = RANKS.map(r => r.name);
function loadActivity() { try { for (const [id, stats] of Object.entries(JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')))) activity.set(id, stats); } catch {} }
function saveActivity() { try { fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(Object.fromEntries(activity))); } catch {} }
function rankFor(stats) {
  if (!stats) return null;
  const days = (Date.now() - (stats.last || 0)) / 86400000;
  let best = null;
  for (const rank of RANKS) if (stats.count >= rank.min && days <= rank.activeDays) best = rank;
  return best;
}
function cleanRankNick(name) {
  let clean = String(name || '').trim();
  for (const rank of RANKS) if (clean.startsWith(rank.emoji + ' ')) clean = clean.slice(rank.emoji.length + 1).trim();
  return clean;
}
async function syncRank(member) {
  if (!member || member.user.bot) return;
  const target = rankFor(activity.get(member.id));
  for (const name of RANK_NAMES) {
    const role = member.guild.roles.cache.find(r => r.name === name);
    if (!role) continue;
    const has = member.roles.cache.has(role.id);
    if (name === (target && target.name) && !has) await member.roles.add(role).catch(() => {});
    if (name !== (target && target.name) && has) await member.roles.remove(role).catch(() => {});
  }
  if (isStaff(member)) return;
  const base = cleanRankNick(robloxLinks.get(member.id) || member.nickname || member.user.username);
  const next = (target ? target.emoji + ' ' + base : base).slice(0, 32);
  if ((member.nickname || '') !== next) await member.setNickname(next).catch(() => {});
}
async function refreshInactiveRanks() {
  for (const guild of client.guilds.cache.values()) {
    for (const [id, stats] of activity) {
      if (Date.now() - stats.last < 7 * 86400000) continue;
      const member = await guild.members.fetch(id).catch(() => null);
      if (member) await syncRank(member);
    }
  }
}
const boostCounts = new Map();
const BOOST_FILE = './boosts.json';
const boostBoards = new Map();
function loadBoosts() { try { for (const [id, n] of Object.entries(JSON.parse(fs.readFileSync(BOOST_FILE, 'utf8')))) boostCounts.set(id, n); } catch {} }
function saveBoosts() { try { fs.writeFileSync(BOOST_FILE, JSON.stringify(Object.fromEntries(boostCounts))); } catch {} }
function boostChannel(guild) { return guild.channels.cache.find(c => c.isTextBased() && (c.name.includes('boosts') || c.name.includes('🔥'))); }
function boostBar(n) { const filled = Math.max(0, Math.min(10, n)); return '🔥'.repeat(filled) + '▫️'.repeat(10 - filled); }
function boostEmbed(member, frame, total, personal, tier) {
  return new EmbedBuilder().setColor(0xF47FFF).setTitle(frame + ' Server boost').setDescription('<@' + member.id + '> thank you for boosting the server!\n\n' + boostBar(personal)).addFields({ name: 'Your boosts', value: String(personal), inline: true }, { name: 'Server boosts', value: String(total), inline: true }, { name: 'Level', value: 'Tier ' + tier, inline: true }).setTimestamp();
}
async function thankBoost(member) {
  const channel = boostChannel(member.guild);
  if (!channel) return;
  await member.guild.fetch().catch(() => {});
  const total = member.guild.premiumSubscriptionCount || 0;
  const tier = member.guild.premiumTier || 0;
  const personal = (boostCounts.get(member.id) || 0) + 1;
  boostCounts.set(member.id, personal);
  saveBoosts();
  const frames = ['🔥', '✨', '🔥', '🎉', '🔥'];
  const message = await channel.send({ content: '<@' + member.id + '>', embeds: [boostEmbed(member, frames[0], Math.max(1, total - 1), personal, tier)] }).catch(() => null);
  if (!message) return;
  for (let i = 1; i < frames.length; i++) {
    await new Promise(r => setTimeout(r, 800));
    await message.edit({ embeds: [boostEmbed(member, frames[i], total, personal, tier)] }).catch(() => {});
  }
  await updateBoostBoard(member.guild);
}
async function updateBoostBoard(guild) {
  const channel = boostChannel(guild);
  if (!channel) return;
  await guild.fetch().catch(() => {});
  const total = guild.premiumSubscriptionCount || 0;
  const tier = guild.premiumTier || 0;
  const lines = [...boostCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n], i) => (i + 1) + '. <@' + id + '> — ' + n + ' boost' + (n === 1 ? '' : 's')).join('\n') || 'No boosts tracked yet.';
  const embed = new EmbedBuilder().setColor(0xF47FFF).setTitle('🔥 Boosts').setDescription(boostBar(Math.min(10, total)) + '\n\n**' + total + '** boosts · Tier **' + tier + '**\n\n' + lines).setTimestamp();
  let message = boostBoards.get(guild.id);
  if (message) message = await message.fetch().catch(() => null);
  if (!message) {
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    message = messages && messages.find(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].title === '🔥 Boosts');
  }
  if (message) message = await message.edit({ embeds: [embed] }).catch(() => null);
  else message = await channel.send({ embeds: [embed] }).catch(() => null);
  if (message) boostBoards.set(guild.id, message);
}
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
async function isVerifiedUser(userId) { if (verifiedUsers.has(userId)) return true; for (const guild of client.guilds.cache.values()) { const member = await guild.members.fetch(userId).catch(() => null); const role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE); if (member && role && member.roles.cache.has(role.id)) { verifiedUsers.add(userId); return true; } } return false; }
async function askAi(userId, text) { if (!AI_API_KEY) return 'AI chat is not set up yet.'; const history = aiHistory.get(userId) || []; history.push({ role: 'user', content: String(text || '').slice(0, 500) }); const trimmed = history.slice(-8); const chosen = langName(userLang.get(userId)); const res = await fetch(AI_BASE_URL + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_API_KEY, 'HTTP-Referer': 'https://mdcforlegal.github.io/MDC-VERIFY/', 'X-Title': 'MDC Bot' }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 300, messages: [{ role: 'system', content: 'You are MDC Bot, a friendly Discord assistant. Reply in ' + (chosen || 'the same language the user used') + '. Keep it short and appropriate for all ages. Do not discuss sexual content, violence, or illegal activity.' }, ...trimmed] }) }); if (!res.ok) return 'I could not answer right now. Try again in a moment.'; const data = await res.json(); const safe = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'I do not have an answer.').slice(0, 1700); trimmed.push({ role: 'assistant', content: safe }); aiHistory.set(userId, trimmed.slice(-8)); return safe; }
async function lookupRoblox(input) {
  const query = input.trim();
  const opts = { signal: AbortSignal.timeout(8000) };
  const byUsername = await fetch('https://users.roblox.com/v1/usernames/users', { ...opts, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [query], excludeBannedUsers: true }) });
  if (byUsername.ok) { const data = await byUsername.json(); if (data.data && data.data.length) return data.data[0]; }
  const search = await fetch('https://users.roblox.com/v1/users/search?keyword=' + encodeURIComponent(query) + '&limit=10', opts);
  if (!search.ok) throw new Error('Roblox API failed');
  const found = await search.json();
  const lowered = query.toLowerCase();
  return (found.data || []).find(u => (u.displayName || '').toLowerCase() === lowered || (u.name || '').toLowerCase() === lowered) || null;
}
async function bhGet(path) { const res = await fetch('https://bot-hosting.net/api/v1' + path, { headers: { Authorization: 'Bearer ' + BH_API_KEY } }); if (!res.ok) throw new Error('Bot-Hosting API ' + res.status); return res.json(); }
function firstDate(values) { for (const value of values) { if (!value) continue; const time = new Date(value).getTime(); if (!Number.isNaN(time)) return time; } return null; }
async function hostingInfo() { if (!BH_API_KEY) throw new Error('BH_API_KEY is missing.'); const listed = await bhGet('/deployments'); const deployments = listed.deployments || listed.items || listed.data || []; const deployment = deployments.find(d => d.id === BH_DEPLOYMENT_ID) || deployments[0]; if (!deployment) throw new Error('No deployment found.'); const [account, resources] = await Promise.all([bhGet('/account').catch(() => null), bhGet('/deployments/' + deployment.id + '/resources').catch(() => null)]); return { deployment, account, resources, renewAt: firstDate([BH_RENEW_AT, account && account.plan && (account.plan.renewsAt || account.plan.expiresAt || account.plan.periodEnd), deployment.renewsAt, deployment.expiresAt]) }; }
function hostingEmbed(info) { const d = info.deployment; const r = info.resources || {}; const plan = info.account && info.account.plan; const renew = info.renewAt ? '<t:' + Math.floor(info.renewAt / 1000) + ':R>' : 'Set BH_RENEW_AT.'; return new EmbedBuilder().setColor(0x57F287).setTitle('Bot-Hosting status').addFields({ name: 'Server', value: d.name || d.id, inline: true }, { name: 'State', value: r.state || d.state || 'unknown', inline: true }, { name: 'Plan', value: plan ? (plan.name || plan.tier || 'unknown') : 'unknown', inline: true }, { name: 'CPU', value: r.cpu ? Math.round(r.cpu.usedPercent || 0) + '%' : 'unknown', inline: true }, { name: 'RAM', value: r.memory ? mb(r.memory.usedBytes) + ' / ' + mb(r.memory.limitBytes) : 'unknown', inline: true }, { name: 'Renew', value: renew, inline: true }).setTimestamp(); }
async function checkRenewWarning() { if (!BH_API_KEY) return; const info = await hostingInfo(); if (!info.renewAt) return; const left = info.renewAt - Date.now(); if (left <= 0 || left > 24 * 60 * 60 * 1000 || warnedRenew.has(String(info.renewAt))) return; warnedRenew.add(String(info.renewAt)); await sendToConsole({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('Renew warning').setDescription('Bot-Hosting renew time is in under 1 day. Renew the free plan before it expires.').addFields({ name: 'Renew', value: '<t:' + Math.floor(info.renewAt / 1000) + ':R>' }).setTimestamp()] }); }
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
const statusMessages = new Map();
async function updateStatusBoard() {
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.isTextBased() && (c.name.includes('bot_status') || c.name.includes('bot-status')));
    if (!channel) continue;
    let message = statusMessages.get(guild.id);
    if (message) message = await message.fetch().catch(() => null);
    if (!message) {
      const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      message = messages && messages.find(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].title === 'MDC Bot Status');
    }
    if (message) message = await message.edit({ embeds: [statusEmbed()] }).catch(() => null);
    else message = await channel.send({ embeds: [statusEmbed()] }).catch(() => null);
    if (message) statusMessages.set(guild.id, message);
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
function rulesEmbed() {
  return new EmbedBuilder().setColor(0xED4245).setTitle('Server rules').setDescription('These things are not allowed on this server.\n\n1. No swearing or toxic language.\n2. No spam, flooding, or repeated messages.\n3. No advertising, invites, or random links.\n4. No NSFW or adult content.\n5. No harassment, bullying, or threats.\n6. No scams, phishing, or malware.\n7. No sharing private information.\n8. Respect staff and follow Discord Terms of Service.\n\nBreaking the rules can lead to a mute, kick, or ban. Swearing mutes get longer every time.').setTimestamp();
}
function findRulesChannel(guild) {
  const names = [...guild.channels.cache.values()].filter(c => c.isTextBased()).map(c => c.name);
  const channel = guild.channels.cache.find(c => c.isTextBased() && ['rules', 'rule', 'kurallar', 'yasak', '❌', '✖', '❎'].some(k => c.name.toLowerCase().includes(k)));
  if (!channel) console.log('Rules channel not found. Text channels:', names.join(', ') || 'none');
  return channel;
}
async function ensureRulesPanel(force) {
  for (const guild of client.guilds.cache.values()) {
    const channel = findRulesChannel(guild);
    if (!channel) continue;
    if (!force) {
      const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
      if (messages && messages.some(m => m.author.id === client.user.id && m.embeds[0] && m.embeds[0].title === 'Server rules')) {
        console.log('Rules already posted in ' + channel.name);
        continue;
      }
    }
    const sent = await channel.send({ embeds: [rulesEmbed()] }).catch((err) => { console.error('Rules panel failed in ' + channel.name + ':', err.message); return null; });
    if (sent) console.log('Rules posted in ' + channel.name);
  }
}
function verifyDmRow() { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_verify_dm').setLabel('Close').setStyle(ButtonStyle.Secondary)); }
const VERIFY_DM = 'Thanks for joining the MDC Discord server.\n\nYour account is now verified. Read the rules, then jump into the channels.\n\nYou can also message me in this DM and I will reply.\n\nPress Close to remove this message. If you leave it, it will be deleted in 15 minutes.';
const commands = [new SlashCommandBuilder().setName('rank').setDescription('Show your message count and rank'), new SlashCommandBuilder().setName('status').setDescription('Show the bot status'), new SlashCommandBuilder().setName('hostingstatus').setDescription('Staff: show Bot-Hosting server status'), new SlashCommandBuilder().setName('testlogs').setDescription('Staff test: send a log to the console channel'), new SlashCommandBuilder().setName('testverify').setDescription('Staff test: send the verify DM without verifying'), new SlashCommandBuilder().setName('teststatus').setDescription('Staff test: send the status report now'), new SlashCommandBuilder().setName('testai').setDescription('Staff test: check the AI reply'), new SlashCommandBuilder().setName('testrank').setDescription('Staff test: preview a rank role and emoji').addStringOption(o => o.setName('rank').setDescription('Rank name').setRequired(true).addChoices(...['silver','iron','gold','diamond','amethyst','emerald','GOD'].map(n => ({ name: n, value: n })))).addUserOption(o => o.setName('user').setDescription('Member to preview')), new SlashCommandBuilder().setName('testboost').setDescription('Staff test: play the boost thank animation').addUserOption(o => o.setName('user').setDescription('Member to thank')), new SlashCommandBuilder().setName('postrules').setDescription('Staff: post the rules message now'), new SlashCommandBuilder().setName('postroblox').setDescription('Staff: post the Roblox link buttons'), new SlashCommandBuilder().setName('testboostboard').setDescription('Staff test: refresh the boost board'), new SlashCommandBuilder().setName('testroblox').setDescription('Staff test: look up a Roblox name without linking').addStringOption(o => o.setName('username').setDescription('Roblox display name').setRequired(true)), new SlashCommandBuilder().setName('linkroblox').setDescription('Link a real Roblox account').addStringOption(o => o.setName('username').setDescription('Your Roblox display name').setRequired(true)), new SlashCommandBuilder().setName('unlinkroblox').setDescription('Unlink your Roblox account'), new SlashCommandBuilder().setName('roblox').setDescription('Check linked Roblox account of a user').addUserOption(o => o.setName('user').setDescription('The user to check').setRequired(false)), new SlashCommandBuilder().setName('ban').setDescription('Ban a member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Ban reason').setRequired(true)), new SlashCommandBuilder().setName('kick').setDescription('Kick a member').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Kick reason').setRequired(true)), new SlashCommandBuilder().setName('mute').setDescription('Timeout a member').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Mute reason').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Timeout minutes (default 60)').setMinValue(1).setMaxValue(40320)), new SlashCommandBuilder().setName('unmute').setDescription('Remove a timeout').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true)), new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o => o.setName('userid').setDescription('User ID to unban').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Unban reason').setRequired(false))].map(cmd => cmd.toJSON());
client.on('warn', (info) => console.log('[warn]', info));
client.on('error', (err) => console.error('[client error]', err));
client.on('shardError', (err) => console.error('[shard error]', err));

const VERIFY_SITE = 'https://mdcforlegal.github.io/MDC-VERIFY/';
const VERIFY_CHANNEL_ID = '1514648556835963104';
async function ensureVerifyPanel() {
  for (const guild of client.guilds.cache.values()) {
    const wrong = guild.channels.cache.filter(c => c.isTextBased() && c.name.toLowerCase().includes('verify') && c.id !== VERIFY_CHANNEL_ID);
    for (const channel of wrong.values()) {
      const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      const old = messages && messages.find(m => m.author.id === client.user.id && m.content.includes('Verify your account'));
      if (old) await old.delete().catch(() => {});
    }
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const existing = messages && messages.find(m => m.author.id === client.user.id && m.content.includes('Verify your account'));
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Verify').setStyle(ButtonStyle.Link).setURL(VERIFY_SITE));
    const payload = { content: '**Verify your account**\n\nPress the button to open the verify site.\nConnect your Discord account there. The bot will check your account, then you will be verified.', components: [row] };
    if (existing) await existing.edit(payload).catch(() => {});
    else await channel.send(payload).catch(() => {});
  }
}

const ROBLOX_CHANNEL_ID = '1516453342161670284';
function robloxPanelPayload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('link_roblox').setLabel('Link Roblox').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('unlink_roblox').setLabel('Unlink Roblox').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('check_roblox').setLabel('Check Roblox').setStyle(ButtonStyle.Primary)
  );
  return { content: '**Link your Roblox account**\n\nUse the buttons below.\nLink asks for your Roblox name. Check shows your verified account.', components: [row] };
}
async function ensureRobloxPanel() {
  const channel = await client.channels.fetch(ROBLOX_CHANNEL_ID).catch((err) => { console.error('Roblox channel fetch failed:', err && err.message ? err.message : err); return null; });
  if (!channel) return console.error('Roblox channel not found: ' + ROBLOX_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = messages && messages.find(m => m.author.id === client.user.id && m.content.includes('Link your Roblox account'));
  const payload = robloxPanelPayload();
  try {
    if (existing) await existing.edit(payload);
    else await channel.send(payload);
    console.log('Roblox panel posted in ' + channel.id);
  } catch (err) {
    console.error('Roblox panel failed:', err && err.message ? err.message : err);
  }
}
client.once('clientReady', async () => {
  console.log('Logged in as ' + client.user.tag);
  console.log(AI_API_KEY ? 'AI chat enabled.' : 'AI chat disabled. AI_API_KEY is missing.');
  loadLang();
  loadActivity();
  loadBoosts();
  loadSwear();
  await ensureVoicePanel();
  await ensureVerifyPanel();
  await ensureRobloxPanel();
  setTimeout(() => ensureRobloxPanel().catch((err) => console.error('Roblox panel retry failed:', err.message)), 15000);
  await ensureLanguagePanel();
  setInterval(() => checkVoiceRooms().catch((err) => console.error('Voice check failed:', err.message)), 60 * 1000);
  await updateStatusBoard();
  setInterval(() => updateStatusBoard().catch((err) => console.error('Status board failed:', err.message)), 60 * 1000);
  setInterval(() => checkRenewWarning().catch((err) => console.error('Renew check failed:', err.message)), 5 * 60 * 1000);
  setInterval(() => { saveActivity(); refreshInactiveRanks().catch((err) => console.error('Rank refresh failed:', err.message)); }, 30 * 60 * 1000);
  for (const guild of client.guilds.cache.values()) await updateBoostBoard(guild).catch(() => {});
  setInterval(() => { for (const guild of client.guilds.cache.values()) updateBoostBoard(guild).catch(() => {}); }, 10 * 60 * 1000);
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
  if (interaction.isButton() && interaction.customId === 'link_roblox') {
    const modal = new ModalBuilder().setCustomId('link_roblox_modal').setTitle('Link Roblox').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('username').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)));
    return interaction.showModal(modal);
  }
  if (interaction.isButton() && interaction.customId === 'check_roblox') {
    const linked = robloxLinks.get(interaction.user.id);
    return interaction.reply({ content: linked ? 'Your verified Roblox account is **' + linked + '**.' : 'You do not have a verified Roblox account.', ephemeral: true });
  }
  if (interaction.isButton() && interaction.customId === 'unlink_roblox') {
    if (!robloxLinks.has(interaction.user.id)) return interaction.reply({ content: 'You do not have a Roblox account linked.', ephemeral: true });
    const oldName = robloxLinks.get(interaction.user.id);
    robloxLinks.delete(interaction.user.id);
    const role = interaction.guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
    if (role) await interaction.member.roles.remove(role).catch(() => {});
    if (!isStaff(interaction.member)) await interaction.member.setNickname(null).catch(() => {});
    await syncRank(interaction.member);
    return interaction.reply({ content: 'Unlinked Roblox account: **' + oldName + '**', ephemeral: true });
  }
  if (interaction.isModalSubmit() && interaction.customId === 'link_roblox_modal') {
    const username = interaction.fields.getTextInputValue('username').trim();
    if (robloxLinks.has(interaction.user.id)) return interaction.reply({ content: 'You already have a Roblox account linked. Unlink first.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const roblox = await lookupRoblox(username);
      if (!roblox) return interaction.editReply('That Roblox account name was not found.');
      const shown = roblox.displayName || roblox.name;
      robloxLinks.set(interaction.user.id, shown);
      const role = interaction.guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE);
      if (role) await interaction.member.roles.add(role).catch(() => {});
      let nickNote = '';
      if (isStaff(interaction.member)) nickNote = ' Staff nickname was left unchanged.';
      else { try { await interaction.member.setNickname(shown.slice(0, 32)); } catch { nickNote = ' Nickname was not changed.'; } }
      syncRank(interaction.member).catch(() => {});
      sendLog(new EmbedBuilder().setColor(0x5865F2).setTitle('Roblox Account Linked').setDescription(interaction.user + ' linked **' + shown + '**').setTimestamp()).catch(() => {});
      return interaction.editReply('Linked Roblox account **' + shown + '**.' + nickNote);
    } catch (err) {
      console.error('Link Roblox failed:', err && err.message ? err.message : err);
      return interaction.editReply('Roblox did not answer in time. Try again.');
    }
  }
  if (interaction.isModalSubmit() && interaction.customId === 'check_roblox_modal') {
    const username = interaction.fields.getTextInputValue('username').trim();
    if (!username) {
      const linked = robloxLinks.get(interaction.user.id);
      return interaction.reply({ content: linked ? 'Your linked Roblox account is **' + linked + '**.' : 'You do not have a Roblox account linked.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    let roblox; try { roblox = await lookupRoblox(username); } catch { return interaction.editReply('Could not reach Roblox. Try again.'); }
    if (!roblox) return interaction.editReply('That Roblox account name was not found.');
    return interaction.editReply('Found Roblox account **' + (roblox.displayName || roblox.name) + '**.');
  }
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
  if (commandName === 'rank') {
    const stats = activity.get(user.id) || { count: 0, last: 0 };
    const current = rankFor(stats);
    const next = RANKS.find(r => r.min > stats.count);
    return interaction.reply({ content: 'Messages: **' + stats.count + '**\nRank: **' + (current ? current.name : 'none') + '**' + (next ? '\nNext: **' + next.name + '** at ' + next.min + ' messages' : ''), ephemeral: true });
  }
  if (commandName === 'status') return interaction.reply({ embeds: [statusEmbed()] });
  async function sendLog(embed) { const channel = guild.channels.cache.find(c => c.name === CONSOLE_CHANNEL_NAME || c.name.includes('console')); if (channel) await channel.send({ embeds: [embed] }).catch(() => {}); }
  async function protectedTarget(targetUser) { if (!targetUser || targetUser.id === client.user.id || targetUser.bot) return true; return isProtected(await guild.members.fetch(targetUser.id).catch(() => null)); }
  if (commandName === 'hostingstatus') { if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true }); await interaction.deferReply({ ephemeral: true }); try { return interaction.editReply({ embeds: [hostingEmbed(await hostingInfo())] }); } catch (err) { return interaction.editReply('Could not read Bot-Hosting: ' + err.message); } }
  if (STAFF_TESTS.includes(commandName)) {
    if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true });
    if (commandName === 'testlogs') { await sendLog(new EmbedBuilder().setColor(0xFEE75C).setTitle('Test log').setDescription(user + ' sent a test log.').setTimestamp()); return interaction.reply({ content: 'Test log sent to the console channel.', ephemeral: true }); }
    if (commandName === 'testverify') { try { const dm = await user.send({ content: '[TEST]\n\n' + VERIFY_DM, components: [verifyDmRow()] }); setTimeout(() => dm.delete().catch(() => {}), DM_CLOSE_MS); return interaction.reply({ content: 'Test verify DM sent. No role was given.', ephemeral: true }); } catch { return interaction.reply({ content: 'Could not send the test DM.', ephemeral: true }); } }
    if (commandName === 'teststatus') { await updateStatusBoard(); return interaction.reply({ content: 'Status board updated.', ephemeral: true }); }
    if (commandName === 'testai') { await interaction.deferReply({ ephemeral: true }); return interaction.editReply(await askAi(user.id, 'Reply with: MDC AI test ok.')); }
    if (commandName === 'testrank') {
      const rankName = options.getString('rank');
      const targetUser = options.getUser('user') || user;
      const target = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) return interaction.reply({ content: 'Member not found.', ephemeral: true });
      const rank = RANKS.find(r => r.name === rankName);
      const oldStats = activity.get(target.id);
      activity.set(target.id, { count: rank.min, last: Date.now() });
      await syncRank(target);
      setTimeout(async () => {
        if (oldStats) activity.set(target.id, oldStats); else activity.delete(target.id);
        const fresh = await guild.members.fetch(target.id).catch(() => null);
        if (fresh) await syncRank(fresh);
      }, 20000);
      return interaction.reply({ content: 'Previewing **' + rank.emoji + ' ' + rank.name + '** on ' + targetUser + ' for 20 seconds. No permanent change.', ephemeral: true });
    }
    if (commandName === 'testboost') {
      const targetUser = options.getUser('user') || user;
      const target = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!target) return interaction.reply({ content: 'Member not found.', ephemeral: true });
      const channel = boostChannel(guild);
      if (!channel) return interaction.reply({ content: 'Boosts channel not found.', ephemeral: true });
      const total = guild.premiumSubscriptionCount || 0;
      const tier = guild.premiumTier || 0;
      const frames = ['🔥', '✨', '🔥', '🎉', '🔥'];
      const message = await channel.send({ content: '[TEST] <@' + target.id + '>', embeds: [boostEmbed(target, frames[0], total, 1, tier)] }).catch(() => null);
      if (!message) return interaction.reply({ content: 'Could not post the test boost.', ephemeral: true });
      for (let i = 1; i < frames.length; i++) { await new Promise(r => setTimeout(r, 800)); await message.edit({ embeds: [boostEmbed(target, frames[i], total, 1, tier)] }).catch(() => {}); }
      return interaction.reply({ content: 'Test boost animation posted. No boost was counted.', ephemeral: true });
    }
    if (commandName === 'testboostboard') { await updateBoostBoard(guild); return interaction.reply({ content: 'Boost board refreshed.', ephemeral: true }); }
    if (commandName === 'postrules') { const sent = await interaction.channel.send({ embeds: [rulesEmbed()] }).catch(() => null); return interaction.reply({ content: sent ? 'Rules posted in this channel.' : 'Could not post here. Check bot permissions.', ephemeral: true }); }
    if (commandName === 'postroblox') { if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true }); await ensureRobloxPanel(); return interaction.reply({ content: 'Roblox buttons posted.', ephemeral: true }); }
    if (commandName === 'testroblox') { await interaction.deferReply({ ephemeral: true }); try { const roblox = await lookupRoblox(options.getString('username')); if (!roblox) return interaction.editReply('Not found. No account was linked.'); return interaction.editReply('Found **' + (roblox.displayName || roblox.name) + '**. No account was linked.'); } catch { return interaction.editReply('Roblox lookup failed.'); } }
  }
  if (commandName === 'linkroblox') { if (robloxLinks.has(user.id)) return interaction.reply({ content: 'You already have a Roblox account linked. Use /unlinkroblox first.', ephemeral: true }); await interaction.deferReply({ ephemeral: true }); let roblox; try { roblox = await lookupRoblox(options.getString('username').trim()); } catch { return interaction.editReply('Could not reach Roblox. Try again.'); } if (!roblox) return interaction.editReply('That Roblox account name was not found.'); const shown = roblox.displayName || roblox.name; robloxLinks.set(user.id, shown); const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE); if (role) await member.roles.add(role).catch(() => {}); let nickNote = ''; if (isStaff(member)) nickNote = ' Staff nickname was left unchanged.'; else { try { await member.setNickname(shown.slice(0, 32)); } catch { nickNote = ' Nickname was not changed.'; } } await syncRank(member); await interaction.editReply('Linked Roblox account **' + shown + '**.' + nickNote); await sendLog(new EmbedBuilder().setColor(0x5865F2).setTitle('Roblox Account Linked').setDescription(user + ' linked **' + shown + '**').setTimestamp()); return; }
  if (commandName === 'unlinkroblox') { if (!robloxLinks.has(user.id)) return interaction.reply({ content: 'You do not have a Roblox account linked.', ephemeral: true }); const oldName = robloxLinks.get(user.id); robloxLinks.delete(user.id); const role = guild.roles.cache.find(r => r.name === ROBLOX_VERIFIED_ROLE); if (role) await member.roles.remove(role).catch(() => {}); if (!isStaff(member)) await member.setNickname(null).catch(() => {}); await syncRank(member); return interaction.reply({ content: 'Unlinked Roblox account: **' + oldName + '**', ephemeral: true }); }
  if (commandName === 'roblox') { const target = options.getUser('user') || user; const linked = robloxLinks.get(target.id); if (!linked) return interaction.reply({ content: target + ' has no Roblox account linked.', ephemeral: true }); return interaction.reply({ content: '**' + target.username + '** is linked to Roblox: **' + linked + '**', ephemeral: true }); }
  if (['ban', 'kick', 'mute', 'unmute'].includes(commandName)) { if (!isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true }); if (await protectedTarget(options.getUser('user'))) { await sendLog(new EmbedBuilder().setColor(0xED4245).setTitle('Blocked moderation').setDescription(user + ' tried to ' + commandName + ' a protected member.').setTimestamp()); return interaction.reply({ content: 'This member is protected. Action refused.', ephemeral: true }); } }
  if (commandName === 'unban' && !isStaff(member)) return interaction.reply({ content: 'Only Owner and Moderator can use this command.', ephemeral: true });
  if (commandName === 'ban') { const target = options.getUser('user'); const reason = options.getString('reason'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.bannable) return interaction.reply({ content: 'I cannot ban that user. Check role order.', ephemeral: true }); await targetMember.ban({ reason: user.tag + ': ' + reason }); await interaction.reply({ content: 'Banned **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xED4245).setTitle('User Banned').setDescription(user + ' banned ' + target.tag + '\nReason: ' + reason).setTimestamp()); return; }
  if (commandName === 'kick') { const target = options.getUser('user'); const reason = options.getString('reason'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.kickable) return interaction.reply({ content: 'I cannot kick that user. Check role order.', ephemeral: true }); await targetMember.kick(user.tag + ': ' + reason); await interaction.reply({ content: 'Kicked **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xFEE75C).setTitle('User Kicked').setDescription(user + ' kicked ' + target.tag + '\nReason: ' + reason).setTimestamp()); return; }
  if (commandName === 'mute') { const target = options.getUser('user'); const reason = options.getString('reason'); const minutes = options.getInteger('minutes') || 60; const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); if (!targetMember.moderatable) return interaction.reply({ content: 'I cannot mute that user. Check role order.', ephemeral: true }); await targetMember.timeout(minutes * 60 * 1000, user.tag + ': ' + reason); await interaction.reply({ content: 'Muted **' + target.tag + '** for ' + minutes + ' minutes.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0xF1C40F).setTitle('User Muted').setDescription(user + ' muted ' + target.tag).setTimestamp()); return; }
  if (commandName === 'unmute') { const target = options.getUser('user'); const targetMember = await guild.members.fetch(target.id).catch(() => null); if (!targetMember) return interaction.reply({ content: 'That user is not in this server.', ephemeral: true }); await targetMember.timeout(null); await interaction.reply({ content: 'Unmuted **' + target.tag + '**.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unmuted').setDescription(user + ' unmuted ' + target.tag).setTimestamp()); return; }
  if (commandName === 'unban') { const userId = options.getString('userid').trim(); const reason = options.getString('reason') || 'No reason'; if (!/^\d{17,20}$/.test(userId)) return interaction.reply({ content: 'Enter a valid user ID.', ephemeral: true }); if (userId === client.user.id) return interaction.reply({ content: 'This member is protected. Action refused.', ephemeral: true }); await guild.members.unban(userId, user.tag + ': ' + reason); await interaction.reply({ content: 'Unbanned <@' + userId + '>.', ephemeral: true }); await sendLog(new EmbedBuilder().setColor(0x57F287).setTitle('User Unbanned').setDescription(user + ' unbanned ' + userId).setTimestamp()); }
});
client.on('guildMemberAdd', async member => {
  if (member.user.bot) return;
  const role = member.guild.roles.cache.find(r => r.name === UNVERIFIED_ROLE);
  if (!role) return;
  await member.roles.add(role).catch((err) => console.error('Unverified role failed:', err.message));
});
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (!oldMember.premiumSince && newMember.premiumSince) await thankBoost(newMember).catch((err) => console.error('Boost thanks failed:', err.message));
});
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.guild) {
    const stats = activity.get(message.author.id) || { count: 0, last: 0 };
    stats.count += 1;
    stats.last = Date.now();
    activity.set(message.author.id, stats);
    if (stats.count % 10 === 0) saveActivity();
    if (message.member) await syncRank(message.member);
  }
  if (message.guild && message.mentions.has(client.user)) {
    const question = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!(isStaff(message.member) || await isVerifiedUser(message.author.id))) return message.reply(CHANNEL_AI_NOTE + '\nVerify before chatting with me.').catch(() => {});
    if (!question) return message.reply(CHANNEL_AI_NOTE + '\nAdd a question after the mention.').catch(() => {});
    try { await message.channel.sendTyping(); await message.reply(CHANNEL_AI_NOTE + '\n' + await askAi(message.author.id, question)); } catch { await message.reply('I could not answer right now.').catch(() => {}); }
    return;
  }
  if (!message.guild) { if (!(await isVerifiedUser(message.author.id))) return message.reply('Verify in the server before chatting with me.').catch(() => {}); try { await message.channel.sendTyping(); await message.reply(await askAi(message.author.id, message.content || '')); } catch { await message.reply('I could not answer right now.').catch(() => {}); } return; }
  if (!message.member || isProtected(message.member)) return;
  if (hasSwear(message.content)) {
    const times = (swearMutes.get(message.author.id) || 0) + 1;
    swearMutes.set(message.author.id, times);
    saveSwear();
    const minutes = SWEAR_MINUTES[Math.min(times - 1, SWEAR_MINUTES.length - 1)];
    await message.delete().catch(() => {});
    if (message.member.moderatable) await message.member.timeout(minutes * 60 * 1000, 'Swearing #' + times).catch(() => {});
    await message.channel.send(message.author + ', do not swear. You are muted for **' + minutes + ' minutes**. Next time will be longer.').catch(() => {});
    await sendToConsole({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('Swear mute').setDescription(message.author + ' muted for ' + minutes + ' minutes. Offense #' + times + '.').setTimestamp()] });
    return;
  }
  const content = message.content.toLowerCase();
  if (!['http://', 'https://', 'discord.gg', 'discord.com/invite'].some(w => content.includes(w))) return;
  const count = warnings.get(message.author.id) || 0;
  if (count === 0) { warnings.set(message.author.id, 1); await message.delete().catch(() => {}); await message.channel.send(message.author + ', First Warning: Do not post links. Next time you will be banned.').catch(() => {}); } else { await message.delete().catch(() => {}); await message.member.ban({ reason: 'Repeated link/spam violation' }).catch(() => {}); }
});
function publicStats() {
  const mem = process.memoryUsage();
  return {
    name: client.isReady() ? client.user.tag : 'MDC Bot',
    status: client.isReady() ? 'Online' : 'Starting',
    ping: client.isReady() ? Math.round(client.ws.ping) : null,
    uptime: formatUptime(Date.now() - startedAt),
    servers: client.guilds.cache.size,
    ai: AI_API_KEY ? 'Enabled' : 'Disabled',
    model: AI_MODEL,
    ram: mb(mem.rss),
    updated: new Date().toISOString()
  };
}
const ICON_192 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAAElElEQVR4nO3dO1IbQRSF4cblLVCETshYATGRCYi8Ea/EGyEiwBExmyDxThwMpZrSg5ru0z1z5t7/i/yUprp/3RlJCK6ub+4K0Orb1geAfSMgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICJLvo+/g4el99F3ga28v9+Nu/GrEm6lEY6t7TJ0DIp1d6JhRt4AupfP6fNvl9tHs8dfH2T/vklGfgE7roRtDpyXpDakBHaVDN7twVJKSkfQ0nnp26minlCvX9gk0v1fS2an5KGqbQ40TiHpimO9d2xxqCYh6IhEbkq6BqCcGZR+rAzpESj2RHHazdgjVBcQLzRlU7XLjKYzxE0/bnlYExMkrvIYTGV8PBMnSgLj6yWbhjldPIM5fsdXuL6cwSAgIkkUB8fwrlarnYkwgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICBICgoSAICEgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICBICgmT4z8rYo5//fl/6q78//qx5JP4I6NMX0Vz6Z8RUCKgsTufSf0yeUeqAmtM5vZG0GeW9iO5Sz6Bb25GME2jQZuccRekm0OhRkW0U5Qpond1N1VCigNbc1zwNZQlo/R1N0lCWgDBIioC2GgYZhlD8gLbdxfANxQ8IQwUPyGEAOBzDOMEDwmiRA/J56PscSXeRA8IKCAgSAoIkbEBulx1ux9NL2ICwDgKChIAgISBICAgSAoKEgCAhIEjCBuT2+Sy34+klbEBYBwFBQkCQRA7I57LD50i6ixwQVhA8IIeHvsMxjBM8IIwWP6BtB0Ds8VMyBFS228Xw9ZQkAWGcLAGtPwwyjJ+SJ6Cy7o4mqaekCqista956inZAirjdzdVPSXnt/md9rj7B7WypTNJN4EO+u53znpKzgl00GUUpU1nkjqgSXNGydOZENCneQ38vLDlCOgMKlku70U0uiAgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICBICgoSAICEgSAgIEgKChIAgISBICAgSAoKEgCAhIEisP9bz+Otj60Nw8fp8u/UhnOc7gahnznY1TAOyXa8Nea6JY0CeK+XAcGXsAjJcIytu62MXEPaFgCAhIEgICBK7gGxfMTPhtj52ARW/NfJhuDKOARXLldqc55qYBlRc12srtqth/Waq7arhwHcCYRcICBICgoSAICEgSAgIEgKChIAgISBICAgSAoKEgCAhIEgICBICgoSAICEgSAgIEgKCZFFAby/30y/cPtmPEQ67fNj3LzCBICEgSKoD4iwWW+3+Lg1oyekQkSzccU5hkFQExHOx8Kqef00aJxANxdO2p3UBcSWUQdUuV08gTmQhNZy8JtJFNA3FoOxjS0DzSGlo7+Y72HCJ0jiBaCgGsZ5SytX1zV3z3T88vc9/y/eD2pGjh33z0yPpGujoXhlFe9GrniJOoIOjUVSYRpZOH+H66zJ9AirnGppQ0uYunRm6vKrXLaDJpYxgpeMLwp0DmpCRre7vJQwJaI6YNjf0DajhASE2vh4IEgKChIAgISBICAgSAoKEgCAhIEgICBICguQ/xs4pSfqIkKQAAAAASUVORK5CYII=', 'base64');
const ICON_512 = Buffer.from('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', 'base64');
const MANIFEST = JSON.stringify({
  name: 'MDC Bot Status',
  short_name: 'MDC Status',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0e1116',
  theme_color: '#15172b',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
});
const SW = "self.addEventListener('install', e => self.skipWaiting());\nself.addEventListener('activate', e => e.waitUntil(self.clients.claim()));\nself.addEventListener('fetch', () => {});";
function statsHtml() {
  const s = publicStats();
  const dot = s.status === 'Online' ? '#57F287' : '#FEE75C';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#15172b"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="MDC Status"><link rel="manifest" href="/manifest.json"><link rel="icon" href="/icon-192.png"><title>MDC Bot Status</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1116;color:#edeef0;font:16px/1.4 system-ui,sans-serif}.card{width:min(520px,92vw);background:#15172b;border:1px solid #23263f;border-radius:20px;padding:28px}h1{margin:0 0 6px;font-size:28px}.status{display:flex;align-items:center;gap:8px;color:#b6bad0;margin-bottom:18px}.dot{width:10px;height:10px;border-radius:99px;background:' + dot + ';box-shadow:0 0 0 0 ' + dot + ';animation:pulse 1.4s ease-out infinite}@keyframes pulse{70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item{background:#111325;border:1px solid #23263f;border-radius:14px;padding:14px}.label{color:#8c91ab;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.value{margin-top:4px;font-size:20px;font-weight:600}.note{margin-top:16px;color:#8c91ab;font-size:13px}button{margin-top:16px;width:100%;border:0;border-radius:12px;padding:12px 16px;background:#5865F2;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}button.hidden{display:none}</style></head><body><main class="card"><h1>MDC Bot</h1><div class="status"><span class="dot"></span><span id="state">' + s.status + '</span></div><div class="grid"><div class="item"><div class="label">Ping</div><div class="value">' + (s.ping == null ? '-' : s.ping + ' ms') + '</div></div><div class="item"><div class="label">Uptime</div><div class="value">' + s.uptime + '</div></div><div class="item"><div class="label">Servers</div><div class="value">' + s.servers + '</div></div><div class="item"><div class="label">AI</div><div class="value">' + s.ai + '</div></div><div class="item"><div class="label">Model</div><div class="value">' + s.model + '</div></div><div class="item"><div class="label">RAM</div><div class="value">' + s.ram + '</div></div></div><button id="install" class="hidden">Install app</button><p class="note" id="note">Public status only. Live. Updated ' + s.updated + '</p></main><script>if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js");let deferred;const btn=document.getElementById("install");window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;btn.classList.remove("hidden")});btn.addEventListener("click",async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;btn.classList.add("hidden")});async function live(){try{const s=await (await fetch("/api?ts="+Date.now(),{cache:"no-store"})).json();document.getElementById("state").textContent=s.status;const dot=document.querySelector(".dot");const color=s.status==="Online"?"#57F287":"#ED4245";dot.style.background=color;const values=[s.ping==null?"-":s.ping+" ms",s.uptime,s.servers,s.ai,s.model,s.ram];document.querySelectorAll(".value").forEach((el,i)=>el.textContent=values[i]);document.getElementById("note").textContent="Public status only. Live. Updated "+s.updated;}catch(e){}}setInterval(live,3000);</script></body></html>';
}
const HTTP_PORT = Number(process.env.SERVER_PORT || process.env.PORT || PORT) || 3000;
http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' }); return res.end(MANIFEST); }
  if (url === '/sw.js') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Service-Worker-Allowed': '/' }); return res.end(SW); }
  if (url === '/icon-192.png') { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); return res.end(ICON_192); }
  if (url === '/icon-512.png') { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); return res.end(ICON_512); }
  if (url === '/api' || url.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(publicStats()));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(statsHtml());
}).listen(HTTP_PORT, '0.0.0.0');
console.log('Status page listening on ' + HTTP_PORT);
if (!TOKEN) { console.error('TOKEN is missing.'); process.exit(1); }
client.login(TOKEN).catch((err) => console.error('LOGIN FAILED:', err && err.message ? err.message : err));
