const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS ayarları
app.use(cors({
  origin: ["https://voice-chat-1-abfk.onrender.com", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true,
  allowedHeaders: ["my-custom-header"]
}));

// Socket.io setup
const io = require("socket.io")(server, {
    cors: {
        origin: ["https://voice-chat-1-abfk.onrender.com", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["my-custom-header"],
        transports: ['polling', 'websocket']
    },
    pingTimeout: 120000,
    pingInterval: 10000,
    connectTimeout: 60000,
    path: '/socket.io/',
    serveClient: false,
    allowUpgrades: true,
    upgradeTimeout: 30000,
    cookie: false
});

// React build klasörünü sun
app.use(express.static(path.join(__dirname, 'build')));

// Odalar ve kullanıcıları takip et
const rooms = {
    'oda1': { users: new Map() },
    'oda2': { users: new Map() },
    'oda3': { users: new Map() }
};

// API testi (isteğe bağlı)
app.get("/api", (req, res) => {
    res.send("Sesli sohbet sunucusu çalışıyor");
});

// React router için fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Socket.io olayları
io.on("connection", (socket) => {
    console.log('Yeni kullanıcı bağlandı:', socket.id);
    
    // Bağlantı kontrolü
    socket.conn.on("packet", ({ type }) => {
      if (type === "ping") console.log(`[${socket.id}] ping`);
    });
    
    socket.conn.on("close", (reason) => {
      console.log(`[${socket.id}] bağlantı kapandı: ${reason}`);
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        console.log(`${username} (${socket.id}) odaya katılıyor: ${roomId}`);
        
        // Önceki odadan çık
        const previousRoom = [...socket.rooms].find(room => rooms[room]);
        if (previousRoom) {
            console.log(`${username} (${socket.id}) önceki odadan çıkıyor: ${previousRoom}`);
            socket.leave(previousRoom);
            rooms[previousRoom].users.delete(socket.id);
            io.to(previousRoom).emit('roomUsers',
                Array.from(rooms[previousRoom].users.values())
            );
            
            // Odadan ayrılma bildirimi
            io.to(previousRoom).emit('message', {
                username: 'Sistem',
                text: `${username} odadan ayrıldı`
            });
            
            // Diğer kullanıcılara bildirim gönder
            rooms[previousRoom].users.forEach((user, userId) => {
                io.to(userId).emit('userLeft', { 
                    userId: socket.id, 
                    username 
                });
            });
        }

        // Yeni odaya katıl
        socket.join(roomId);
        rooms[roomId].users.set(socket.id, { id: socket.id, username });

        // Odadaki kullanıcıları güncelle
        const usersInRoom = Array.from(rooms[roomId].users.values());
        console.log(`Odadaki kullanıcılar: ${JSON.stringify(usersInRoom)}`);
        io.to(roomId).emit('roomUsers', usersInRoom);

        // Hoş geldin mesajı - tüm odadaki kullanıcılara gönder
        io.to(roomId).emit('message', {
            username: 'Sistem',
            text: `${username} odaya katıldı`
        });

        // Mevcut kullanıcılara yeni kullanıcıyı bildir ve
        // Yeni kullanıcıya mevcut kullanıcıları bildir
        rooms[roomId].users.forEach((user, userId) => {
            if (userId !== socket.id) {
                console.log(`Kullanıcı bildiriliyor: ${user.username} <-> ${username}`);
                socket.emit('userJoined', { userId, username: user.username });
                io.to(userId).emit('userJoined', { userId: socket.id, username });
            }
        });
    });

    socket.on('leaveRoom', ({ roomId }) => {
        if (rooms[roomId] && rooms[roomId].users.has(socket.id)) {
            const user = rooms[roomId].users.get(socket.id);
            console.log(`${user.username} (${socket.id}) odadan ayrılıyor: ${roomId}`);
            rooms[roomId].users.delete(socket.id);
            socket.leave(roomId);

            // Odadaki kullanıcıları güncelle
            io.to(roomId).emit('roomUsers',
                Array.from(rooms[roomId].users.values())
            );

            // Odadan ayrılma bildirimi - tüm odadaki kullanıcılara gönder
            io.to(roomId).emit('message', {
                username: 'Sistem',
                text: `${user.username} odadan ayrıldı`
            });

            // Diğer kullanıcılara bildirim gönder
            rooms[roomId].users.forEach((otherUser, userId) => {
                io.to(userId).emit('userLeft', { 
                    userId: socket.id, 
                    username: user.username 
                });
            });
        }
    });

    socket.on('chatMessage', ({ room, message, username }) => {
        console.log(`Mesaj gönderiliyor: ${username} -> ${room}: ${message}`);
        io.to(room).emit('message', {
            username,
            text: message
        });
    });

    // WebRTC sinyal olayları
    socket.on('signal', ({ userId, signal }) => {
        console.log(`Sinyal iletiliyor: ${socket.id} -> ${userId}`);
        
        // Hedef kullanıcıya sinyali ilet
        if (io.sockets.sockets.has(userId)) {
            io.to(userId).emit('signal', { userId: socket.id, signal });
            console.log(`Sinyal başarıyla iletildi: ${socket.id} -> ${userId}`);
        } else {
            console.log(`Hedef kullanıcı bulunamadı: ${userId}`);
        }
    });

    socket.on("disconnect", () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        Object.keys(rooms).forEach(roomId => {
            if (rooms[roomId].users.has(socket.id)) {
                const user = rooms[roomId].users.get(socket.id);
                rooms[roomId].users.delete(socket.id);

                // Odadaki kullanıcıları güncelle
                io.to(roomId).emit('roomUsers',
                    Array.from(rooms[roomId].users.values())
                );

                // Bağlantı kesilme bildirimi - tüm odadaki kullanıcılara gönder
                io.to(roomId).emit('message', {
                    username: 'Sistem',
                    text: `${user.username} bağlantısı kesildi`
                });
                
                // Diğer kullanıcılara bildirim gönder
                rooms[roomId].users.forEach((otherUser, userId) => {
                    io.to(userId).emit('userLeft', { 
                        userId: socket.id, 
                        username: user.username 
                    });
                });
            }
        });
    });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});
