# 📋 Panduan Script Batch - Bawaslu Project

Dokumentasi lengkap untuk menjalankan dan mengelola web application Bawaslu menggunakan file batch (.bat).

---

## 📂 Daftar File Batch

### 🚀 Menjalankan Server

| File | Deskripsi | Kapan Digunakan |
|------|-----------|-----------------|
| `start.bat` | Start server di background (auto-close) | **Default** - Server jalan, terminal auto tutup |
| `start-window.bat` | Start server di window terpisah | Ingin lihat log realtime |
| `start-local.bat` | Server lokal saja (localhost only) | Development tanpa LAN access |

### 🌐 Akses Jaringan Lokal (LAN/WiFi)

| File | Deskripsi |
|------|-----------|
| `get-local-ip.bat` | Tampilkan IP address untuk akses dari device lain |
| `setup-firewall.bat` | Buka port 8080 di Windows Firewall (perlu Admin) |
| `remove-firewall.bat` | Tutup port 8080 di Windows Firewall (perlu Admin) |

### 🛑 Menghentikan Server

| File | Deskripsi |
|------|-----------|
| `stop.bat` | Hentikan server (auto-close) |

### 🔄 Restart & Status

| File | Deskripsi |
|------|-----------|
| `restart.bat` | Restart server (stop + start) |
| `status.bat` | Cek status server dan lihat log |
| `view-logs.bat` | Lihat log secara realtime |

### 🎛️ Control Panel

| File | Deskripsi |
|------|-----------|
| `bawaslu.bat` | Menu interaktif lengkap untuk semua operasi |
| `open-project.bat` | Quick open: browser + folder + check server |

---

## 🎯 Cara Penggunaan

### 1️⃣ Menjalankan Server (Default - Background Mode)

```batch
start.bat
```

Server akan:
- ✅ Jalan di background (tanpa window)
- ✅ Terminal otomatis tutup setelah 10 detik
- ✅ Tampilkan IP untuk akses LAN/WiFi
- ✅ Log tersimpan di file `server.log`

### 2️⃣ Menjalankan dengan Window (Lihat Log)

```batch
start-window.bat
```

Server akan:
- ✅ Jalan di window terpisah
- ✅ Bisa lihat log langsung
- ❌ Jangan tutup window server!

### 3️⃣ Menjalankan Server Lokal Saja (Localhost Only)

```batch
start-local.bat
```

Cocok untuk:
- Development lokal saja
- Tidak perlu akses dari HP/laptop lain
- Testing cepat

### 4️⃣ Setup Akses dari HP/Laptop Lain (WiFi Sama)

**Langkah pertama kali (sekali saja):**

```batch
setup-firewall.bat
```
*Klik kanan → Run as administrator*

Script akan membuka port 8080 di Windows Firewall.

**Setiap kali mau akses:**

1. Jalankan server:
   ```batch
   start.bat
   ```

2. Catat IP yang muncul (contoh: 192.168.1.100)

3. Di HP/laptop lain (WiFi sama):
   - Buka browser
   - Ketik: `http://192.168.1.100:8080`

**Cek IP kapan saja:**
```batch
get-local-ip.bat
```

### 5️⃣ Menghentikan Server

```batch
stop.bat
```

Terminal akan otomatis tutup setelah server berhenti.

### 6️⃣ Restart Server
1. Cek proses Node.js yang berjalan
2. Tampilkan daftar proses
3. Minta konfirmasi sebelum menghentikan
4. Matikan semua server dan tunnel

### 5️⃣ Restart Server

```batch
restart.bat
```

Otomatis menghentikan dan menjalankan kembali server.

### 6️⃣ Cek Status Server

```batch
status.bat
```

Menampilkan:
- ✅ Status server (jalan/tidak)
- ✅ Daftar proses Node.js aktif
- ✅ 5 baris terakhir dari log
- ✅ URL akses lokal

### 7️⃣ Melihat Log Realtime

```batch
view-logs.bat
```

Pilihan:
1. **Server Log** - Log dari Node.js
2. **Tunnel Log** - Log dari SSH tunnel
3. **Kedua-duanya** - Buka keduanya di window terpisah

---

## 🔍 File Log

Ketika menjalankan **background mode**, log akan tersimpan di:

| File | Isi |
|------|-----|
| `server.log` | Log dari server Node.js/Express |
| `tunnel.log` | Log dari SSH tunnel (berisi URL publik) |

### Cara Melihat URL Publik (Background Mode):

```batch
type tunnel.log
```

Atau gunakan `view-logs.bat` pilihan 2.

---

## ⚙️ Port dan URL

| Tipe Akses | URL | Keterangan |
|------------|-----|------------|
| Lokal (komputer ini) | `http://localhost:8080` | Hanya bisa diakses dari komputer sendiri |
| LAN/WiFi | `http://192.168.x.x:8080` | Bisa diakses dari HP/laptop lain (WiFi sama) |

**Cara mendapat IP LAN:**
```batch
get-local-ip.bat
```
Atau lihat saat `start.bat` dijalankan.

---

## 🆘 Troubleshooting

### ❌ Error: "Port 8080 already in use"

**Solusi:**
```batch
stop.bat
```
Lalu jalankan ulang `start.bat`

### ❌ Tidak bisa akses dari HP/laptop lain

**Checklist:**
1. ✅ Server sudah jalan? → `status.bat`
2. ✅ Device lain terhubung WiFi yang SAMA?
3. ✅ Windows Firewall sudah dibuka? → `setup-firewall.bat` (as admin)
4. ✅ IP sudah benar? → `get-local-ip.bat`
5. ✅ WiFi setting bukan "Public Network"? → Ubah ke "Private Network"

**Cara ubah WiFi ke Private Network:**
1. Settings → Network & Internet
2. WiFi → [Nama WiFi Anda]
3. Network profile type → Private

**Cek firewall manual:**
```batch
netsh advfirewall firewall show rule name="Bawaslu Server Port 8080"
```

### ❌ Server tidak mau berhenti

**Solusi manual:**
```batch
taskkill /f /im node.exe
```

### ❌ Tidak ada node_modules

Script akan otomatis menjalankan `npm install` saat pertama kali.

### ❌ Lupa apakah server masih jalan atau tidak

**Cek status:**
```batch
status.bat
```

### ❌ Lupa IP address

**Tampilkan IP:**
```batch
get-local-ip.bat
```

---

## 💡 Tips & Best Practices

### ✅ Untuk Development di Komputer Sendiri
- Gunakan `start-local.bat` - lebih cepat, localhost only

### ✅ Untuk Demo ke Tim/Kantor (LAN/WiFi)
1. Setup firewall sekali: `setup-firewall.bat` (as admin)
2. Jalankan: `start.bat`
3. Bagikan IP yang muncul ke tim
4. Tim akses via browser: `http://[IP]:8080`

### ✅ Untuk Presentasi dengan HP/Tablet
1. Setup firewall jika belum
2. `start.bat`
3. Catat IP
4. Buka browser di HP: `http://[IP]:8080`

### ✅ Sebelum Meninggalkan Komputer
```batch
status.bat  # Cek apakah server masih jalan
```

### ✅ Setelah Selesai Kerja
```batch
stop.bat  # Hentikan server untuk hemat resource
```

### ✅ Keamanan - Setelah Selesai Demo
```batch
remove-firewall.bat  # Tutup akses dari luar (as admin)
```

---

## 📊 Workflow Rekomendasi

### Skenario 1: Development Harian (Solo)
```batch
1. start-local.bat        # Mulai kerja (localhost only)
2. [koding dan testing]
3. Ctrl+C                 # Stop server
```

### Skenario 2: Demo ke Tim Kantor (LAN)
```batch
# Setup awal (sekali saja):
1. setup-firewall.bat (as admin)

# Setiap demo:
1. start.bat              # Server jalan, tampil IP
2. [bagikan IP ke tim]
3. [demo bersama]
4. stop.bat               # Selesai demo

# Setelah project selesai:
5. remove-firewall.bat (as admin)  # Tutup akses
```

### Skenario 3: Presentasi dengan Multiple Device
```batch
1. setup-firewall.bat (as admin)  # Setup firewall
2. start.bat                      # Jalankan server
3. get-local-ip.bat              # Cek IP jika lupa
4. [Akses dari laptop, HP, tablet - WiFi sama]
5. stop.bat                       # Selesai presentasi
```

### Skenario 4: Server 24/7 (Background)
```batch
1. setup-firewall.bat     # Setup firewall
2. start.bat              # Jalan di background
3. [tutup terminal otomatis]
4. status.bat             # Cek sesekali
5. view-logs.bat          # Lihat aktivitas
```

---

## 🔧 Customisasi

Jika ingin mengubah port atau setting lain, edit file:
- `server.js` - untuk konfigurasi server
- Script `.bat` - untuk mengubah perintah yang dijalankan

---

## 📞 Bantuan Lebih Lanjut

Jika ada masalah:
1. Jalankan `status.bat` untuk diagnostik
2. Lihat log dengan `view-logs.bat`
3. Cek dokumentasi lengkap di `README.md`

---

**Dibuat untuk memudahkan development Bawaslu Project** 🚀
