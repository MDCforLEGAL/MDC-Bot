# MDC Discord Bot

MDC Hub Discord Bot with verification, Roblox linking and basic moderation.

## Features

- `/verify` – Verify users with MDC- codes (one-time use)
- `/linkroblox` – Link Roblox account + give role
- `/unlinkroblox` – Unlink Roblox account
- `/roblox` – Check linked account
- Basic moderation (links → warning → ban)
- Console channel logging
- Role restrictions (Owner & Moderator)

## Setup

1. Create a Discord Application + Bot
2. Enable **Message Content Intent**, **Server Members Intent**, **Presence Intent** (if needed)
3. Invite the bot with Administrator or proper permissions
4. Create these roles in your server:
   - `MDC verified`
   - `Roblox Verified`
   - `Owner`
   - `Moderator`
5. Create a channel named `🚫-console` (or containing "console")

## Environment Variables

```env
TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id   # optional
```

## Deploy (Railway / Render / etc.)

- Set the environment variables above
- Start command: `node bot.js`

## Notes

- Codes must start with `MDC-`
- Used codes are stored in memory (resets on restart)
- For permanent storage you can later add a database
