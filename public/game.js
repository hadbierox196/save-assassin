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
    
    // Initialize game on play button click
    playButton.addEventListener('click', () => {
        playerName = playerNameInput.value.trim();
        if (!playerName) {
            alert('Please enter your name to play');
            return;
        }
        
        initializeGame();
        socket.emit('joinLobby', playerName);
        showLobbyPage();
    });
    
    // Start game on button click
    startGameButton.addEventListener('click', () => {
        socket.emit('startGame');
    });
    
    // Play again button
    playAgainButton.addEventListener('click', () => {
        socket.emit('playAgain');
        resultsOverlay.classList.add('hidden');
        winnerAnnouncement.classList.add('hidden');
    });
    
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
    
    // Touch handling functions
    function handleTouchStart(playerId) {
        // Cancel any existing timer
        cancelTouch();
        
        // Start a new timer for long press detection
        touchTimer = setTimeout(() => {
            // Long press detected - assassinate action
            makeChoice(playerId, 'assassinate');
            touchTimer = null;
        }, longPressDuration);
    }
    
    function handleTouchEnd(playerId) {
        // If timer still exists, it was a short tap - save action
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
            makeChoice(playerId, 'save');
        }
    }
    
    function cancelTouch() {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    }
    
    function makeChoice(targetId, action) {
        // Update local choices
        if (action === 'assassinate') {
            choices.assassinate.push(targetId);
            choices.save = choices.save.filter(id => id !== targetId);
        } else if (action === 'save') {
            choices.save.push(targetId);
            choices.assassinate = choices.assassinate.filter(id => id !== targetId);
        }
        
        // Send choice to server
        socket.emit('makeChoice', {
            targetId: targetId,
            action: action
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
        winnerAnnouncement.classList.add('hidden');
        
        // Process results for each player
        players.forEach(player => {
            const playerResults = data.results[player.id];
            if (!playerResults || playerResults.length === 0) return;
            
            const resultDiv = document.createElement('div');
            resultDiv.className = 'result-item';
            
            const playerHeader = document.createElement('h3');
            playerHeader.textContent = player.id === playerId ? 'You' : player.name;
            resultDiv.appendChild(playerHeader);
            
            const resultsList = document.createElement('ul');
            
            // Add each result for this player
            playerResults.forEach(result => {
                const resultItem = document.createElement('li');
                let text = '';
                
                if (result.action === 'assassinated') {
                    text = `${result.from === 'anonymous' ? 'Someone' : (result.from === playerId ? 'You' : players.find(p => p.id === result.from)?.name)} assassinated ${player.id === playerId ? 'you' : 'them'} (${result.points})`;
                } else if (result.action === 'saved') {
                    text = `${result.from === 'anonymous' ? 'Someone' : (result.from === playerId ? 'You' : players.find(p => p.id === result.from)?.name)} saved ${player.id === playerId ? 'you' : 'them'} (${result.points > 0 ? '+' + result.points : result.points})`;
                }
                
                resultItem.textContent = text;
                resultsList.appendChild(resultItem);
                
                // Show score change animation on player cards
                if (player.id !== playerId) {
                    const scoreChangeEl = document.querySelector(`.player-card[data-player-id="${player.id}"] .score-change`);
                    if (scoreChangeEl) {
                        if (result.points > 0) {
                            scoreChangeEl.textContent = '+' + result.points;
                            scoreChangeEl.className = 'score-change score-increase visible';
                        } else {
                            scoreChangeEl.textContent = result.points;
                            scoreChangeEl.className = 'score-change score-decrease visible';
                        }
                        
                        // Remove animation class after animation completes
                        setTimeout(() => {
                            scoreChangeEl.classList.remove('visible');
                        }, 1500);
                    }
                }
            });
            
            resultDiv.appendChild(resultsList);
            resultsContent.appendChild(resultDiv);
        });
        
        // Update scores on player cards
        players.forEach(player => {
            const scoreEl = document.querySelector(`.player-card[data-player-id="${player.id}"] .player-score`);
            if (scoreEl) {
                scoreEl.textContent = data.scores[player.id];
            }
            
            // Update self score
            if (player.id === playerId) {
                const selfScoreEl = document.querySelector('.player-card.self .player-score');
                if (selfScoreEl) {
                    selfScoreEl.textContent = data.scores[player.id];
                }
            }
        });
        
        // Check for winner
        if (data.winner) {
            winnerAnnouncement.classList.remove('hidden');
            winnerText.textContent = `${data.winner.id === playerId ? 'You won' : data.winner.name + ' won'}!`;
        }
        
        resultsOverlay.classList.remove('hidden');
    }
    
    function startNewRound(data) {
        resultsOverlay.classList.add('hidden');
        updatePlayersGrid(data.players, data.scores);
        resetChoices();
    }
});
