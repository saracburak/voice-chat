const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS ayarları
app.use(cors());

// Socket.io setup
const io = require("socket.io")(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
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

    socket.on('joinRoom', ({ roomId, username }) => {
        // Önceki odadan çık
        const previousRoom = [...socket.rooms].find(room => rooms[room]);
        if (previousRoom) {
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
        }

        // Yeni odaya katıl
        socket.join(roomId);
        rooms[roomId].users.set(socket.id, { id: socket.id, username });

        // Odadaki kullanıcıları güncelle
        io.to(roomId).emit('roomUsers',
            Array.from(rooms[roomId].users.values())
        );

        // Hoş geldin mesajı - tüm odadaki kullanıcılara gönder
        io.to(roomId).emit('message', {
            username: 'Sistem',
            text: `${username} odaya katıldı`
        });

        // Mevcut kullanıcılara yeni kullanıcıyı bildir
        rooms[roomId].users.forEach((user, userId) => {
            if (userId !== socket.id) {
                // Yeni kullanıcıya mevcut kullanıcıları bildir
                socket.emit('userJoined', { userId, username: user.username });
                // Mevcut kullanıcılara yeni kullanıcıyı bildir
                io.to(userId).emit('userJoined', { userId: socket.id, username });
            }
        });
    });

    socket.on('leaveRoom', ({ roomId }) => {
        if (rooms[roomId]) {
            const user = rooms[roomId].users.get(socket.id);
            if (user) {
                rooms[roomId].users.delete(socket.id);
                socket.leave(roomId);

                io.to(roomId).emit('roomUsers',
                    Array.from(rooms[roomId].users.values())
                );

                // Odadan ayrılma bildirimi - tüm odadaki kullanıcılara gönder
                io.to(roomId).emit('message', {
                    username: 'Sistem',
                    text: `${user.username} odadan ayrıldı`
                });
            }
        }
    });

    socket.on('chatMessage', ({ room, message, username }) => {
        io.to(room).emit('message', {
            username,
            text: message
        });
    });

    // WebRTC sinyal olayları
    socket.on('signal', ({ userId, signal }) => {
        console.log(`Sinyal iletiliyor: ${socket.id} -> ${userId}`);
        io.to(userId).emit('signal', { userId: socket.id, signal });
    });

    socket.on("disconnect", () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
        Object.keys(rooms).forEach(roomId => {
            if (rooms[roomId].users.has(socket.id)) {
                const user = rooms[roomId].users.get(socket.id);
                rooms[roomId].users.delete(socket.id);

                io.to(roomId).emit('roomUsers',
                    Array.from(rooms[roomId].users.values())
                );

                // Bağlantı kesilme bildirimi - tüm odadaki kullanıcılara gönder
                io.to(roomId).emit('message', {
                    username: 'Sistem',
                    text: `${user.username} bağlantısı kesildi`
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
