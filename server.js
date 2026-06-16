const express = require('express');
const mysql = require('mysql2');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path'); // TAMBAHAN: Perlu ini untuk mencari file

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public')); 
app.use(express.urlencoded({ extended: true }));

// --- ROUTE BARU: Menampilkan Halaman Utama ---
app.get('/', (req, res) => {
    // Ini akan mengirim file index.html saat kamu buka alamat websitenya
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Koneksi Database
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

// Cek koneksi agar muncul di Log Azure jika error
db.connect(err => {
    if (err) console.error('Database connection error:', err);
    else console.log('Database connected!');
});

// Koneksi Blob Storage
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// Endpoint untuk submit tugas
app.post('/submit-task', upload.single('file_tugas'), async (req, res) => {
    try {
        const { nim, name, class_name, course } = req.body;
        
        // Cek apakah file ada agar tidak error saat baca originalname
        if (!req.file) {
            return res.status(400).send("Gagal: Tidak ada file yang dipilih.");
        }

        const blobName = `${nim}_${Date.now()}_${req.file.originalname}`;

        // 1. Upload ke Blob Storage
        const containerClient = blobServiceClient.getContainerClient('tugas-praktikum');
        
        // Tambahkan ini: Membuat kontainer otomatis jika belum ada
        await containerClient.createIfNotExists({ access: 'blob' });

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(req.file.buffer);
        const fileUrl = blockBlobClient.url;

        // 2. Simpan data ke MySQL
        const sql = "INSERT INTO submissions (nim, name, class, course, file_url) VALUES (?, ?, ?, ?, ?)";
        db.query(sql, [nim, name, class_name, course, fileUrl], (err) => {
            if (err) {
                console.error('MySQL Error:', err);
                return res.status(500).send("Gagal simpan ke database: " + err.message);
            }
            res.send("<h1>Tugas Berhasil Dikirim!</h1><a href='/'>Kembali</a>");
        });
    } catch (err) {
        console.error('Server Error:', err);
        res.status(500).send("Error Sistem: " + err.message);
    }
});

// Port (Azure menggunakan process.env.PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
