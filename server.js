const express = require('express');
const mysql = require('mysql2');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// KONFIGURASI DATABASE
const db = mysql.createConnection({
    host: 'mysql-praktikum-submit-043.mysql.database.azure.com',
    user: 'Ayu043',
    password: process.env.DB_PASSWORD, 
    database: 'db_praktikum_submit_043',
    port: 3306,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('DATABASE ERROR:', err.message);
    } else {
        console.log('Database terhubung dengan sukses!');
    }
});

// KONFIGURASI AZURE STORAGE
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = "tugas-praktikum";

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

// Route Halaman Utama
app.get('/', (req, res) => {
    // Pastikan file index.html ada di folder yang sama dengan server.js
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route Submit Tugas
app.post('/submit-task', upload.single('file_tugas'), async (req, res) => {
    const { nim, name, class_name, course } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).send('<h1>Error</h1><p>File tidak terdeteksi. Silakan coba lagi.</p>');
    }

    try {
        // A. Upload file ke Azure Blob Storage
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(containerName);

        await containerClient.createIfNotExists({ access: 'blob' });

        const blobName = `${nim}_${Date.now()}_${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        console.log(`Sedang mengupload file: ${blobName}`);
        await blockBlobClient.uploadData(file.buffer);
        const fileUrl = blockBlobClient.url;

        // Simpan data ke MySQL
        const query = "INSERT INTO submissions (nim, name, class, course, file_url, status) VALUES (?, ?, ?, ?, ?, 'Submitted')";
        
        db.query(query, [nim, name, class_name, course, fileUrl], (err, result) => {
            if (err) {
                console.error('MySQL Insert Error:', err);
                return res.status(500).send('Gagal menyimpan data ke database.');
            }

            // Kirim Respon Sukses ke User
            res.send(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1 style="color: #28a745;">PENGIRIMAN BERHASIL!</h1>
                    <p>Halo <b>${name}</b> (NIM: ${nim}), tugas kamu sudah masuk ke Cloud Azure.</p>
                    <hr style="width: 50%; margin: 20px auto;">
                    <p style="font-size: 0.9em; color: #666;">Status: <b>Submitted</b></p>
                    <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0078d4; color: white; text-decoration: none; border-radius: 5px;">Kembali ke Form</a>
                </div>
            `);
        });

    } catch (error) {
        console.error('Sistem Error:', error);
        res.status(500).send('Terjadi kesalahan pada sistem cloud. Hubungi admin.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aplikasi berjalan di port ${PORT}`);
});
