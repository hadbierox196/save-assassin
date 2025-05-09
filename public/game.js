document.addEventListener('DOMContentLoaded', () => {
    // Game elements
    const titlePage = document.getElementById('title-page');
    const lobbyPage = document.getElementById('lobby-page');
    const gamePage = document.getElementById('game-page');
    
    const playerNameInput = document.getElementById('player-name');
    const playButton = document.getElementById('play-button');
    const playerList = document.getElementById('player-list');
    const startGameButton = document.getElementById('start-game-button');
    
    const timerProgress = document.getElementById('timer-progress');
    const timerText = document.getElementById('timer-text');
    const playersGrid = document.getElementById('players-grid');
    
    const resultsOverlay = document.getElementById('results-overlay');
    const resultsContent = document.getElementById('results-content');
    const winnerAnnouncement = document.getElementById('winner-announcement');
    const winnerText = document.getElementById('winner-text');
    const playAgainButton = document.getElementById('play-again-button');
    
    // Game state
    let socket;
    let playerId;
    let playerName = '';
    let players = [];
    let choices = {
        assassinate: [],
        save: []
    };
    let touchTimer = null;
    let longPressDuration = 500; // ms for long press
    
    // Connect to server and set up event listeners
    function initializeGame() {
        socket = io();
        
        // Set player ID
        socket.on('connect', () => {
            playerId = socket.id;
        });
        
        // Update lobby with player list
        socket.on('updateLobby', (data) => {
            updatePlayerList(data.players);
        });
        
        // Game started
        socket.on('gameStarted', (data) => {
            showGamePage(data);
        });
        
        // Timer updates
        socket.on('timerUpdate', (timeLeft) => {
            updateTimer(timeLeft);
        });
        
        // Choice acknowledged
        socket.on('choiceAcknowledged', (data) => {
            updatePlayerCard(data.targetId, data.action);
        });
        
        // Round results
        socket.on('roundResults', (data) => {
            showResults(data);
        });
        
        // New round
        socket.on('newRound', (data) => {
            startNewRound(data);
        });
        
        // Game error
        socket.on('gameError', (message) => {
            alert(message);
        });
        
        // Game ended
        socket.on('gameEnded', (data) => {
            alert(`Game ended: ${data.reason}`);
            showLobbyPage();
        });
    }
    
    // UI Functions
    function showLobbyPage() {
        titlePage.classList.add('hidden');
        gamePage.classList.add('hidden');
        lobbyPage.classList.remove('hidden');
    }
    
    function showGamePage(data) {
        lobbyPage.classList.add('hidden');
        gamePage.classList.remove('hidden');
        
        updatePlayersGrid(data.players, data.scores);
        resetChoices();
    }
    
    function updatePlayerList(playersList) {
        players = playersList;
        playerList.innerHTML = '';
        
        playersList.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            if (player.id === playerId) {
                li.textContent += ' (You)';
                li.style.fontWeight = 'bold';
            }
            playerList.appendChild(li);
        });
        
        // Enable start button if enough players
        startGameButton.disabled = playersList.length < 2;
    }
    
    function updatePlayersGrid(playersList, scores) {
        players = playersList;
        playersGrid.innerHTML = '';
        
        playersList.forEach(player => {
            // Don't create card for current player
            if (player.id === playerId) return;
            
            const playerCard = document.createElement('div');
            playerCard.className = 'player-card';
            playerCard.dataset.playerId = player.id;
            
            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.textContent = player.name;
            
            const playerScore = document.createElement('div');
            playerScore.className = 'player-score';
            playerScore.textContent = scores[player.id];
            
            const scoreChange = document.createElement('div');
            scoreChange.className = 'score-change';
            
            const actionIndicator = document.createElement('div');
            actionIndicator.className = 'action-indicator hidden';
            
            playerCard.appendChild(playerName);
            playerCard.appendChild(playerScore);
            playerCard.appendChild(scoreChange);
            playerCard.appendChild(actionIndicator);
            
            // Touch events for mobile
            playerCard.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleTouchStart(player.id);
            });
            
            playerCard.addEventListener('touchend', (e) => {
                e.preventDefault();
                handleTouchEnd(player.id);
            });
            
            playerCard.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                cancelTouch();
            });
            
            // Mouse events for desktop
            playerCard.addEventListener('mousedown', () => {
                handleTouchStart(player.id);
            });
            
            playerCard.addEventListener('mouseup', () => {
                handleTouchEnd(player.id);
            });
            
            playerCard.addEventListener('mouseleave', () => {
                cancelTouch();
            });
            
            playersGrid.appendChild(playerCard);
        });
        
        // Add current player's card (disabled)
        const currentPlayer = playersList.find(p => p.id === playerId);
        if (currentPlayer) {
            const selfCard = document.createElement('div');
            selfCard.className = 'player-card self';
            
            const selfName = document.createElement('div');
            selfName.className = 'player-name';
            selfName.textContent = currentPlayer.name + ' (You)';
            
            const selfScore = document.createElement('div');
            selfScore.className = 'player-score';
            selfScore.textContent = scores[playerId];
            
            selfCard.appendChild(selfName);
            selfCard.appendChild(selfScore);
            
            playersGrid.appendChild(selfCard);
        }
    }
    
    function updateTimer(timeLeft) {
        const percentage = (timeLeft / 45) * 100;
        timerProgress.style.width = `${percentage}%`;
        timerText.textContent = timeLeft;
        
        if (timeLeft <= 10) {
            timerProgress.style.backgroundColor = '#ff6666';
        } else {
            timerProgress.style.backgroundColor = '#ffffff';
        }
    }
    
    function resetChoices() {
        choices = {
            assassinate: [],
            save: []
        };
        
        // Reset visual indicators
        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('save-action', 'assassinate-action');
            const indicator = card.querySelector('.action-indicator');
            if (indicator) {
                indicator.classList.add('hidden');
                indicator.classList.remove('save-indicator', 'assassinate-indicator');
            }
        });
    }
    
    function updatePlayerCard(targetId, action) {
        const card = document.querySelector(`.player-card[data-player-id="${targetId}"]`);
        if (!card) return;
        
        // Remove previous action classes
        card.classList.remove('save-action', 'assassinate-action');
        
        // Add new action class
        if (action === 'save') {
            card.classList.add('save-action');
        } else if (action === 'assassinate') {
            card.classList.add('assassinate-action');
        }
        
        // Update indicator
        const indicator = card.querySelector('.action-indicator');
        if (indicator) {
            indicator.classList.remove('hidden', 'save-indicator', 'assassinate-indicator');
            
            if (action === 'save') {
                indicator.textContent = 'SAVED';
                indicator.classList.add('save-indicator');
            } else if (action === 'assassinate') {
                indicator.textContent = 'ASSASSINATED';
                indicator.classList.add('assassinate-indicator');
            } else {
                indicator.classList.add('hidden');
            }
        }
    }
    
    function showResults(data) {
        resultsContent.innerHTML = '';
        
        // Process results for each player
        players.forEach(player => {
            const playerResults = data.results[player.
