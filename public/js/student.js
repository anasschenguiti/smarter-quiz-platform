const socket = io();

document.getElementById('join-game').addEventListener('click', () => {
    const code = document.getElementById('game-code').value;
    socket.emit('join game', code);
});

socket.on('join success', (message) => {
    alert(message);
    document.getElementById('question').classList.remove('hidden');
});

socket.on('new question', (question) => {
    document.getElementById('question-text').textContent = question.text;
    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = '';
    question.options.forEach((option) => {
        const button = document.createElement('button');
        button.textContent = option;
        button.className = 'w-full bg-gray-200 p-2 rounded hover:bg-gray-300';
        button.addEventListener('click', () => {
            socket.emit('submit answer', { gameCode: document.getElementById('game-code').value, questionId: question._id, answer: option });
        });
        optionsDiv.appendChild(button);
    });
})