const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = 'trace_secret_key';

// Отдаём HTML файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/:page', (req, res) => {
    res.sendFile(path.join(__dirname, req.params.page));
});

// Загруженные файлы
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// База данных
const db = mysql.createPool({
    host: 'kodama.proxy.rlwy.net',
    port: 59943,
    user: 'root',
    password: 'FLpauZCsdFUEqnlshSQVmBzWkgIbQKEZ',
    database: 'railway',
    waitForConnections: true,
    connectionLimit: 10
});

db.query('SELECT 1', () => console.log('MySQL подключён!'));

// Регистрация
app.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    console.log('Регистрация:', email);
    const hash = await bcrypt.hash(password, 10);
    db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [name, email, hash, role || 'client'],
        (err, result) => {
            if (err) {
                console.log('Ошибка БД:', err.message);
                return res.status(400).json({ error: 'Email уже занят' });
            }
            console.log('Записано в БД:', result.insertId);
            res.json({ success: true });
        }
    );
});

// Логин
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (!results.length) return res.status(401).json({ error: 'Неверный email' });
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Неверный пароль' });
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET);
        res.json({ token, role: user.role, name: user.name, id: user.id });
    });
});

// Отправка заявки
app.post('/api/applications', (req, res) => {
    const { name, phone, area, type, client_id } = req.body;
    db.query('INSERT INTO applications (name, phone, area, type, client_id) VALUES (?, ?, ?, ?, ?)',
        [name, phone, area, type, client_id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка' });
            res.json({ success: true });
        }
    );
});

// Загрузка файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
    const { client_id } = req.body;
    const filepath = '/uploads/' + req.file.filename;
    db.query('INSERT INTO files (client_id, filename, filepath) VALUES (?, ?, ?)',
        [client_id, req.file.originalname, filepath],
        (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка' });
            res.json({ success: true, filepath });
        }
    );
});

// Получить заявки (для менеджера)
app.get('/api/applications', (req, res) => {
    db.query('SELECT * FROM applications ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        res.json(results);
    });
});

// Получить файлы
app.get('/api/files', (req, res) => {
    const client_id = req.query.client_id;
    const role = req.query.role;
    let query = 'SELECT * FROM files ORDER BY created_at DESC';
    let params = [];
    if (role !== 'manager') {
        query = 'SELECT * FROM files WHERE client_id = ? ORDER BY created_at DESC';
        params = [client_id];
    }
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        res.json(results);
    });
});

app.listen(3000, () => {
    console.log('Сервер запущен на http://localhost:3000');
});