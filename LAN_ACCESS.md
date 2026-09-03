# 📱 Panduan Akses dari HP/Laptop Lain (LAN/WiFi)

Panduan lengkap untuk mengakses Bawaslu Project dari HP, tablet, atau laptop lain dalam jaringan WiFi yang sama.

---

## 🎯 Ringkasan Singkat

### Setup Pertama Kali (Sekali Saja):

1. **Buka Windows Firewall** (as Administrator):
   ```batch
   setup-firewall.bat
   ```
   *Klik kanan → Run as administrator*

### Setiap Kali Mau Demo/Akses:

2. **Jalankan Server**:
   ```batch
   start.bat
   ```

3. **Catat IP Address** yang muncul (misal: `192.168.1.100`)

4. **Akses dari Device Lain**:
   - Buka browser di HP/laptop lain
   - Ketik: `http://192.168.1.100:8080`
   - ✅ Pastikan terhubung WiFi yang SAMA!

---

## 📋 Panduan Detail

### 🔧 Setup Awal (Sekali Saja)

#### Langkah 1: Buka Port di Windows Firewall

Windows Firewall secara default memblokir koneksi dari luar. Kita perlu membuka port 8080.

**Cara Otomatis (Recommended):**

1. Klik kanan file `setup-firewall.bat`
2. Pilih **"Run as administrator"**
3. Tekan tombol apapun untuk konfirmasi
4. Tunggu muncul pesan "SUKSES!"

**Cara Manual (jika script gagal):**

1. Buka Command Prompt as Administrator
2. Jalankan perintah:
   ```cmd
   netsh advfirewall firewall add rule name="Bawaslu Server Port 8080" dir=in action=allow protocol=TCP localport=8080
   ```

#### Langkah 2: Pastikan WiFi Setting Private Network

1. Buka **Settings** → **Network & Internet**
2. Klik **WiFi** → Klik nama WiFi Anda
3. Di bagian **"Network profile type"**, pilih **Private**
   - ❌ Jangan gunakan "Public" - akan diblokir Windows

---

### 🚀 Menjalankan Server untuk LAN Access

#### Opsi 1: Background Mode (Recommended)

```batch
start.bat
```

- Server jalan di background
- Terminal akan tampil IP address lalu auto-close
- Server tetap jalan setelah terminal ditutup

#### Opsi 2: Window Mode (Untuk Debugging)

```batch
start-window.bat
```

- Server jalan di window terpisah
- Bisa lihat log realtime
- Jangan tutup window server!

---

### 📱 Cara Akses dari HP/Laptop Lain

#### Mendapatkan IP Address

**Cara 1: Lihat saat start server**
```batch
start.bat
```
IP akan ditampilkan sebelum terminal auto-close (tunggu 10 detik).

**Cara 2: Jalankan script khusus**
```batch
get-local-ip.bat
```

**Cara 3: Manual via Command Prompt**
```cmd
ipconfig
```
Cari baris "IPv4 Address" yang dimulai dengan `192.168.` atau `10.`

#### Contoh IP yang Valid:
- ✅ `192.168.1.100`
- ✅ `192.168.0.25`
- ✅ `10.0.0.5`
- ❌ `127.0.0.1` (ini localhost, tidak bisa diakses dari luar)

#### Akses dari Browser

1. **Pastikan device terhubung WiFi yang SAMA**
2. Buka browser (Chrome, Safari, Firefox, dll)
3. Ketik di address bar:
   ```
   http://[IP-ADDRESS]:8080
   ```
   Contoh: `http://192.168.1.100:8080`
4. Tekan Enter

#### Testing Koneksi

Jika halaman tidak muncul, coba ping dari device lain:

```bash
# Di HP (gunakan app "Network Tools" dari Play Store/App Store)
# Atau di laptop lain:
ping 192.168.1.100
```

Jika ping berhasil tapi browser tidak bisa akses → cek firewall.

---

## 🆘 Troubleshooting

### ❌ "This site can't be reached" / "Connection refused"

**Kemungkinan Penyebab:**

1. **Server belum jalan**
   ```batch
   status.bat
   ```
   Jika tidak jalan, jalankan `start.bat`

2. **Firewall belum dibuka**
   ```batch
   setup-firewall.bat  (as admin)
   ```

3. **WiFi berbeda**
   - Cek komputer server: terhubung WiFi apa?
   - Cek HP/laptop: terhubung WiFi yang sama?

4. **IP salah**
   ```batch
   get-local-ip.bat
   ```
   Pastikan IP yang diakses benar.

5. **WiFi dalam mode "Public Network"**
   - Ubah ke "Private Network" di Windows Settings

6. **Antivirus/Security Software blocking**
   - Tambahkan exception untuk port 8080
   - Atau disable sementara untuk testing

### ❌ Koneksi lambat / timeout

**Solusi:**

1. **Cek jarak dan kualitas WiFi**
   - Dekatkan device ke router
   - Pastikan sinyal WiFi kuat

2. **Tutup aplikasi lain yang pakai bandwidth**
   - YouTube, Netflix, download, dll

3. **Restart router WiFi**

### ❌ Hanya bisa akses dari beberapa device

**Kemungkinan:**

1. **Router memiliki isolation mode (AP Isolation)**
   - Biasa di WiFi hotel/cafe
   - Solusi: Ubah setting router (admin only)

2. **Device menggunakan VPN**
   - Matikan VPN di device yang akan akses

### ❌ IP Address berubah-ubah

**Solusi: Set Static IP**

1. Buka **Network Connections** di Windows
2. Klik kanan adapter WiFi → **Properties**
3. Pilih **Internet Protocol Version 4 (TCP/IPv4)**
4. Klik **Properties**
5. Pilih **"Use the following IP address"**
6. Isi:
   - IP address: `192.168.1.100` (atau sesuai range router)
   - Subnet mask: `255.255.255.0`
   - Default gateway: IP router (biasanya `192.168.1.1`)
   - DNS: `8.8.8.8` dan `8.8.4.4`

---

## 🔐 Keamanan

### ⚠️ Hal yang Perlu Diperhatikan

1. **Port 8080 terbuka = Siapa saja di WiFi bisa akses**
   - Pastikan hanya orang yang dipercaya di WiFi
   - Jangan gunakan di WiFi publik (cafe, mall, dll)

2. **Data Personel adalah PII (Personally Identifiable Information)**
   - Jangan demo di WiFi publik
   - Hanya gunakan di WiFi kantor yang aman

3. **Tutup Port Setelah Selesai**
   ```batch
   remove-firewall.bat  (as admin)
   ```

### ✅ Best Practice

1. **Untuk Demo Internal Kantor:**
   - ✅ Setup firewall
   - ✅ Jalankan server saat perlu
   - ✅ Bagikan IP hanya ke yang perlu
   - ✅ Stop server setelah demo

2. **Untuk Development:**
   - ✅ Gunakan `start-local.bat` (localhost only)
   - ✅ Tidak perlu buka firewall

3. **Untuk Presentasi:**
   - ✅ Setup firewall
   - ✅ Jalankan server
   - ✅ Demo
   - ✅ Stop server
   - ✅ Remove firewall rule

---

## 📝 Checklist Demo

Sebelum demo/presentasi, pastikan:

- [ ] Firewall sudah dibuka (`setup-firewall.bat`)
- [ ] Server sudah jalan (`start.bat`)
- [ ] IP sudah dicatat (`get-local-ip.bat`)
- [ ] Device tester terhubung WiFi yang sama
- [ ] Test akses dari 1 device dulu sebelum presentasi
- [ ] Browser di HP/laptop sudah dibuka dan siap

---

## 🔄 Workflow Kantor

### Scenario: Daily Standup Meeting

```batch
# Pagi, sebelum meeting:
1. start.bat
2. get-local-ip.bat
3. [Catat IP di whiteboard/chat group]

# Saat meeting:
- Tim akses via browser di laptop/HP masing-masing
- http://[IP]:8080

# Setelah meeting:
4. stop.bat
```

### Scenario: Client Presentation (Di Kantor)

```batch
# Setup awal (hari H-1):
1. setup-firewall.bat (as admin)
2. Test akses dari laptop lain

# Saat presentasi:
1. start.bat
2. [Tunjukkan di proyektor + biarkan client coba di device mereka]

# Setelah presentasi:
3. stop.bat
```

---

## 📞 Bantuan Lebih Lanjut

Jika masih ada masalah:

1. ✅ Cek dokumentasi lengkap: `SCRIPTS_GUIDE.md`
2. ✅ Cek quick start: `QUICK_START.txt`
3. ✅ Run diagnostics: `status.bat` dan `get-local-ip.bat`

---

**Catatan:** Server menggunakan `0.0.0.0` sebagai host, yang artinya menerima koneksi dari semua network interface. Ini sudah dikonfigurasi di `server.js`.
