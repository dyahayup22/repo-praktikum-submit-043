const express = require('express');
const mysql = require('mysql2');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// --- ROUTE UTAMA ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- KONFIGURASI DATABASE (MENGGUNAKAN POOL AGAR TIDAK DISCONNECT) ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
});

// Koneksi Blob Storage
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// Endpoint untuk submit tugas
app.post('/submit-task', upload.single('file_tugas'), async (req, res) => {
    try {
        const { nim, name, class_name, course } = req.body;
        
        if (!req.file) return res.status(400).send("Pilih file terlebih dahulu.");

        const blobName = `${nim}_${Date.now()}_${req.file.originalname}`;

        // 1. Upload ke Blob Storage
        const containerClient = blobServiceClient.getContainerClient('tugas-praktikum');
        await containerClient.createIfNotExists({ access: 'blob' });

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(req.file.buffer);
        const fileUrl = blockBlobClient.url;

        // 2. Simpan ke MySQL menggunakan pool.query
        const sql = "INSERT INTO submissions (nim, name, class, course, file_url) VALUES (?, ?, ?, ?, ?)";
        pool.query(sql, [nim, name, class_name, course, fileUrl], (err) => {
            if (err) {
                console.error('MySQL Error:', err);
                return res.status(500).send("Gagal simpan ke database: " + err.message);
            }
            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #28a745;">BERHASIL!</h1>
                    <p>Tugas <b>${name}</b> sudah tersimpan di Azure.</p>
                    <a href="/">Kembali</a>
                </div>
            `);
        });
    } catch (err) {
        res.status(500).send("Error Sistem: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
