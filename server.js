const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

// --- CONFIG SUPABASE (SAMA SEPERTI SEBELUMNYA) ---
const SUPABASE_URL = 'https://ukczpgjppfhnuaedgtee.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrY3pwZ2pwcGZobnVhZWRndGVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Nzk5NTcsImV4cCI6MjA4NTM1NTk1N30._GmDrqRHxA7kffWyFHZpOlS8ecWV53EuUnKOGp1I6yM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// 1. LOGIN
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();
    if (error || !user) return res.status(401).json({ pesan: "Salah password bos!" });
    res.json({ pesan: "Login sukses!", user: { name: user.name, role: user.role, username: user.username } });
});

// --- [UPDATE PENTING DI SINI] ---
// 2. AMBIL SEMUA BUKU + HITUNG ESTIMASI KEMBALI (READ)
app.get('/api/buku', async (req, res) => {
    // A. Ambil semua data buku
    const { data: listBuku, error } = await supabase
        .from('buku')
        .select('*')
        .order('id', { ascending: true });

    if (error) return res.status(500).json({ pesan: error.message });

    // B. Ambil data transaksi yang sedang dipinjam (buat cek tanggal balik)
    const { data: listPinjaman } = await supabase
        .from('transaksi')
        .select('*')
        .eq('status', 'Dipinjam');

    // C. Logika "Perjodohan" Data
    const bukuLengkap = listBuku.map(buku => {
        // Cuma proses kalau stok habis (<= 0)
        if (buku.stok <= 0) {
            // Cari transaksi pinjaman untuk judul buku ini
            const pinjamanBukuIni = listPinjaman.filter(p => p.buku_judul === buku.judul);
            
            if (pinjamanBukuIni.length > 0) {
                // Urutkan tanggal (cari yang paling cepat balik)
                pinjamanBukuIni.sort((a, b) => new Date(a.tgl_jatuh_tempo) - new Date(b.tgl_jatuh_tempo));
                
                // Ambil tanggal terdekat & Format jadi "25 Mei"
                const tglBalik = new Date(pinjamanBukuIni[0].tgl_jatuh_tempo);
                buku.estimasi = tglBalik.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            }
        }
        return buku;
    });

    res.json(bukuLengkap);
});

// 3. TAMBAH BUKU BARU (CREATE)
app.post('/api/buku', async (req, res) => {
    const { judul, penulis, kategori, stok, cover } = req.body;
    const { data, error } = await supabase.from('buku').insert([{ judul, penulis, kategori, stok, cover }]).select();
    if (error) return res.status(500).json({ pesan: error.message });
    res.json({ pesan: "Buku berhasil disimpan!", data });
});

// 4. UPDATE BUKU (EDIT)
app.put('/api/buku/:id', async (req, res) => {
    const { id } = req.params;
    const { judul, penulis, kategori, stok, cover } = req.body;
    const { data, error } = await supabase.from('buku').update({ judul, penulis, kategori, stok, cover }).eq('id', id).select();
    if (error) return res.status(500).json({ pesan: error.message });
    res.json({ pesan: "Buku berhasil diupdate!", data });
});

// 5. HAPUS BUKU (DELETE)
app.delete('/api/buku/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('buku').delete().eq('id', id);
    if (error) return res.status(500).json({ pesan: error.message });
    res.json({ pesan: "Buku dihapus." });
});

// 6. PINJAM BUKU
app.post('/api/pinjam', async (req, res) => {
    const { bukuId, namaPeminjam } = req.body;
    
    // Cek Stok
    const { data: buku } = await supabase.from('buku').select('*').eq('id', bukuId).single();
    if (!buku || buku.stok <= 0) return res.status(400).json({ pesan: "Stok habis!" });

    // Kurangi Stok
    await supabase.from('buku').update({ stok: buku.stok - 1 }).eq('id', bukuId);

    // Catat Transaksi (+7 Hari)
    const hariIni = new Date();
    const tenggat = new Date(); 
    tenggat.setDate(hariIni.getDate() + 7);
    
    await supabase.from('transaksi').insert([{
        peminjam: namaPeminjam, 
        buku_judul: buku.judul, 
        tgl_pinjam: hariIni.toISOString(), 
        tgl_jatuh_tempo: tenggat.toISOString(), 
        status: 'Dipinjam'
    }]);

    res.json({ pesan: "Berhasil!", tenggat: tenggat.toLocaleDateString() });
});

// 7. DASHBOARD ADMIN
app.get('/api/admin/transaksi', async (req, res) => {
    const { data } = await supabase.from('transaksi').select('*').eq('status', 'Dipinjam').order('tgl_jatuh_tempo', { ascending: true });
    res.json(data);
});

app.listen(PORT, () => console.log(`🚀 Server Fullstack Siap di http://localhost:${PORT}`));