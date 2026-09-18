const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/game';
const client = new MongoClient(uri);

async function connectToDatabase() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        return client.db('game');
    } catch (error) {
        console.error('Failed to connect to MongoDB', error);
        process.exit(1);
    }
}

let db;
connectToDatabase()
    .then((database) => {
        db = database;
    })
    .catch(console.error);

app.use(express.static('public'));
app.use(express.json());

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create game', async () => {
        try {
            if (!db) {
                socket.emit('error', 'Database not connected');
                return;
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const game = {
                code,
                admin: socket.id,
                players: [],
                questions: [],
                currentQuestion: 0,
                pendingAnswers: {},
                answers: {},
                correctAnswers: {},
                scores: {},
                playerNames: {}
            };
            await db.collection('games').insertOne(game);
            socket.emit('game code', code);
            console.log(`Game created with code: ${code}`);
        } catch (error) {
            console.error('Error creating game:', error);
            socket.emit('error', 'Failed to create game');
        }
    });

    socket.on('join game', async (data) => {
        try {
            if (!db) {
                socket.emit('error', 'Database not connected');
                return;
            }

            const { code, playerName } = data;
            const game = await db.collection('games').findOne({ code });

            if (game) {
                if (!game.players.includes(socket.id)) {
                    game.players.push(socket.id);
                    game.scores[socket.id] = 0;
                    game.playerNames[socket.id] = playerName;

                    await db.collection('games').updateOne({ code }, {
                        $set: {
                            players: game.players,
                            scores: game.scores,
                            playerNames: game.playerNames
                        }
                    });
                }
                socket.join(code);
                socket.emit('join success', {
                    message: 'Successfully joined the game!',
                    playerName: playerName
                });
                io.to(game.admin).emit('player count', {
                    count: game.players.length,
                    playerName: playerName
                });
                console.log(`Player ${playerName} (${socket.id}) joined game: ${code}`);
            } else {
                socket.emit('error', 'Invalid game code');
            }
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('error', 'Failed to join game');
        }
    });

    socket.on('start game', async ({ code, numberOfQuestions }) => {
        try {
            if (!db) {
                socket.emit('error', 'Database not connected');
                return;
            }

            const game = await db.collection('games').findOne({ code });
            if (game && game.admin === socket.id) {
                const questions = await db.collection('questions').find().limit(numberOfQuestions).toArray();
                game.questions = questions;
                await db.collection('games').updateOne({ code }, {
                    $set: {
                        questions,
                        currentQuestion: 0,
                        pendingAnswers: {},
                        answers: {},
                        correctAnswers: {},
                        scores: game.scores
                    }
                });

                io.to(code).emit('game started');
                sendQuestion(game);
            }
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', 'Failed to start game');
        }
    });

    socket.on('submit answer', async ({ code, questionId, answer }) => {
        try {
            if (!db) {
                socket.emit('error', 'Database not connected');
                return;
            }

            const game = await db.collection('games').findOne({ code });
            if (!game) return;

            const question = game.questions.find(q => q._id.toString() === questionId);
            const isCorrect = question && question.CORRECTRESPONSE === answer;

            // Store the answer but don't update score yet
            if (!game.pendingAnswers[questionId]) {
                game.pendingAnswers[questionId] = {};
            }
            game.pendingAnswers[questionId][socket.id] = {
                answer,
                isCorrect
            };

            await db.collection('games').updateOne({ code }, {
                $set: { pendingAnswers: game.pendingAnswers }
            });

            // Send immediate feedback to the player without updating score
            socket.emit('answer result', {
                isCorrect,
                selectedAnswer: answer,
                correctAnswer: question.CORRECTRESPONSE,
                score: game.scores[socket.id],
                playerName: game.playerNames[socket.id]
            });

        } catch (error) {
            console.error('Error submitting answer:', error);
            socket.emit('error', 'Failed to submit answer');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

async function sendQuestion(game) {
    try {
        if (game.currentQuestion >= game.questions.length) {
            const currentGame = await db.collection('games').findOne({ code: game.code });

            const topPlayers = Object.entries(currentGame.scores)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([playerId, score]) => ({
                    playerName: currentGame.playerNames[playerId],
                    score
                }));

            currentGame.players.forEach(playerId => {
                const playerScore = currentGame.scores[playerId] || 0;
                const correctAnswersCount = Object.values(currentGame.correctAnswers)
                    .filter(players => players.includes(playerId)).length;

                io.to(playerId).emit('game over', {
                    score: playerScore,
                    correctAnswers: correctAnswersCount,
                    totalQuestions: currentGame.questions.length,
                    playerName: currentGame.playerNames[playerId]
                });
            });

            io.to(currentGame.admin).emit('game over admin', {
                topPlayers
            });

            return;
        }

        const question = game.questions[game.currentQuestion];
        const options = [
            question.CORRECTRESPONSE,
            question.RESPONSE2,
            question.RESPONSE3,
            question.RESPONSE4
        ].sort(() => Math.random() - 0.5);

        io.to(game.code).emit('new question', {
            _id: question._id,
            question: question.QUESTION,
            options: options,
            questionNumber: game.currentQuestion + 1,
            totalQuestions: game.questions.length
        });

        // Wait for 15 seconds before processing answers and updating scores
        setTimeout(async () => {
            const updatedGame = await db.collection('games').findOne({ code: game.code });
            const questionId = question._id.toString();
            const pendingAnswers = updatedGame.pendingAnswers[questionId] || {};

            // Process all pending answers and update scores
            for (const [playerId, answerData] of Object.entries(pendingAnswers)) {
                if (answerData.isCorrect) {
                    updatedGame.scores[playerId] = (updatedGame.scores[playerId] || 0) + 1;

                    if (!updatedGame.correctAnswers[questionId]) {
                        updatedGame.correctAnswers[questionId] = [];
                    }
                    if (!updatedGame.correctAnswers[questionId].includes(playerId)) {
                        updatedGame.correctAnswers[questionId].push(playerId);
                    }
                }
            }

            // Update answers in the database
            updatedGame.answers = { ...updatedGame.answers, [questionId]: pendingAnswers };

            // Update the game in the database
            await db.collection('games').updateOne({ code: game.code }, {
                $set: {
                    answers: updatedGame.answers,
                    correctAnswers: updatedGame.correctAnswers,
                    scores: updatedGame.scores
                }
            });

            // Send updated results to all players
            io.to(game.code).emit('question result', {
                correctAnswer: question.CORRECTRESPONSE,
                answers: updatedGame.answers[questionId],
                scores: updatedGame.scores,
                playerNames: updatedGame.playerNames
            });

            // Send individual score updates to each player
            Object.entries(pendingAnswers).forEach(([playerId, answerData]) => {
                io.to(playerId).emit('force result reveal', {
                    isCorrect: answerData.isCorrect,
                    score: updatedGame.scores[playerId],
                    correctAnswer: question.CORRECTRESPONSE
                });
            });

            game.currentQuestion++;
            await db.collection('games').updateOne({ code: game.code }, {
                $set: { 
                    currentQuestion: game.currentQuestion,
                    [`pendingAnswers.${questionId}`]: {} // Clear pending answers for this question
                }
            });

            setTimeout(() => sendQuestion(game), 5000);
        }, 15000);
    } catch (error) {
        console.error('Error sending question:', error);
    }
}

// Dans server.js
app.get('/api/training/questions', async (req, res) => {
    try {
        if (!db) {
            res.status(500).json({ error: 'Database not connected' });
            return;
        }

        const size = parseInt(req.query.count) || 10; // Récupérer le nombre depuis la requête

        const questions = await db.collection('questions')
            .aggregate([{ $sample: { size: size } }])
            .toArray();

        res.json(questions);
    } catch (error) {
        console.error('Error fetching training questions:', error);
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    await client.close();
    console.log('MongoDB connection closed');
    process.exit(0);
});