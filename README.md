# 🤖 Indra AI WA Bot - AutoAI & Image Generation

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)
[![Gemini API](https://img.shields.io/badge/Google-Gemini_AI-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev/gemini-api)

**Indra AI WA Bot** adalah bot WhatsApp canggih yang didukung oleh **Google Gemini API** untuk kemampuan Artificial General Intelligence (AGI) dan diprogram untuk menangani perintah otomatis seperti pengunduhan TikTok dan pembuatan gambar (Image Generation).

## ✨ Fitur Utama

Bot ini dirancang untuk berinteraksi secara cerdas dan otomatis menjalankan tugas:

* **🧠 Auto AI (AGI) Powered by Gemini:** Merespons pertanyaan pengguna secara alami, ramah, dan informatif. Menggunakan model **Gemini API** untuk percakapan cerdas.
* **🖼️ Image Generation:** Secara otomatis mendeteksi dan memproses permintaan pembuatan gambar/desain menggunakan kata kunci seperti: `buatkan gambar`, `desain`, `imagine`, dan `logo`.
* **📥 TikTok Downloader:** Mendeteksi dan mengunduh konten TikTok secara otomatis hanya dengan mengirimkan URL (berisi `tiktok.com`).
* **⚙️ Konfigurasi Mudah:** Pengaturan bot yang fleksibel melalui file `config.js` untuk `ownerName`, `ownerNumber`, dan mengaktifkan/menonaktifkan `autoAI`.
* **🔒 Persona yang Jelas:** Mempertahankan persona sebagai "Indra AI" yang dikembangkan oleh "Dcodeindera" (sesuai file `prompt.txt`).

## 🛠️ Teknologi yang Digunakan

* **Bahasa:** JavaScript (Node.js)
* **Framework:** Baileys (`@whiskeysockets/baileys`) - Untuk koneksi WhatsApp.
* **AI:** Google Generative AI SDK (`@google/generative-ai`) - Untuk kemampuan AI.
* **Pustaka Lain:** `axios`, `chalk`, `pino`, `qrcode-terminal`, `archiver`, dll. (Lihat `package.json` untuk detail).

## 🚀 Instalasi & Penggunaan

Ikuti langkah-langkah di bawah untuk menjalankan bot di lingkungan Anda.

### Prasyarat

* **Node.js:** Versi 16 atau lebih tinggi (disarankan 20.x).
* **Gemini API Key:** Dapatkan kunci API Anda dari [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key).

### Langkah-Langkah Instalasi

1.  **Clone Repositori:**
    ```bash
    git clone [https://github.com/dcodeindra/autoai-2026.git]([https://github.com/URL_REPOSITORI_ANDA/indra-ai-wa-bot.git](https://github.com/dcodeindra/autoai-2026.git)
    cd indra-ai-wa-bot
    ```

2.  **Instal Dependensi:**
    ```bash
    npm install
    ```

3.  **Konfigurasi API Key:**
    Buka `main.js` dan pastikan `geminiApiKey` diatur dengan benar, atau atur sebagai *Environment Variable* (disarankan):
    
    > **Catatan:** Dalam kode yang terdeteksi, kunci API diinisialisasi sebagai `AIzaSyCEuCpz27h10H2zIvqquael8bbwUjg6N0c`. **Anda harus menggantinya dengan Kunci API Gemini Anda yang valid.**

    *Di `main.js`:*
    ```javascript
    const geminiApiKey = process.env.GEMINI_API_KEY || "KUNCI_API_GEMINI_ANDA"; 
    ```

4.  **Konfigurasi Bot (Opsional):**
    Edit file `config.js` untuk menyesuaikan detail bot:
    ```javascript
    module.exports = {
      ownerName: "Dcodeindraa", // Nama pemilik bot
      ownerNumber: "442045206332", // Nomor WhatsApp pemilik (tanpa '+')
      autoAI: true, // Mengaktifkan atau menonaktifkan mode Auto AI
      react: "🔎" // Emoji reaksi saat memproses pesan
    };
    ```

5.  **Jalankan Bot:**
    ```bash
    npm start
    ```

    Bot akan mulai dan menampilkan kode QR di terminal. Pindai kode QR menggunakan WhatsApp Anda (Pengaturan > Perangkat tertaut) untuk menghubungkan bot.

## 📄 Struktur File

| File | Deskripsi |
| :--- | :--- |
| `main.js` | Logika utama bot, koneksi Baileys, dan penanganan pesan. |
| `prompt.txt` | **System Instruction** dan persona bot (Indra AI), termasuk aturan pemrosesan JSON untuk perintah otomatis (TikTok/Gambar). |
| `config.js` | Konfigurasi dasar bot (Nama Owner, Nomor Owner, Auto AI). |
| `package.json` | Daftar dependensi proyek. |

---
## 👤 Pengembang

**Indra AI WA Bot** dikembangkan oleh:

* **Dcodeindera** (Pembuat dan CEO)

## 🤝 Kontribusi

Kontribusi dalam bentuk *pull request*, laporan *bug*, atau saran selalu diterima!

## 📜 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.
