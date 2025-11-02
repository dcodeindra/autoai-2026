process.on("unhandledRejection", (err) => console.error(chalk.red.bold(err)));

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const Pino = require("pino");
const fs = require('fs');
const path = require('path');
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const fakeUserAgent = require('fake-useragent');
const config = require('./config');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const chalk = require('chalk');
const crypto = require('crypto');
const FormData = require('form-data');
const archiver = require('archiver');

let isAiEnabled = config.autoAI;
let isProcessingAI = false; 

const systemInstruction = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf-8').trim();

const geminiApiKey = process.env.GEMINI_API_KEY || "AIzaSyCEuCpz27h10H2zIvqquael8bbwUjg6N0c"; 
if (!geminiApiKey) {
    console.error(chalk.red.bold("GEMINI_API_KEY tidak ditemukan. Harap atur di environment variable atau langsung di main.js."));
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
const geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [
        { "google_search": {} }
    ]
});

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function extractJson(text) {
    try {
        const match = text.match(/{[\s\S]*}/);
        if (match && match[0]) {
            return JSON.parse(match[0]); 
        }
        
        const markdownMatch = text.match(/```json([\s\S]*?)```/);
        if (markdownMatch && markdownMatch[1]) {
            const innerMatch = markdownMatch[1].match(/{[\s\S]*}/);
            if (innerMatch && innerMatch[0]) {
                return JSON.parse(innerMatch[0]);
            }
        }

        return null; 
    } catch (e) {
        console.error(chalk.red.bold("Gagal mem-parsing JSON yang diekstrak:"), text, e.message);
        return null;
    }
}

async function generateImage(prompt) {
    try {
        const url = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
        const headers = { "User-Agent": fakeUserAgent() };
        
        const res = await axios.get(url, { 
            headers, 
            responseType: 'arraybuffer' 
        });

        if (res.headers['content-type'] && res.headers['content-type'].startsWith('image/')) {
            const base64Image = Buffer.from(res.data, 'binary').toString('base64');
            const mimeType = res.headers['content-type'];
            const imageUrl = `data:${mimeType};base64,${base64Image}`;
            
            return { success: true, imageUrl: imageUrl };
        } else {
            try {
                const errorJson = JSON.parse(res.data.toString());
                return { success: false, message: errorJson.message || "API mengembalikan respons non-gambar" };
            } catch(e) {
                return { success: false, message: "API mengembalikan respons non-gambar yang tidak dikenal" };
            }
        }
    } catch (e) {
        console.error(chalk.red.bold("Error di generateImage:"), e.message);
        return { success: false, message: `Terjadi kesalahan saat membuat gambar: ${e.message}`, error: e.message };
    }
}

function generateTokenForTalknotes(secretKey) {
    const timestamp = Date.now().toString();
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(timestamp);
    const token = hmac.digest('hex');
    return { "x-timestamp": timestamp, "x-token": token };
}

async function transcribeWithTalknotes(buffer) {
    try {
        const form = new FormData();
        form.append('file', buffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
        const tokenData = generateTokenForTalknotes('w0erw90wr3rnhwoi3rwe98sdfihqio432033we8rhoeiw');
        const headers = { ...form.getHeaders(), 'x-timestamp': tokenData['x-timestamp'], 'x-token': tokenData['x-token'], "origin": "[https://talknotes.io](https://talknotes.io)", "referer": "[https://talknotes.io/](https://talknotes.io/)", "user-agent": fakeUserAgent() };
        const response = await axios.post('[https://api.talknotes.io/tools/converter](https://api.talknotes.io/tools/converter)', form, { headers });
        return response.data;
    } catch (error) {
        console.error(chalk.red.bold("Error saat transkripsi Talknotes:"), error.message);
        return null;
    }
}

function loadAiHistory(sender) {
    const dir = path.join(__dirname, 'database', 'ai');
    ensureDir(dir);
    const file = path.join(dir, `${sender}.json`);
    if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file)); } catch { return []; } }
    return [];
}

function saveAiHistory(sender, history) {
    const dir = path.join(__dirname, 'database', 'ai');
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${sender}.json`), JSON.stringify(history, null, 2));
}


async function start() {
    const { version } = await fetchLatestBaileysVersion();
    const sessionsDir = path.join(__dirname, 'sessions');
    ensureDir(sessionsDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);

    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        logger: Pino({ level: "silent" }),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "silent" })) }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log(chalk.red(`Koneksi terputus, menyambungkan kembali...`));
                start();
            } else {
                console.log(chalk.red(`Koneksi terputus permanen, hapus folder 'sessions' dan scan ulang.`));
            }
        } else if (connection === 'open') {
            console.log(chalk.green('Koneksi WhatsApp berhasil tersambung.'));
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const sender = msg.key.participant ? msg.key.participant : msg.key.remoteJid;
        const isOwner = sender.startsWith(config.ownerNumber);
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || msg.message.documentMessage?.caption || "";

        console.log(chalk.cyan('[PESAN MASUK]') + chalk.white(` Dari: ${sender} | Tipe: ${text ? 'Teks' : 'Media'}`));

        if (text.toLowerCase() === '.backup' && isOwner) {
            try {
                await sock.sendMessage(jid, { text: "Memulai proses backup..." }, { quoted: msg });
                const backupFileName = `backup-${Date.now()}.zip`;
                const output = fs.createWriteStream(backupFileName);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', async () => {
                    console.log(chalk.blue(`Backup selesai: ${backupFileName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`));
                    await sock.sendMessage(jid, {
                        document: { url: backupFileName },
                        mimetype: 'application/zip',
                        fileName: backupFileName
                    }, { quoted: msg });
                    fs.unlinkSync(backupFileName);
                });

                archive.on('warning', (err) => { if (err.code !== 'ENOENT') throw err; });
                archive.on('error', (err) => { throw err; });
                archive.pipe(output);
                archive.glob('**/*', {
                    cwd: __dirname,
                    ignore: ['node_modules/**', 'sessions/**', '*.zip']
                });
                await archive.finalize();
            } catch (error) {
                console.error(chalk.red.bold("Error saat backup:"), error);
                await sock.sendMessage(jid, { text: `Gagal membuat backup: ${error.message}` }, { quoted: msg });
            }
            return;
        }

        const setAiStatus = async (status) => {
            isAiEnabled = status;
            try {
                let configPath = path.join(__dirname, 'config.js');
                let configContent = fs.readFileSync(configPath, 'utf8');
                let newContent = configContent.replace(/(autoAI:\s*).+?,/, `$1${status},`);
                fs.writeFileSync(configPath, newContent, 'utf8');
                await sock.sendMessage(jid, { text: `✅ Auto AI berhasil di-${status ? 'aktifkan' : 'nonaktifkan'}.` }, { quoted: msg });
            } catch (error) {
                console.error(chalk.red.bold("Gagal mengubah config:"), error);
                await sock.sendMessage(jid, { text: "Gagal menyimpan status AI ke config." }, { quoted: msg });
            }
        };

        if (text.toLowerCase() === '.aion' && isOwner) return await setAiStatus(true);
        if (text.toLowerCase() === '.aioff' && isOwner) return await setAiStatus(false);
        
        if (!isAiEnabled) return;

        if (config.react) {
            await sock.sendMessage(jid, { react: { text: config.react, key: msg.key } });
        }

        if (isProcessingAI) {
            await sock.sendMessage(jid, { text: "🤖 AI sedang sibuk, mohon tunggu beberapa saat sebelum mengirim perintah baru." }, { quoted: msg });
            return; 
        }

        const rawHistory = loadAiHistory(sender.split('@')[0]);
        const userHistory = rawHistory.map(item => ({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content || "" }]
        }));

        const systemPromptInjection = {
            role: 'user',
            parts: [{ text: systemInstruction }]
        };
        
        const modelAck = {
            role: 'model',
            parts: [{ text: 'Oke, saya mengerti. Saya Indra AI, siap mematuhi instruksi.' }]
        };

        const fullHistory = [systemPromptInjection, modelAck, ...userHistory];

        const chat = geminiModel.startChat({ history: fullHistory });

        try {
            isProcessingAI = true; 

            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            let targetMedia;
            let mediaType = '';
            let isSticker = false;

            if (msg.message.imageMessage) { mediaType = 'image'; targetMedia = msg.message.imageMessage; }
            else if (msg.message.videoMessage) { mediaType = 'video'; targetMedia = msg.message.videoMessage; }
            else if (msg.message.documentMessage) { mediaType = 'document'; targetMedia = msg.message.documentMessage; }
            else if (msg.message.audioMessage) { mediaType = 'audio'; targetMedia = msg.message.audioMessage; }
            else if (msg.message.stickerMessage) { mediaType = 'image'; isSticker = true; targetMedia = msg.message.stickerMessage; }
            else if (quotedMsg) {
                if (quotedMsg.imageMessage) { mediaType = 'image'; targetMedia = quotedMsg.imageMessage; }
                else if (quotedMsg.videoMessage) { mediaType = 'video'; targetMedia = quotedMsg.videoMessage; }
                else if (quotedMsg.documentMessage) { mediaType = 'document'; targetMedia = quotedMsg.documentMessage; }
                else if (quotedMsg.audioMessage) { mediaType = 'audio'; targetMedia = quotedMsg.audioMessage; }
                else if (quotedMsg.stickerMessage) { mediaType = 'image'; isSticker = true; targetMedia = quotedMsg.stickerMessage; }
            }

            let promptParts = [];
            let userPromptForHistory = ""; 

            if (targetMedia && targetMedia.mediaKey) {
                if (mediaType === 'audio') {
                    await sock.sendMessage(jid, { text: "🎙️ Memproses audio..." }, { quoted: msg });
                    const stream = await downloadContentFromMessage(targetMedia, 'audio');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    if (buffer.length > 5 * 1024 * 1024) return await sock.sendMessage(jid, { text: "Maaf, ukuran audio maksimal 5MB." }, { quoted: msg });
                    
                    const transcriptResult = await transcribeWithTalknotes(buffer);
                    if (!transcriptResult || !transcriptResult.text) return await sock.sendMessage(jid, { text: "Gagal mentranskrip audio." }, { quoted: msg });
                    
                    const transcribedText = transcriptResult.text;
                    console.log(chalk.yellow(`[TRANSKRIPSI]`) + chalk.white(` ${sender.split('@')[0]}: ${transcribedText}`));
                    
                    userPromptForHistory = transcribedText;
                    promptParts.push(transcribedText);
                } else {
                    const stream = await downloadContentFromMessage(targetMedia, mediaType);
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    
                    userPromptForHistory = text || (isSticker ? "Deskripsikan stiker ini." : "Analisis media ini.");
                    const mediaPart = { inlineData: { data: buffer.toString("base64"), mimeType: targetMedia.mimetype } };
                    
                    promptParts.push(userPromptForHistory, mediaPart);
                }
            } else if (text) {
                userPromptForHistory = text;
                promptParts.push(text);
            } else {
                isProcessingAI = false; 
                return;
            }

            const result = await chat.sendMessage(promptParts);
            const response = result.response;
            const responseText = response.text();

            let modelResponseForHistory = responseText; 
            
            let aiRes = extractJson(responseText);

            if (aiRes && aiRes.cmd) {
                modelResponseForHistory = JSON.stringify(aiRes); 

                if (aiRes.cmd === "bingimg" && aiRes.cfg?.prompt) {
                    console.log(chalk.magenta('[IMAGE GEN]') + chalk.white(` Prompt: ${aiRes.cfg.prompt}`));
                    await sock.sendMessage(jid, { text: aiRes.msg || "Sedang membuat gambar..." }, { quoted: msg });
                    
                    const imgResult = await generateImage(aiRes.cfg.prompt);
                    
                    if (imgResult.success) {
                        const buffer = Buffer.from(imgResult.imageUrl.split(',')[1], 'base64');
                        await sock.sendMessage(jid, { image: buffer }, { quoted: msg });
                        modelResponseForHistory = `(Berhasil mengirim gambar: ${aiRes.cfg.prompt})`; 
                    } else {
                        const errorMsg = `Gagal membuat gambar: ${imgResult.message}`;
                        await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
                        modelResponseForHistory = errorMsg; 
                    }
                } else if (aiRes.cmd === "tiktok" && aiRes.cfg?.url) {
                    console.log(chalk.blue('[TIKTOK DL]') + chalk.white(` URL: ${aiRes.cfg.url}`));
                    const loadingMsg = aiRes.msg || "Sedang mengunduh konten TikTok... 🎥";
                    await sock.sendMessage(jid, { text: loadingMsg }, { quoted: msg });
                    modelResponseForHistory = loadingMsg; 

                    try {
                        const tiktokApiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(aiRes.cfg.url)}`;
                        const ttResponse = await axios.get(tiktokApiUrl);
                        
                        if (ttResponse.data && ttResponse.data.status && ttResponse.data.data) {
                            const tiktokData = ttResponse.data.data;
                            const mediaCaption = tiktokData.metadata?.title || tiktokData.metadata?.description || "Ini konten TikTok yang kamu minta!";
                            let success = false;

                            if (tiktokData.type === 'video' && tiktokData.urls && tiktokData.urls.length > 1) {
                                const videoUrl = tiktokData.urls[1]; 
                                await sock.sendMessage(jid, { video: { url: videoUrl }, caption: mediaCaption }, { quoted: msg });
                                success = true;
                            
                            } else if (tiktokData.type === 'photo' && tiktokData.urls && tiktokData.urls.length > 1) {
                                const imageUrl = tiktokData.urls[1]; 
                                await sock.sendMessage(jid, { image: { url: imageUrl }, caption: mediaCaption }, { quoted: msg });
                                success = true;
                            
                            } else if (tiktokData.type === 'slideshow' && tiktokData.urls && tiktokData.urls.length > 0) {
                                let isFirstSlide = true;
                                for (const slideUrls of tiktokData.urls) { 
                                    if (slideUrls.length > 1) {
                                        const imageUrl = slideUrls[1]; 
                                        
                                        if (isFirstSlide) {
                                            await sock.sendMessage(jid, { image: { url: imageUrl }, caption: mediaCaption }, { quoted: msg });
                                            isFirstSlide = false;
                                        } else {
                                            await sock.sendMessage(jid, { image: { url: imageUrl } }, { quoted: msg });
                                        }
                                    }
                                }
                                success = true;
                            }
                            
                            if(success) {
                                modelResponseForHistory = `Berhasil mengirim konten TikTok: ${mediaCaption}`;
                            } else {
                                throw new Error("Tipe konten TikTok tidak didukung atau URL tidak valid (urls[1] tidak ditemukan).");

                            }
                        } else {
                            throw new Error("Format respons API TikTok tidak valid atau tidak ada data.");
                        }
                    } catch (error) {
                        console.error(chalk.red.bold("Error saat download TikTok:"), error.message);
                        const errorMsg = "Gagal mengunduh konten TikTok tersebut. 😥";
                        await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
                        modelResponseForHistory = errorMsg; 
                    }
                } else {
                    const reply = aiRes.msg || "Perintah tidak dikenali.";
                    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
                    modelResponseForHistory = reply;
                }
            } else {
                const reply = responseText.replace(/\[\d+\]/g, ""); 
                await sock.sendMessage(jid, { text: reply }, { quoted: msg });
            }

            rawHistory.push({ role: "user", content: userPromptForHistory });
            rawHistory.push({ role: "assistant", content: modelResponseForHistory });
            saveAiHistory(sender.split('@')[0], rawHistory);

        } catch (error) {
            console.error(chalk.red.bold("Error utama pada messages.upsert:"), error);
            await sock.sendMessage(jid, { text: `Terjadi kesalahan internal pada bot: ${error.message}` }, { quoted: msg });
        } finally {
            isProcessingAI = false;
        }
    });
}

start();