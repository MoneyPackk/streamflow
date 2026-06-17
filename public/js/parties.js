import { api, sanitize } from './api.js';
import { user } from './auth.js';
import { getPlayerState } from './player.js';

let activeParty = null;
let ws = null;
let chatPollTimer = null;

function partyPanel() {
  return document.getElementById('party-panel');
}

export function initPartyUI() {
  document.getElementById('party-create-btn')?.addEventListener('click', createParty);
  document.getElementById('party-join-btn')?.addEventListener('click', joinPartyFromInput);
  document.getElementById('party-leave-btn')?.addEventListener('click', leaveParty);
  document.getElementById('party-chat-send')?.addEventListener('click', sendPartyChat);
  document.getElementById('party-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendPartyChat();
  });
  document.querySelectorAll('.party-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => sendReaction(btn.dataset.emoji));
  });
}

export function updatePartyPanelVisibility() {
  const panel = partyPanel();
  if (!panel) return;
  panel.style.display = user ? 'block' : 'none';
}

export async function createParty() {
  if (!user) {
    window.showToast('Sign in to start a watch party', 'info');
    return;
  }
  const { currentTmdbId, currentMediaType, currentSeason, currentEpisode } = getPlayerState();
  if (!currentTmdbId) {
    window.showToast('Open a title first', 'info');
    return;
  }
  try {
    const data = await api('/parties', {
      method: 'POST',
      body: JSON.stringify({
        tmdb_id: currentTmdbId,
        media_type: currentMediaType,
        season_number: currentSeason,
        episode_number: currentEpisode,
      }),
    });
    await enterParty(data.code, data.id);
    window.showToast(`Party created! Code: ${data.code}`, 'success', 5000);
  } catch (e) {
    window.showToast(e.message || 'Could not create party', 'error');
  }
}

async function joinPartyFromInput() {
  const input = document.getElementById('party-join-input');
  const code = input?.value?.trim().toUpperCase();
  if (!code) return;
  if (!user) {
    window.showToast('Sign in to join a party', 'info');
    return;
  }
  try {
    await api(`/parties/${code}/join`, { method: 'POST' });
    const details = await api(`/parties/${code}`);
    await enterParty(code, details.party.id);
    window.showToast(`Joined party ${code}`, 'success');
  } catch (e) {
    window.showToast(e.message || 'Party not found', 'error');
  }
}

async function enterParty(code, partyId) {
  activeParty = { code, id: partyId };
  document.getElementById('party-active-code').textContent = code;
  document.getElementById('party-idle').style.display = 'none';
  document.getElementById('party-active').style.display = 'block';
  connectPartySocket(partyId);
  await refreshPartyMembers();
  startChatPoll();
}

async function refreshPartyMembers() {
  if (!activeParty) return;
  try {
    const data = await api(`/parties/${activeParty.code}`);
    const list = document.getElementById('party-members');
    if (list) {
      list.innerHTML = (data.members || []).map(m =>
        `<span class="party-member">${sanitize(m.username)}</span>`
      ).join('');
    }
  } catch (e) {
    console.warn('[PS party]', e);
  }
}

function connectPartySocket(partyId) {
  if (ws) {
    ws.close();
    ws = null;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', userId: user?.id }));
    ws.send(JSON.stringify({ type: 'subscribe', partyId }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'chat') appendChatLine(msg.username, msg.body);
      if (msg.type === 'reaction') showReactionFloat(msg.emoji, msg.username);
      if (msg.type === 'member_joined') refreshPartyMembers();
    } catch {}
  };
}

function startChatPoll() {
  stopChatPoll();
  chatPollTimer = setInterval(loadPartyChat, 4000);
  loadPartyChat();
}

function stopChatPoll() {
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = null;
}

async function loadPartyChat() {
  if (!activeParty) return;
  try {
    const data = await api(`/parties/${activeParty.code}/chat`);
    const box = document.getElementById('party-chat-messages');
    if (!box) return;
    box.innerHTML = (data.messages || []).map(m =>
      `<div class="party-chat-line"><strong>${sanitize(m.username)}</strong> ${sanitize(m.body)}</div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
  } catch {}
}

function appendChatLine(username, body) {
  const box = document.getElementById('party-chat-messages');
  if (!box) return;
  box.insertAdjacentHTML('beforeend',
    `<div class="party-chat-line"><strong>${sanitize(username)}</strong> ${sanitize(body)}</div>`
  );
  box.scrollTop = box.scrollHeight;
}

async function sendPartyChat() {
  const input = document.getElementById('party-chat-input');
  const body = input?.value?.trim();
  if (!body || !activeParty) return;
  try {
    await api(`/parties/${activeParty.code}/chat`, { method: 'POST', body: JSON.stringify({ body }) });
    input.value = '';
    loadPartyChat();
  } catch (e) {
    window.showToast(e.message, 'error');
  }
}

async function sendReaction(emoji) {
  if (!activeParty || !emoji) return;
  try {
    await api(`/parties/${activeParty.code}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji, timestamp_seconds: 0 }),
    });
    showReactionFloat(emoji, user?.username);
  } catch {}
}

function showReactionFloat(emoji, username) {
  const layer = document.getElementById('party-reactions');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'party-reaction-float';
  el.textContent = `${emoji} ${username || ''}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export async function leaveParty() {
  if (!activeParty) return;
  try {
    await api(`/parties/${activeParty.code}/leave`, { method: 'POST' });
  } catch {}
  activeParty = null;
  stopChatPoll();
  if (ws) {
    ws.close();
    ws = null;
  }
  document.getElementById('party-idle')?.style && (document.getElementById('party-idle').style.display = 'block');
  document.getElementById('party-active')?.style && (document.getElementById('party-active').style.display = 'none');
  document.getElementById('party-join-input').value = '';
}
