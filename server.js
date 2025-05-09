const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const rooms = {};

// Socket connection
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Player joins lobby
  socket.on('joinLobby', (playerName) => {
    // Create a default room if none exists
    if (!rooms['mainLobby']) {
      rooms['mainLobby'] = {
        players: {},
        gameInProgress: false,
        timer: null,
        choices: {},
        scores: {}
      };
    }
    
    const room = rooms['mainLobby'];
    
    // Add player to the room
    room.players[socket.id] = {
      id: socket.id,
      name: playerName
    };
    
    room.scores[socket.id] = 0;
    
    socket.join('mainLobby');
    
    // Send updated player list to all clients in the lobby
    io.to('mainLobby').emit('updateLobby', {
      players: Object.values(room.players),
      gameInProgress: room.gameInProgress
    });
  });
  
  // Start game
  socket.on('startGame', () => {
    const room = rooms['mainLobby'];
    
    if (Object.keys(room.players).length < 2) {
      socket.emit('gameError', 'Need at least 2 players to start the game');
      return;
    }
    
    room.gameInProgress = true;
    room.choices = {};
    
    // Start the timer (45 seconds)
    let timeLeft = 45;
    room.timer = setInterval(() => {
      io.to('mainLobby').emit('timerUpdate', timeLeft);
      
      if (timeLeft <= 0) {
        clearInterval(room.timer);
        calculateResults(room);
      }
      
      timeLeft--;
    }, 1000);
    
    // Send game start signal to all clients
    io.to('mainLobby').emit('gameStarted', {
      players: Object.values(room.players),
      scores: room.scores
    });
  });
  
  // Player makes a choice
  socket.on('makeChoice', (data) => {
    const room = rooms['mainLobby'];
    
    if (!room || !room.gameInProgress) return;
    
    if (!room.choices[socket.id]) {
      room.choices[socket.id] = {
        assassinate: [],
        save: []
      };
    }
    
    if (data.action === 'assassinate') {
      // Add to assassinate list if not already there
      if (!room.choices[socket.id].assassinate.includes(data.targetId)) {
        room.choices[socket.id].assassinate.push(data.targetId);
      }
      // Remove from save list if it was there
      room.choices[socket.id].save = room.choices[socket.id].save.filter(id => id !== data.targetId);
    } else if (data.action === 'save') {
      // Add to save list if not already there
      if (!room.choices[socket.id].save.includes(data.targetId)) {
        room.choices[socket.id].save.push(data.targetId);
      }
      // Remove from assassinate list if it was there
      room.choices[socket.id].assassinate = room.choices[socket.id].assassinate.filter(id => id !== data.targetId);
    }
    
    // Send acknowledgment back to the player
    socket.emit('choiceAcknowledged', {
      targetId: data.targetId,
      action: data.action
    });
  });
  
  // Player disconnects
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove player from all rooms
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        delete room.scores[socket.id];
        
        // Update the remaining players
        io.to(roomId).emit('updateLobby', {
          players: Object.values(room.players),
          gameInProgress: room.gameInProgress
        });
        
        // End the game if less than 2 players
        if (room.gameInProgress && Object.keys(room.players).length < 2) {
          clearInterval(room.timer);
          room.gameInProgress = false;
          io.to(roomId).emit('gameEnded', { reason: 'Not enough players' });
        }
      }
    });
  });
  
  // Play again
  socket.on('playAgain', () => {
    const room = rooms['mainLobby'];
    if (room) {
      room.gameInProgress = false;
      io.to('mainLobby').emit('updateLobby', {
        players: Object.values(room.players),
        gameInProgress: false
      });
    }
  });
});

// Calculate game results
function calculateResults(room) {
  const results = {};
  const scoreChanges = {};
  
  // Initialize score changes for all players
  Object.keys(room.players).forEach(playerId => {
    scoreChanges[playerId] = 0;
  });
  
  // Process all choices
  Object.keys(room.choices).forEach(playerId => {
    const playerChoices = room.choices[playerId];
    
    // Process assassinations
    playerChoices.assassinate.forEach(targetId => {
      // Check if target saved this player
      const targetSavedThisPlayer = room.choices[targetId]?.save.includes(playerId);
      
      if (targetSavedThisPlayer) {
        // Target saved attacker but got assassinated: -2 for target, +2 for attacker
        scoreChanges[targetId] -= 2;
        scoreChanges[playerId] += 2;
        
        // Record result
        if (!results[targetId]) results[targetId] = [];
        if (!results[playerId]) results[playerId] = [];
        
        results[targetId].push({ from: playerId, action: 'assassinated', points: -2 });
        results[playerId].push({ from: targetId, action: 'saved', points: 2 });
      } else {
        // Normal assassination: -1 for target
        scoreChanges[targetId] -= 1;
        
        // Record result
        if (!results[targetId]) results[targetId] = [];
        results[targetId].push({ from: 'anonymous', action: 'assassinated', points: -1 });
      }
    });
    
    // Process saves (that weren't already processed in assassinations)
    playerChoices.save.forEach(targetId => {
      // Check if target also saved this player (mutual save)
      const targetSavedThisPlayer = room.choices[targetId]?.save.includes(playerId);
      const thisPlayerAssassinatedTarget = room.choices[playerId]?.assassinate.includes(targetId);
      const targetAssassinatedThisPlayer = room.choices[targetId]?.assassinate.includes(playerId);
      
      // Skip if already handled by assassination logic or if there was any assassination involved
      if (thisPlayerAssassinatedTarget || targetAssassinatedThisPlayer) {
        return;
      }
      
      if (targetSavedThisPlayer) {
        // Mutual save: +2 for both
        scoreChanges[playerId] += 2;
        scoreChanges[targetId] += 2;
        
        // Record result
        if (!results[playerId]) results[playerId] = [];
        if (!results[targetId]) results[targetId] = [];
        
        results[playerId].push({ from: targetId, action: 'saved', points: 2 });
        results[targetId].push({ from: playerId, action: 'saved', points: 2 });
      } else {
        // Normal save: +1 for target
        scoreChanges[targetId] += 1;
        
        // Record result
        if (!results[targetId]) results[targetId] = [];
        results[targetId].push({ from: 'anonymous', action: 'saved', points: 1 });
      }
    });
  });
  
  // Apply score changes
  Object.keys(scoreChanges).forEach(playerId => {
    room.scores[playerId] += scoreChanges[playerId];
  });
  
  // Check for winner (score of 5 or more)
  let winner = null;
  Object.keys(room.scores).forEach(playerId => {
    if (room.scores[playerId] >= 5) {
      winner = room.players[playerId];
    }
  });
  
  // Send results to all players
  io.to('mainLobby').emit('roundResults', {
    results: results,
    scores: room.scores,
    winner: winner
  });
  
  // Reset for next round or end game
  if (winner) {
    room.gameInProgress = false;
    Object.keys(room.scores).forEach(playerId => {
      room.scores[playerId] = 0;
    });
  } else {
    // Start a new round after 5 seconds
    setTimeout(() => {
      if (Object.keys(room.players).length >= 2) {
        room.choices = {};
        let timeLeft = 45;
        room.timer = setInterval(() => {
          io.to('mainLobby').emit('timerUpdate', timeLeft);
          
          if (timeLeft <= 0) {
            clearInterval(room.timer);
            calculateResults(room);
          }
          
          timeLeft--;
        }, 1000);
        
        io.to('mainLobby').emit('newRound', {
          players: Object.values(room.players),
          scores: room.scores
        });
      }
    }, 5000);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
