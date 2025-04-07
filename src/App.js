import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import Peer from 'simple-peer';


function App() {
  const [rooms, setRooms] = useState([
    { id: 'oda1', name: 'Genel Sohbet' },
    { id: 'oda2', name: 'Oyun Odası' },
    { id: 'oda3', name: 'Müzik Odası' }
  ]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState([]);
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [userColors] = useState(new Map());
  const [volume, setVolume] = useState(1);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [pushToTalkKey, setPushToTalkKey] = useState('Space');
  const [isRecording, setIsRecording] = useState(false);
  const [isSettingPTTKey, setIsSettingPTTKey] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const CORRECT_PASSWORD = 'h@M3!5#pN7$wR&9K8^tQ6~LZx4%jF2'; 
  const [peers, setPeers] = useState({});
  const [peerStreams, setPeerStreams] = useState({});
  const peerRefs = useRef({});

  const socket = useRef();
  const audioRef = useRef();

  const getRandomColor = (userId) => {
    if (!userColors.has(userId)) {
      const colors = [
        '#7289da', // Mavi
        '#43b581', // Yeşil
        '#faa61a', // Sarı
        '#f04747', // Kırmızı
        '#b9bbbe', // Gri
        '#e67e22', // Turuncu
        '#9b59b6', // Mor
        '#3498db', // Açık Mavi
        '#1abc9c', // Turkuaz
        '#e91e63'  // Pembe
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      userColors.set(userId, randomColor);
    }
    return userColors.get(userId);
  };

  useEffect(() => {
    socket.current = io("https://voice-chat-0fgk.onrender.com");

    socket.current.on("connect", () => {
      setIsConnected(true);
    });

    socket.current.on("message", (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.current.on("roomUsers", (users) => {
      setUsersInRoom(users);
    });

    // WebRTC sinyal olayları
    socket.current.on("userJoined", ({ userId, username }) => {
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream
      });

      peer.on("signal", (signal) => {
        socket.current.emit("signal", { userId, signal });
      });

      peer.on("stream", (remoteStream) => {
        setPeerStreams(prev => ({
          ...prev,
          [userId]: remoteStream
        }));
      });

      peerRefs.current[userId] = peer;
      setPeers(prev => ({
        ...prev,
        [userId]: peer
      }));
    });

    socket.current.on("signal", ({ userId, signal }) => {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream
      });

      peer.on("signal", (signal) => {
        socket.current.emit("signal", { userId, signal });
      });

      peer.on("stream", (remoteStream) => {
        setPeerStreams(prev => ({
          ...prev,
          [userId]: remoteStream
        }));
      });

      peer.signal(signal);
      peerRefs.current[userId] = peer;
      setPeers(prev => ({
        ...prev,
        [userId]: peer
      }));
    });

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      Object.values(peerRefs.current).forEach(peer => peer.destroy());
      socket.current.disconnect();
    };
  }, [stream]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (tempPassword === CORRECT_PASSWORD) {
      setIsPasswordCorrect(true);
    } else {
      alert('Şifre yanlış!');
      setTempPassword('');
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (tempUsername.trim().length < 2) {
      alert('Kullanıcı adı en az 2 karakter olmalıdır!');
      return;
    }
    setUsername(tempUsername.trim());
  };

  const joinRoom = async (roomId) => {
    if (!username) {
      alert('Lütfen bir kullanıcı adı girin!');
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: noiseSuppression,
          echoCancellation: echoCancellation,
          autoGainControl: autoGainControl,
        } 
      });
      
      if (isPushToTalk) {
        audioStream.getAudioTracks()[0].enabled = false;
      }
      
      setStream(audioStream);
      audioRef.current.srcObject = audioStream;
      audioRef.current.volume = volume;

      socket.current.emit('joinRoom', { roomId, username });
      setCurrentRoom(roomId);
      setMessages([]);
    } catch (err) {
      console.error('Mikrofona erişilemedi:', err);
      alert('Mikrofona erişim izni gerekiyor!');
    }
  };

  const leaveRoom = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    Object.values(peerRefs.current).forEach(peer => peer.destroy());
    setPeers({});
    setPeerStreams({});
    peerRefs.current = {};
    socket.current.emit('leaveRoom', { roomId: currentRoom });
    setCurrentRoom(null);
    setMessages([]);
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!isMuted);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && currentRoom) {
      socket.current.emit('chatMessage', {
        room: currentRoom,
        message: newMessage,
        username
      });
      setNewMessage('');
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const updateAudioSettings = async () => {
    if (currentRoom && stream) {
      stream.getTracks().forEach(track => track.stop());
      
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: noiseSuppression,
            echoCancellation: echoCancellation,
            autoGainControl: autoGainControl,
          }
        });
        
        setStream(newStream);
        audioRef.current.srcObject = newStream;
        audioRef.current.volume = volume;
      } catch (err) {
        console.error('Ses ayarları güncellenirken hata:', err);
      }
    }
  };

  useEffect(() => {
    updateAudioSettings();
  }, [noiseSuppression, echoCancellation, autoGainControl]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isPushToTalk || !stream || isMuted) return;
      
      if (e.code === pushToTalkKey && !isRecording) {
        e.preventDefault();
        setIsRecording(true);
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = true;
      }
    };

    const handleKeyUp = (e) => {
      if (!isPushToTalk || !stream || isMuted) return;
      
      if (e.code === pushToTalkKey && isRecording) {
        setIsRecording(false);
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPushToTalk, pushToTalkKey, stream, isRecording, isMuted]);

  const handleKeySet = (e) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setIsSettingPTTKey(false);
      return;
    }
    setPushToTalkKey(e.code);
    setIsSettingPTTKey(false);
  };

  useEffect(() => {
    if (isSettingPTTKey) {
      window.addEventListener('keydown', handleKeySet);
      return () => window.removeEventListener('keydown', handleKeySet);
    }
  }, [isSettingPTTKey]);

  const renderAudioControls = () => (
    <div className="audio-controls">
      <h3>Ses Ayarları</h3>
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={isPushToTalk}
            onChange={(e) => {
              setIsPushToTalk(e.target.checked);
              if (e.target.checked && stream) {
                stream.getAudioTracks()[0].enabled = false;
                setIsRecording(false);
              } else if (stream && !isMuted) {
                stream.getAudioTracks()[0].enabled = true;
              }
            }}
          />
          Bas Konuş Modu
        </label>
      </div>
      {isPushToTalk && (
        <div className="control-group ptt-key">
          <div className="ptt-key-settings">
            <label>Bas Konuş Tuşu:</label>
            <button 
              className="key-bind-button"
              onClick={() => setIsSettingPTTKey(true)}
            >
              {isSettingPTTKey ? 'Bir tuşa basın...' : pushToTalkKey.replace('Key', '').replace('Digit', '')}
            </button>
            {isSettingPTTKey && (
              <div className="key-bind-hint">
                İptal etmek için ESC'ye basın
              </div>
            )}
          </div>
          <div className="ptt-status">
            {isRecording ? 'Konuşuyorsunuz...' : `Konuşmak için ${pushToTalkKey.replace('Key', '').replace('Digit', '')} tuşuna basılı tutun`}
          </div>
        </div>
      )}
      <div className="control-group">
        <label>Ses Seviyesi</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
          className="volume-slider"
        />
        <span>{Math.round(volume * 100)}%</span>
      </div>
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={noiseSuppression}
            onChange={(e) => setNoiseSuppression(e.target.checked)}
          />
          Gürültü Azaltma
        </label>
      </div>
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={echoCancellation}
            onChange={(e) => setEchoCancellation(e.target.checked)}
          />
          Eko Engelleme
        </label>
      </div>
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={autoGainControl}
            onChange={(e) => setAutoGainControl(e.target.checked)}
          />
          Otomatik Ses Seviyesi
        </label>
      </div>
    </div>
  );

  if (!isConnected) {
    return <div className="loading">Sunucuya bağlanılıyor...</div>;
  }

  return (
    <div className="app">
      {!username ? (
        <div className="username-container">
          <h1>Voice Chat'e Hoş Geldiniz</h1>
          {!isPasswordCorrect ? (
            <>
              <p>Devam etmek için şifreyi girin</p>
              <form onSubmit={handlePasswordSubmit} className="login-form">
                <input
                  type="password"
                  placeholder="Şifreyi girin"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  required
                />
                <button type="submit">Devam Et</button>
              </form>
            </>
          ) : (
            <>
              <p>Başlamak için kullanıcı adınızı girin</p>
              <form onSubmit={handleLogin} className="login-form">
                <input
                  type="text"
                  placeholder="Kullanıcı adınızı girin"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  minLength={2}
                  maxLength={20}
                />
                <button type="submit">Giriş Yap</button>
              </form>
            </>
          )}
        </div>
      ) : (
        <div className="main-container">
          <div className="rooms-sidebar">
            <h2>Odalar</h2>
            {rooms.map(room => (
              <div
                key={room.id}
                className={`room ${currentRoom === room.id ? 'active' : ''}`}
                onClick={() => currentRoom !== room.id && joinRoom(room.id)}
              >
                <span className="room-icon">#</span>
                <span className="room-name">{room.name}</span>
                {room.id === currentRoom && (
                  <div className="room-controls">
                    <button 
                      className={`mute-button ${isMuted ? 'muted' : ''}`} 
                      onClick={toggleMute}
                    >
                      {isMuted ? '🔇' : '🎤'}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {currentRoom && renderAudioControls()}
          </div>

          <div className="chat-container">
            {currentRoom ? (
              <>
                <div className="chat-header">
                  <div className="room-info">
                    <span className="room-icon">#</span>
                    <h3>{rooms.find(r => r.id === currentRoom)?.name}</h3>
                  </div>
                  <button onClick={leaveRoom}>Odadan Ayrıl</button>
                </div>
                <div className="messages">
                  {messages.map((msg, index) => (
                    <div key={index} className="message">
                      <div 
                        className="message-avatar"
                        style={{ backgroundColor: getRandomColor(msg.username) }}
                      >
                        {msg.username}
                      </div>
                      <div className="message-content">
                        <div className="message-header">
                          <strong>{msg.username}</strong>
                          <span className="message-time">
                            {new Date().toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="message-text">{msg.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="message-form">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                  />
                  <button type="submit">Gönder</button>
                </form>
              </>
            ) : (
              <div className="no-room">
                <h2>Sohbet etmek için bir oda seçin</h2>
              </div>
            )}
          </div>

          <div className="users-sidebar">
            <h2>Odadaki Kullanıcılar</h2>
            {usersInRoom.map(user => (
              <div key={user.id} className="user">
                <div 
                  className="user-avatar"
                  style={{ backgroundColor: getRandomColor(user.username) }}
                >
                  {user.username}
                </div>
                <span className="user-name">{user.username}</span>
                {user.id === socket.current?.id && (
                  <span className="user-status">(Sen)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <audio ref={audioRef} autoPlay />
      <div className="audio-streams">
        {Object.entries(peerStreams).map(([userId, peerStream]) => (
          <audio
            key={userId}
            autoPlay
            playsInline
            ref={audio => {
              if (audio) {
                audio.srcObject = peerStream;
                audio.volume = volume;
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default App; 
