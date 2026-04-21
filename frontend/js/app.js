/**
 * P2P Encrypted Chat - Исправленная версия
 */

// ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ====================

const state = {
    ws: null,
    roomId: null,
    userId: null,
    peers: new Map(),                    // targetUserId -> { peerConnection, dataChannel }
    allUsers: new Set(),                 // ← НОВОЕ: все пользователи в комнате
    currentPeer: null,
    connected: false
};

// ==================== DOM ЭЛЕМЕНТЫ ====================

const elements = {
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    sendBtn: document.getElementById('sendBtn'),
    messageInput: document.getElementById('messageInput'),
    chatMessages: document.getElementById('chatMessages'),
    usersList: document.getElementById('usersList'),
    connectionStatus: document.getElementById('connectionStatus'),
    chatTitle: document.getElementById('chatTitle'),
    fileInput: document.getElementById('fileInput'),
    roomId: document.getElementById('roomId'),
    userId: document.getElementById('userId'),
    signalingUrl: document.getElementById('signalingUrl')
};

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function addMessage(text, type = 'system', sender = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'system' ? 'system-message' : `message ${type}`;

    if (type !== 'system') {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = text;
        messageDiv.appendChild(bubble);

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = sender ? `${sender} • ${new Date().toLocaleTimeString()}` : new Date().toLocaleTimeString();
        messageDiv.appendChild(meta);
    } else {
        messageDiv.textContent = text;
    }

    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * ИСПРАВЛЕНО: обновляет список пользователей из state.allUsers
 */
function updateUsersList() {
    // Преобразуем Set в массив, исключаем себя
    const users = Array.from(state.allUsers).filter(u => u !== state.userId);

    if (users.length === 0) {
        elements.usersList.innerHTML = '<div class="empty-message">Нет подключённых пользователей</div>';
        return;
    }

    elements.usersList.innerHTML = users.map(user => `
        <div class="user-item ${state.currentPeer === user ? 'selected' : ''}" data-user-id="${user}">
            ${user}
            ${state.peers.has(user) && state.peers.get(user).dataChannel?.readyState === 'open' ? ' 🟢' : ' ⚪'}
        </div>
    `).join('');

    document.querySelectorAll('.user-item').forEach(el => {
        el.addEventListener('click', () => selectUser(el.dataset.userId));
    });
}

function updateConnectionStatus(status, text) {
    elements.connectionStatus.className = `status status-${status}`;
    elements.connectionStatus.textContent = text;
}

// ==================== WEBRTC ФУНКЦИИ ====================

async function createPeerConnection(targetUserId) {
    console.log(`🔧 Создаём PeerConnection для ${targetUserId}`);

    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    const dataChannel = peerConnection.createDataChannel('chat');

    dataChannel.onopen = () => {
        console.log(`✅ P2P соединение с ${targetUserId} установлено`);
        addMessage(`🔓 P2P соединение с ${targetUserId} установлено`, 'system');
        if (state.currentPeer === targetUserId) {
            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;
        }
        updateUsersList();  // Обновляем статус (зелёный кружок)
    };

    dataChannel.onclose = () => {
        console.log(`❌ P2P соединение с ${targetUserId} закрыто`);
        addMessage(`🔒 Соединение с ${targetUserId} закрыто`, 'system');
        if (state.currentPeer === targetUserId) {
            elements.messageInput.disabled = true;
            elements.sendBtn.disabled = true;
        }
        updateUsersList();
    };

    dataChannel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'text') {
                addMessage(data.content, 'received', targetUserId);
            } else if (data.type === 'file') {
                addMessage(`📎 Получен файл: ${data.filename}`, 'received', targetUserId);
                downloadFile(data.content, data.filename);
            }
        } catch (e) {
            addMessage(event.data, 'received', targetUserId);
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'ice-candidate',
                to_user_id: targetUserId,
                data: event.candidate
            }));
        }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    state.ws.send(JSON.stringify({
        type: 'offer',
        to_user_id: targetUserId,
        data: offer
    }));

    state.peers.set(targetUserId, { peerConnection, dataChannel });
    addMessage(`📡 Отправлен запрос на соединение ${targetUserId}`, 'system');
}

async function handleOffer(fromUserId, offer) {
    console.log(`📞 Получен offer от ${fromUserId}`);

    const configuration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        setupDataChannel(dataChannel, fromUserId);
        state.peers.set(fromUserId, { peerConnection, dataChannel });
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'ice-candidate',
                to_user_id: fromUserId,
                data: event.candidate
            }));
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    state.ws.send(JSON.stringify({
        type: 'answer',
        to_user_id: fromUserId,
        data: answer
    }));
}

function setupDataChannel(dataChannel, peerId) {
    dataChannel.onopen = () => {
        addMessage(`🔓 P2P соединение с ${peerId} установлено`, 'system');
        if (state.currentPeer === peerId) {
            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;
        }
        updateUsersList();
    };

    dataChannel.onclose = () => {
        addMessage(`🔒 Соединение с ${peerId} закрыто`, 'system');
        updateUsersList();
    };

    dataChannel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'text') {
                addMessage(data.content, 'received', peerId);
            }
        } catch (e) {
            addMessage(event.data, 'received', peerId);
        }
    };
}

async function handleAnswer(fromUserId, answer) {
    const peer = state.peers.get(fromUserId);
    if (peer && peer.peerConnection) {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

async function handleIceCandidate(fromUserId, candidate) {
    const peer = state.peers.get(fromUserId);
    if (peer && peer.peerConnection) {
        await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

/**
 * ИСПРАВЛЕНО: выбирает собеседника
 */
function selectUser(userId) {
    if (state.currentPeer === userId) return;

    state.currentPeer = userId;
    elements.chatTitle.textContent = `💬 Чат с ${userId}`;
    updateUsersList();

    // Проверяем, есть ли уже соединение
    if (!state.peers.has(userId)) {
        addMessage(`⏳ Устанавливаем соединение с ${userId}...`, 'system');
        createPeerConnection(userId);
    } else {
        const peer = state.peers.get(userId);
        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
            elements.messageInput.disabled = false;
            elements.sendBtn.disabled = false;
            addMessage(`✅ Соединение с ${userId} уже установлено`, 'system');
        } else {
            addMessage(`⏳ Восстанавливаем соединение с ${userId}...`, 'system');
        }
    }
}

// ==================== WEBSOCKET ФУНКЦИИ ====================

async function connect() {
    const roomId = elements.roomId.value.trim();
    let userId = elements.userId.value.trim();
    const signalingUrl = elements.signalingUrl.value.trim();

    if (!roomId) {
        addMessage('❌ Введите ID комнаты', 'system');
        return;
    }

    if (!userId) {
        userId = `user_${Math.random().toString(36).substr(2, 8)}`;
        elements.userId.value = userId;
    }

    const wsUrl = `${signalingUrl}/${roomId}/${userId}`;
    console.log(`🔌 Подключение к ${wsUrl}`);

    try {
        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            console.log('✅ WebSocket подключён');
            state.connected = true;
            state.roomId = roomId;
            state.userId = userId;
            state.allUsers.clear();
            state.allUsers.add(userId);

            elements.connectBtn.disabled = true;
            elements.disconnectBtn.disabled = false;
            updateConnectionStatus('connected', '✅ Подключён');
            addMessage(`🔌 Подключён к комнате "${roomId}" как ${userId}`, 'system');
            updateUsersList();
        };

        state.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('📨 Получено:', message.type, message);

            switch (message.type) {
                case 'room_state':
                    // ИСПРАВЛЕНО: обновляем список всех пользователей
                    if (message.users) {
                        state.allUsers.clear();
                        state.allUsers.add(state.userId);
                        message.users.forEach(u => state.allUsers.add(u));
                        updateUsersList();

                        // Добавляем системное сообщение о пользователях
                        if (message.users.length > 0) {
                            addMessage(`👥 В комнате: ${message.users.join(', ')}`, 'system');
                        }
                    }
                    break;

                case 'user_joined':
                    // ИСПРАВЛЕНО: добавляем пользователя в список
                    state.allUsers.add(message.user_id);
                    updateUsersList();
                    addMessage(`👤 Пользователь ${message.user_id} вошёл в комнату`, 'system');
                    break;

                case 'user_left':
                    // ИСПРАВЛЕНО: удаляем пользователя из списка
                    state.allUsers.delete(message.user_id);
                    if (state.peers.has(message.user_id)) {
                        const peer = state.peers.get(message.user_id);
                        if (peer.dataChannel) peer.dataChannel.close();
                        state.peers.delete(message.user_id);
                    }
                    if (state.currentPeer === message.user_id) {
                        state.currentPeer = null;
                        elements.messageInput.disabled = true;
                        elements.sendBtn.disabled = true;
                        elements.chatTitle.textContent = '💬 Выберите собеседника';
                    }
                    updateUsersList();
                    addMessage(`👋 Пользователь ${message.user_id} покинул комнату`, 'system');
                    break;

                case 'offer':
                    handleOffer(message.from_user_id, message.data);
                    break;

                case 'answer':
                    handleAnswer(message.from_user_id, message.data);
                    break;

                case 'ice-candidate':
                    handleIceCandidate(message.from_user_id, message.data);
                    break;

                default:
                    console.log('Неизвестный тип сообщения:', message.type);
            }
        };

        state.ws.onerror = (error) => {
            console.error('❌ WebSocket ошибка:', error);
            addMessage('❌ Ошибка подключения к серверу', 'system');
        };

        state.ws.onclose = () => {
            console.log('🔌 WebSocket отключён');
            disconnect();
        };

    } catch (error) {
        console.error('❌ Ошибка:', error);
        addMessage(`❌ Ошибка: ${error.message}`, 'system');
    }
}

function disconnect() {
    for (const [userId, peer] of state.peers) {
        if (peer.dataChannel) peer.dataChannel.close();
        if (peer.peerConnection) peer.peerConnection.close();
    }

    if (state.ws) {
        state.ws.close();
    }

    state.ws = null;
    state.peers.clear();
    state.allUsers.clear();
    state.currentPeer = null;
    state.connected = false;

    elements.connectBtn.disabled = false;
    elements.disconnectBtn.disabled = true;
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
    updateConnectionStatus('disconnected', '⛔ Отключён');
    elements.chatTitle.textContent = '💬 Выберите собеседника';
    updateUsersList();
    addMessage('🔌 Отключён от сервера', 'system');
}

// ==================== ОТПРАВКА СООБЩЕНИЙ ====================

function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (!text || !state.currentPeer) return;

    const peer = state.peers.get(state.currentPeer);
    if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
        const message = JSON.stringify({
            type: 'text',
            content: text,
            timestamp: Date.now()
        });
        peer.dataChannel.send(message);
        addMessage(text, 'sent', 'Вы');
        elements.messageInput.value = '';
    } else {
        addMessage('❌ P2P соединение не установлено. Попробуйте выбрать пользователя снова.', 'system');
    }
}

function sendFile(file) {
    if (!state.currentPeer) {
        addMessage('❌ Выберите собеседника', 'system');
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const peer = state.peers.get(state.currentPeer);
        if (peer && peer.dataChannel && peer.dataChannel.readyState === 'open') {
            const message = JSON.stringify({
                type: 'file',
                filename: file.name,
                size: file.size,
                content: reader.result
            });
            peer.dataChannel.send(message);
            addMessage(`📎 Отправлен файл: ${file.name}`, 'sent', 'Вы');
        } else {
            addMessage('❌ P2P соединение не установлено', 'system');
        }
    };
    reader.readAsDataURL(file);
}

function downloadFile(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

elements.connectBtn.addEventListener('click', connect);
elements.disconnectBtn.addEventListener('click', disconnect);
elements.sendBtn.addEventListener('click', sendMessage);

elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        sendFile(e.target.files[0]);
    }
    e.target.value = '';
});

console.log('🚀 Приложение загружено (исправленная версия)');