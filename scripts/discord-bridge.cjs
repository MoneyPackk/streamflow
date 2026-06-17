// Peacock Discord Agent - dashboard with status, logs, deploy buttons
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const { exec } = require('child_process');

const TOKEN = process.env.PEACOCK_DISCORD_TOKEN;
if (!TOKEN) { console.error('ERROR: PEACOCK_DISCORD_TOKEN env var required'); process.exit(1); }
const SERVER_ID = '1456086799318515848';
const PROJECT_DIR = 'C:\\Users\\blazi\\zed\\projects\\streaming-platform';
const STREAMING_HOST = '5.161.178.63';
const STREAMING_PASS = '4kaeAVmcfens';

const PEACOCK_PURPLE = 0x8b5cf6;
const PEACOCK_CYAN = 0x06b6d4;
const PEACOCK_DARK = 0x0a0a14;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function shellExec(cmd, cwd = PROJECT_DIR) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, maxBuffer: 5 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', err: err?.message });
    });
  });
}

async function sshToHetzner(cmd) {
  const escaped = cmd.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const script = `node -e "const {Client}=require('ssh2');const c=new Client();c.on('ready',()=>{c.exec('${escaped}',(e,s)=>{let o='';s.on('data',d=>o+=d);s.stderr.on('data',d=>o+=d);s.on('close',()=>{console.log(o);c.end()})})});c.connect({host:'${STREAMING_HOST}',username:'root',password:'${STREAMING_PASS}',readyTimeout:15000})"`;
  const { stdout, stderr } = await shellExec(script);
  return (stdout + stderr).trim();
}

async function checkSite() {
  return new Promise((resolve) => {
    const req = require('http').get('http://5.161.178.63:3000', (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

function chunk(text, size = 1900) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.substring(i, i + size));
  return out;
}

function embedBase() {
  return new EmbedBuilder().setColor(PEACOCK_PURPLE).setTimestamp().setFooter({ text: '🦚 Peacock Agent' });
}

async function buildStatusEmbed() {
  const [siteUp, memOut, diskOut, uptimeOut, serverOut, recentLog] = await Promise.all([
    checkSite(),
    shellExec('powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty FreePhysicalMemory"'),
    shellExec('powershell -Command "Get-PSDrive C | Select-Object -ExpandProperty Free"'),
    shellExec('powershell -Command "[math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 1)"'),
    sshToHetzner('uptime; echo ---; systemctl is-active streamflow; echo ---; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000'),
    sshToHetzner('journalctl -u streamflow --no-pager -n 5 -o cat 2>/dev/null || echo "no logs"'),
  ]);

  const ramGb = (parseInt(memOut.stdout) / 1024 / 1024).toFixed(1);
  const diskGb = (parseInt(diskOut.stdout) / 1073741824).toFixed(1);
  const uptimeH = parseFloat(uptimeOut.stdout).toFixed(1);
  const serverLines = serverOut.split('\n');
  const serverUptime = serverLines[0] || 'unknown';
  const streamflow = serverLines[1] === 'active' ? '✅ running' : '❌ down';
  const siteHttp = serverLines[2] || 'n/a';
  const logSnippet = recentLog.split('\n').slice(0, 3).join('\n').substring(0, 200) || 'no logs';

  return new EmbedBuilder()
    .setColor(siteUp ? PEACOCK_CYAN : 0xef4444)
    .setTitle('🦚 Peacock Status Dashboard')
    .addFields(
      { name: '🌐 Streaming Site', value: siteUp ? '✅ Online' : '❌ Offline', inline: true },
      { name: '📡 Server HTTP', value: `\`${siteHttp}\``, inline: true },
      { name: '⚙️ StreamFlow', value: streamflow, inline: true },
      { name: '🖥️ Server Uptime', value: serverUptime.split('up').pop()?.substring(0, 20) || '—', inline: false },
      { name: '💻 PC RAM Free', value: `${ramGb} GB`, inline: true },
      { name: '💾 PC Disk Free', value: `${diskGb} GB`, inline: true },
      { name: '⏱️ PC Uptime', value: `${uptimeH} hours`, inline: true },
      { name: '📋 Recent Logs', value: `\`\`\`\n${logSnippet}\n\`\`\``, inline: false },
    )
    .setTimestamp();
}

function buildControlButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctl_status').setLabel('Status').setEmoji('📊').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ctl_restart').setLabel('Restart').setEmoji('🔄').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ctl_deploy').setLabel('Deploy').setEmoji('⬇️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ctl_logs').setLabel('Logs').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctl_disk').setLabel('Disk').setEmoji('💾').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ctl_memory').setLabel('Memory').setEmoji('🧠').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ctl_ps').setLabel('Processes').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ctl_git').setLabel('Git Log').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function sendEmbed(msg, embed, components = []) {
  if (embed.data.description && embed.data.description.length > 4000) {
    const chunks = chunk(embed.data.description, 3800);
    embed.setDescription(chunks[0]);
    const reply = await msg.reply({ embeds: [embed], components });
    for (let i = 1; i < chunks.length; i++) {
      await msg.channel.send({ embeds: [new EmbedBuilder().setColor(PEACOCK_PURPLE).setDescription(chunks[i])] });
    }
    return reply;
  }
  return msg.reply({ embeds: [embed], components });
}

client.on('clientReady', async (c) => {
  console.log(`🦚 Peacock agent online as ${c.user.tag}`);
  c.user.setActivity('🦚 Streaming site', { type: ActivityType.Watching });
  c.user.setStatus('online');

  const guild = c.guilds.cache.get(SERVER_ID);
  if (guild) console.log(`   ✓ ${guild.name}`);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.guildId !== SERVER_ID) return;

  const raw = msg.content.trim();
  if (!raw) return;
  const content = raw.replace(/<@!?\d+>/g, '').trim();
  if (!content) return;

  await msg.channel.sendTyping();

  const lower = content.toLowerCase();
  const parts = content.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/^\//, '');
  const args = parts.slice(1);

  try {
    if (lower === 'help' || lower === '/help') {
      const embed = embedBase()
        .setTitle('🦚 Peacock Agent — Commands')
        .addFields(
          { name: '📊 Quick', value: '`status` · `restart` · `deploy` · `logs [N]` · `tail`', inline: false },
          { name: '🖥️ System', value: '`disk` · `memory` · `uptime` · `ps`', inline: false },
          { name: '🔧 Server', value: '`server` · `ssh <cmd>` · `nginx restart`', inline: false },
          { name: '📜 Git', value: '`git log` · `git pull` · `git status` · `git diff`', inline: false },
          { name: '💻 PC', value: '`projects` · `time` · `ip` · `weather <city>`', inline: false },
        );
      return sendEmbed(msg, embed, buildControlButtons());
    }

    if (lower === 'status' || lower === 'health') {
      const embed = await buildStatusEmbed();
      return sendEmbed(msg, embed, buildControlButtons());
    }

    if (lower === 'restart') {
      const thinking = await msg.reply({ embeds: [embedBase().setDescription('🔄 Restarting streamflow...')] });
      const out = await sshToHetzner('systemctl restart streamflow && sleep 2 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000');
      const embed = embedBase().setTitle('🔄 Restarted').setDescription('```\n' + out + '\n```').setColor(0x10b981);
      return thinking.edit({ embeds: [embed], components: buildControlButtons() });
    }

    if (lower === 'deploy' || lower === 'update') {
      const thinking = await msg.reply({ embeds: [embedBase().setDescription('⬇️ Pulling + redeploying...')] });
      const out = await sshToHetzner('cd /opt/streamflow && git pull origin master 2>&1 | tail -3 && npm install --omit=dev 2>&1 | tail -2 && systemctl restart streamflow && sleep 2 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000');
      const embed = embedBase().setTitle('⬇️ Deployed').setDescription('```\n' + out + '\n```').setColor(0x10b981);
      return thinking.edit({ embeds: [embed], components: buildControlButtons() });
    }

    if (cmd === 'logs' || lower === 'tail') {
      const n = parseInt(args[0]) || 25;
      const out = await sshToHetzner(`journalctl -u streamflow --no-pager -n ${n} -o cat`);
      return sendEmbed(msg, embedBase().setTitle(`📋 Last ${n} log lines`).setDescription('```\n' + (out || 'no logs').substring(0, 1900) + '\n```'));
    }

    if (cmd === 'ssh' || lower.startsWith('ssh ')) {
      const cmdStr = lower.startsWith('ssh ') ? content.substring(4) : args.join(' ');
      const out = await sshToHetzner(cmdStr);
      return sendEmbed(msg, embedBase().setTitle(`🖥️ ${cmdStr.substring(0, 50)}`).setDescription('```\n' + (out || 'no output').substring(0, 1900) + '\n```'));
    }

    if (lower === 'server') {
      const out = await sshToHetzner('uptime; echo ---; df -h /; echo ---; free -h; echo ---; systemctl is-active streamflow nginx');
      return sendEmbed(msg, embedBase().setTitle('🖥️ Server').setDescription('```\n' + out + '\n```'));
    }

    if (lower === 'disk') {
      const out = await shellExec('powershell -Command "Get-PSDrive | Where-Object { $_.Used -gt 0 } | ForEach-Object { Write-Output (\\\"{0}: {1} GB free of {2} GB\\\" -f $_.Name, [math]::Round($_.Free/1GB,1), [math]::Round(($_.Used+$_.Free)/1GB,1)) }"');
      return sendEmbed(msg, embedBase().setTitle('💾 Disk').setDescription('```\n' + (out.stdout || 'n/a') + '\n```'));
    }

    if (lower === 'memory' || lower === 'ram') {
      const out = await shellExec('powershell -Command "$o = Get-CimInstance Win32_OperatingSystem; Write-Output (\\\"Total: {0} GB\\\" -f [math]::Round($o.TotalVisibleMemorySize/1MB,1)); Write-Output (\\\"Free:  {0} GB\\\" -f [math]::Round($o.FreePhysicalMemory/1MB,1)); Write-Output (\\\"Used:  {0}%\\\" -f [math]::Round((1 - $o.FreePhysicalMemory/$o.TotalVisibleMemorySize)*100,1))"');
      return sendEmbed(msg, embedBase().setTitle('🧠 Memory').setDescription('```\n' + (out.stdout || 'n/a') + '\n```'));
    }

    if (lower === 'uptime') {
      const out = await shellExec('powershell -Command "[math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 1)"');
      return msg.reply({ embeds: [embedBase().setTitle('⏱️ PC Uptime').setDescription(`${out.stdout.trim()} hours`)] });
    }

    if (lower === 'ps' || lower === 'processes') {
      const out = await shellExec('powershell -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 8 Name, @{N=\\\"MemMB\\\";E={[math]::Round(\\$_.WorkingSet/1MB,1)}} | Format-Table | Out-String"');
      return sendEmbed(msg, embedBase().setTitle('⚙️ Top Processes').setDescription('```\n' + out.stdout + '\n```'));
    }

    if (cmd === 'git') {
      const sub = args[0] || 'log';
      if (sub === 'log') {
        const out = await shellExec('git log --oneline -10');
        return sendEmbed(msg, embedBase().setTitle('📜 Git Log').setDescription('```\n' + out.stdout + '\n```'));
      }
      if (sub === 'pull') {
        const out = await shellExec('git pull');
        return sendEmbed(msg, embedBase().setTitle('⬇️ Git Pull').setDescription('```\n' + out.stdout + '\n```'));
      }
      if (sub === 'status') {
        const out = await shellExec('git status -sb');
        return sendEmbed(msg, embedBase().setTitle('📊 Git Status').setDescription('```\n' + out.stdout + '\n```'));
      }
      if (sub === 'diff') {
        const out = await shellExec('git diff --stat');
        return sendEmbed(msg, embedBase().setTitle('📊 Git Diff').setDescription('```\n' + (out.stdout || 'No changes') + '\n```'));
      }
    }

    if (lower === 'projects') {
      const out = await shellExec('powershell -Command "Get-ChildItem C:\\Users\\blazi\\zed\\projects -Directory | Select-Object -ExpandProperty Name"');
      return sendEmbed(msg, embedBase().setTitle('📁 Projects').setDescription('```\n' + out.stdout + '\n```'));
    }

    if (lower === 'time') {
      const out = await shellExec('powershell -Command "Get-Date -Format \\"yyyy-MM-dd HH:mm:ss\\""');
      return msg.reply({ embeds: [embedBase().setTitle('🕐 Time').setDescription(out.stdout)] });
    }

    if (lower === 'ip') {
      const out = await shellExec('curl -s ifconfig.me');
      return msg.reply({ embeds: [embedBase().setTitle('🌐 Public IP').setDescription('`' + out.stdout.trim() + '`')] });
    }

    if (cmd === 'weather' || lower.startsWith('weather ')) {
      const city = args.join(' ') || 'auto';
      const out = await shellExec(`curl -s "wttr.in/${encodeURIComponent(city)}?format=3"`);
      return msg.reply({ embeds: [embedBase().setTitle('🌤️ Weather').setDescription(out.stdout)] });
    }

    if (lower.startsWith('nginx')) {
      if (lower.includes('restart')) {
        await sshToHetzner('systemctl restart nginx');
        return msg.reply({ embeds: [embedBase().setDescription('🔄 Nginx restarted')] });
      }
    }

    const embed = embedBase()
      .setTitle('🦚 Unknown command')
      .setDescription(`Try \`status\`, \`restart\`, \`deploy\`, \`logs\`, or \`help\``)
      .setColor(PEACOCK_CYAN);
    return sendEmbed(msg, embed, buildControlButtons());

  } catch (e) {
    return msg.reply({ embeds: [embedBase().setColor(0xef4444).setTitle('❌ Error').setDescription(e.message)] });
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.guildId !== SERVER_ID) return;

  const handlers = {
    ctl_status: async () => {
      await interaction.deferUpdate();
      const embed = await buildStatusEmbed();
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_restart: async () => {
      await interaction.deferUpdate();
      await interaction.editReply({ embeds: [embedBase().setDescription('🔄 Restarting...')], components: [] });
      const out = await sshToHetzner('systemctl restart streamflow && sleep 2 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000');
      const embed = embedBase().setTitle('🔄 Restarted').setDescription('```\n' + out + '\n```').setColor(0x10b981);
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_deploy: async () => {
      await interaction.deferUpdate();
      await interaction.editReply({ embeds: [embedBase().setDescription('⬇️ Deploying...')], components: [] });
      const out = await sshToHetzner('cd /opt/streamflow && git pull origin master 2>&1 | tail -3 && npm install --omit=dev 2>&1 | tail -2 && systemctl restart streamflow && sleep 2 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000');
      const embed = embedBase().setTitle('⬇️ Deployed').setDescription('```\n' + out + '\n```').setColor(0x10b981);
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_logs: async () => {
      await interaction.deferUpdate();
      const out = await sshToHetzner('journalctl -u streamflow --no-pager -n 25 -o cat');
      const embed = embedBase().setTitle('📋 Logs').setDescription('```\n' + (out || 'no logs').substring(0, 1900) + '\n```');
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_disk: async () => {
      await interaction.deferUpdate();
      const out = await shellExec('powershell -Command "Get-PSDrive | Where-Object { $_.Used -gt 0 } | ForEach-Object { Write-Output (\\\"{0}: {1} GB free\\\" -f $_.Name, [math]::Round($_.Free/1GB,1)) }"');
      const embed = embedBase().setTitle('💾 Disk').setDescription('```\n' + out.stdout + '\n```');
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_memory: async () => {
      await interaction.deferUpdate();
      const out = await shellExec('powershell -Command "$o = Get-CimInstance Win32_OperatingSystem; Write-Output (\\\"Total: {0} GB\\\" -f [math]::Round($o.TotalVisibleMemorySize/1MB,1)); Write-Output (\\\"Free:  {0} GB\\\" -f [math]::Round($o.FreePhysicalMemory/1MB,1))"');
      const embed = embedBase().setTitle('🧠 Memory').setDescription('```\n' + out.stdout + '\n```');
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_ps: async () => {
      await interaction.deferUpdate();
      const out = await shellExec('powershell -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 8 Name,@{N=\\\"MemMB\\\";E={[math]::Round(\\$_.WorkingSet/1MB,1)}} | Format-Table | Out-String"');
      const embed = embedBase().setTitle('⚙️ Top Processes').setDescription('```\n' + out.stdout + '\n```');
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
    ctl_git: async () => {
      await interaction.deferUpdate();
      const out = await shellExec('git log --oneline -8');
      const embed = embedBase().setTitle('📜 Git Log').setDescription('```\n' + out.stdout + '\n```');
      return interaction.editReply({ embeds: [embed], components: buildControlButtons() });
    },
  };

  const handler = handlers[interaction.customId];
  if (handler) {
    try { await handler(); } catch (e) {
      await interaction.editReply({ embeds: [embedBase().setColor(0xef4444).setDescription('❌ ' + e.message)] });
    }
  }
});

client.login(TOKEN).catch(e => {
  console.error('Login failed:', e.message);
  process.exit(1);
});
