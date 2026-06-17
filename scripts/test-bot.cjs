const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('clientReady', async (c) => {
  console.log('Online as:', c.user.tag);
  const guilds = c.guilds.cache;
  console.log('In', guilds.size, 'server(s):');
  guilds.forEach(g => console.log('  -', g.name, '(' + g.id + ')'));
  const channel = await c.channels.fetch('1460029173518176412').catch(e => console.log('Channel err:', e.message));
  if (channel) {
    console.log('Channel found:', channel.name);
    await channel.send('🦚 Peacock online! Test message from agent.');
    console.log('Message sent!');
  }
  process.exit(0);
});
const TOKEN = process.env.PEACOCK_DISCORD_TOKEN;
if (!TOKEN) { console.error('ERROR: PEACOCK_DISCORD_TOKEN env var required'); process.exit(1); }
