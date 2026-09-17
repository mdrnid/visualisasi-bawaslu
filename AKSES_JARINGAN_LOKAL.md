# Panduan Akses Jaringan Lokal (WiFi / LAN) & Autostart

Dokumen ini berisi informasi link URL untuk mengakses aplikasi **Visualisasi Personel Bawaslu** dari komputer lain atau HP di jaringan WiFi yang sama, serta panduan menjalankan server secara otomatis saat komputer dinyalakan.

---

## 1. Status Akses Jaringan Lokal

> **STATUS: SUDAH DAPAT DIAKSES!**  
> Server telah dikonfigurasi untuk menerima koneksi dari semua interface jaringan (`HOST=0.0.0.0` pada `PORT=8080`), dan port **8080** telah diizinkan pada **Windows Firewall**.

### Ringkasan Konfigurasi Saat Ini
- **Nama Adapter Jaringan**: Wireless LAN adapter Wi-Fi
- **IP Address Komputer Server**: `192.168.17.223`
- **Port Aplikasi**: `8080`
- **Status Firewall**: Diizinkan (`Rule: Bawaslu Server Port 8080`)

---

## 2. Link URL untuk Mengakses Aplikasi

### A. Dari Komputer Ini (Komputer Server)
Buka browser favorit Anda (Chrome, Edge, dsb) lalu klik atau ketik:
- **Dashboard Utama**: [http://localhost:8080](http://localhost:8080)
- **Landing Page**: [http://localhost:8080/landing.html](http://localhost:8080/landing.html)
- **Halaman Login**: [http://localhost:8080/login.html](http://localhost:8080/login.html)

---

### B. Dari Komputer Lain / Laptop / HP (WiFi yang Sama)
Pastikan perangkat lain (laptop rekan kerja, tablet, atau HP) terhubung ke **jaringan WiFi yang sama**. Kemudian buka browser dan akses URL berikut:

| Halaman | URL Akses Jaringan WiFi | Keterangan |
| :--- | :--- | :--- |
| 📊 **Dashboard Utama** | [http://192.168.17.223:8080](http://192.168.17.223:8080) | Direktori & analitik personel Bawaslu |
| 🌐 **Landing Page** | [http://192.168.17.223:8080/landing.html](http://192.168.17.223:8080/landing.html) | Halaman portal selamat datang |
| 🔐 **Halaman Login** | [http://192.168.17.223:8080/login.html](http://192.168.17.223:8080/login.html) | Halaman autentikasi |
| ⚡ **API Status** | [http://192.168.17.223:8080/api/summary](http://192.168.17.223:8080/api/summary) | Cek status data & backend |

> 💡 **Tips Praktis untuk Pengguna HP/Tablet**:  
> Anda dapat membuat bookmark URL `http://192.168.17.223:8080` di browser HP atau menambahkan shortcut ke Home Screen agar mudah dibuka seperti aplikasi mobile.

---

## 3. Menjalankan Otomatis Saat Komputer Dinyalakan (Autostart)

Telah disediakan script otomatis agar aplikasi langsung menyala di latar belakang setiap kali Anda menghidupkan komputer:

### Cara Mengaktifkan (Cukup 1x Klik):
1. Masuk ke folder project: `d:\Arya Files\kuliah\KKP (BAWASLU)\Project`
2. **Klik dua kali (Double-click)** file:
   👉 **`bat\pasang-startup.bat`** (atau via menu `[5]` di `bawaslu.bat`)
3. Script akan otomatis mendaftarkan server ke folder **Windows Startup** pengguna.
4. **Selesai!** Setiap kali komputer dinyalakan dan login ke Windows, server aplikasi Bawaslu akan langsung aktif di latar belakang (background) tanpa memunculkan jendela CMD hitam yang mengganggu.

### Cara Membatalkan / Menonaktifkan Autostart:
Jika suatu saat Anda tidak ingin server menyala otomatis saat komputer hidup:
- **Klik dua kali (Double-click)** file:
  👉 **`bat\hapus-startup.bat`** (atau via menu `[6]` di `bawaslu.bat`)

### Cara Manual (Alternatif Tanpa Script):
1. Tekan kombinasi tombol keyboard `Windows + R`.
2. Ketik `shell:startup` lalu tekan **Enter**. Jendela folder Startup Windows akan terbuka.
3. Buat shortcut dari file `bat\autostart-bawaslu.bat` dan letakkan di dalam folder tersebut.

---

## 4. Cara Cek Jika IP Komputer Berubah (DHCP)

Sebagian router Wi-Fi menggunakan DHCP, sehingga alamat IP komputer server kadang dapat berganti jika router ter-restart. Jika suatu saat perangkat lain tidak bisa mengakses:

1. **Cara Cepat**:
   - Buka folder project, jalankan file **`bawaslu.bat`**
   - Pilih menu **`[4] Cek IP Address Lokal (WiFi/LAN)`**
   - Atau langsung jalankan file `bat\get-local-ip.bat`
2. Alamat IP WiFi yang baru akan langsung ditampilkan di layar, misalnya `192.168.17.xxx`.
3. Gunakan IP baru tersebut dengan format: `http://[IP_BARU]:8080`.

---

## 5. Bantuan & Troubleshooting

Jika komputer lain di WiFi yang sama masih belum dapat membuka halaman:

1. **Pastikan WiFi Berada di Mode "Private Network"**:
   - Buka **Settings Windows** > **Network & Internet** > **Wi-Fi** > Klik nama WiFi yang sedang terhubung.
   - Ubah tipe jaringan dari **Public network** menjadi **Private network**.
2. **Periksa Windows Firewall**:
   - Jika belum membuka port, jalankan file `bat\setup-firewall.bat` dengan cara: **Klik kanan > Run as administrator**.
   *(Catatan: Aturan firewall untuk port 8080 saat ini sudah aktif).*
3. **Fitur AP / Client Isolation di Router**:
   - Beberapa jaringan WiFi publik (seperti WiFi kafe/kampus) mengaktifkan fitur *Client Isolation* yang melarang antar-device saling berkomunikasi. Jika menggunakan WiFi kantor Bawaslu atau tethering HP, pastikan antar-device diizinkan saling terhubung.
