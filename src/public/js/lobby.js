/**
 * Lobby UI — room list rendering, create room dialog, room view.
 */
(function () {
  const Lobby = {
    renderRoomList(rooms, container, onJoin) {
      container.innerHTML = '';
      if (rooms.length === 0) {
        container.innerHTML = '<div class="no-rooms">No rooms yet. Create one!</div>';
        return;
      }
      for (const room of rooms) {
        const card = document.createElement('div');
        card.className = 'room-card';
        card.innerHTML = `
          <span class="room-name">${esc(room.name)}</span>
          <span class="room-info">${room.playerCount}/${room.maxPlayers} players</span>
          <span class="room-status ${room.status}">${room.status}</span>
        `;
        if (room.status === 'waiting') {
          card.addEventListener('click', () => onJoin(room.id));
        } else {
          card.style.opacity = '0.5';
          card.style.cursor = 'default';
        }
        container.appendChild(card);
      }
    },

    renderPlayerList(room, container, myId) {
      container.innerHTML = '';
      for (const p of room.players) {
        const row = document.createElement('div');
        row.className = 'player-row';
        const badges = [];
        if (p.isHost) badges.push('<span class="player-badge host">Host</span>');
        if (p.id !== room.hostId) {
          badges.push(p.ready
            ? '<span class="player-badge ready">Ready</span>'
            : '<span class="player-badge not-ready">Not Ready</span>');
        }
        const youTag = p.id === myId ? ' (you)' : '';
        row.innerHTML = `<span class="player-name">${esc(p.name)}${youTag}</span>${badges.join('')}`;
        container.appendChild(row);
      }
    },

    addChatMessage(container, from, text) {
      const msg = document.createElement('div');
      msg.className = 'msg';
      msg.innerHTML = `<span class="msg-name">${esc(from)}:</span> ${esc(text)}`;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
    },
  };

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  if (typeof window !== 'undefined') window.Lobby = Lobby;
})();
