const socket = io();

document.getElementById('create-game').addEventListener('click', () => {
    socket.emit('create game');
});

socket.on('game code', (code) => {
    document.getElementById('game-code').classList.remove('hidden');
    document.getElementById('code').textContent = code;
});

socket.on('student joined', (studentId) => {
    const studentList = document.getElementById('student-list');
    const li = document.createElement('li');
    li.textContent = studentId;
    studentList.appendChild(li);
});

document.getElementById('send-question').addEventListener('click', () => {
    const text = document.getElementById('question-text').value;
    const options = document.getElementById('question-options').value.split(',');
    const correctAnswer = document.getElementById('correct-answer').value;
    socket.emit('send question', { text, options, correctAnswer });
});