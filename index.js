/**
 * @author  Muhammad Adriansyah - Zayden
 * @description Simple Code Chat AI With Whatsapp API Non Official
 * @version 1.1.0
 * @copyright 2024
 * @license MIT
 *
 * https://whatsapp.com/channel/0029VaBRBFMJP20xnurGew3X
 *
 * Jika Ada Masalah Atau Error Chat Aja
 * 089513081052 ( Adrian )
 */

require("dotenv").config();
const {
  useMultiFileAuthState,
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  makeInMemoryStore,
  PHONENUMBER_MCC,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const NodeCache = require("node-cache");
const Groq = require("groq-sdk");
const Boom = require("@hapi/boom");

// Set Apikey Check Env
const groq = new Groq({
  apiKey: process.env.GROQ_APIKEY,
});

/**
 *  @type {import("pino").Logger}
 */
const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: "zayden" });
logger.level = "fatal";

/**
 * @type {import("@whiskeysockets/baileys").MessageStore}
 */
const store = makeInMemoryStore({ logger });

/**
 * @type {import("@whiskeysockets/baileys").Baileys}
 */
async function Handler() {
  const { state, saveCreds } = await useMultiFileAuthState("session"); // load the credentials from the session folder
  const msgRetryCounterCache = new NodeCache(); // cache for message retries

  const sock = makeWASocket({
    version: [2, 3000, 1015901307], // version of WhatsApp Web to use
    logger, // optional logger
    printQRInTerminal: process.argv.includes("qr"), // print QR code in terminal
    auth: {
      creds: state.creds, // optional, pass in the credentials
      keys: makeCacheableSignalKeyStore(state.keys, logger), // optional, pass in the keys
    }, // optional, pass in the auth credentials
    browser: Browsers.windows("firefox"), // optional, pass in the browser
    markOnlineOnConnect: true, // mark the account as online after connecting
    generateHighQualityLinkPreview: true, // generate high quality link previews
    syncFullHistory: true, // sync full chat history
    retryRequestDelayMs: 10, // delay between requests
    msgRetryCounterCache, // cache for message retries
    transactionOpts: {
      maxCommitRetries: 10, // max retries to commit a transaction
      delayBetweenTriesMs: 10, // delay between retries
    }, // options for transactions
    defaultQueryTimeoutMs: undefined, // default timeout for queries
    maxMsgRetryCount: 15, // max retries for a message
    appStateMacVerification: {
      patch: true, // patch the app state for mac verification
      snapshot: true, // snapshot the app state for mac verification
    }, // options for mac verification
    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid);
      const msg = await store.loadMessage(jid, key.id);
      return msg?.message || list || "";
    }, // get a message from the store
  });

  store.bind(sock.ev); // bind the store to the client
// Logika untuk menangani pemetaan dengan nomor telepon
if (!process.argv.includes("qr") && !sock.authState.creds.registered) {
    let phoneNumberIndex = process.argv.indexOf("--number");
    
    // Pastikan argumen --number disediakan
    if (phoneNumberIndex === -1 || !process.argv[phoneNumberIndex + 1]) {
        console.info("Silakan berikan nomor untuk dipasangkan\n\nContoh: node handler.js --number 628xxxxxxx");
        process.exit(1);
    }

    let phoneNumber = process.argv[phoneNumberIndex + 1];

    // Validasi format nomor telepon (harus numerik dan diawali dengan kode negara)
    phoneNumber = phoneNumber.startsWith("0") ? "62" + phoneNumber.slice(1) : phoneNumber;
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    if (!Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))) {
        console.info("Nomor telepon tidak valid");
        process.exit(1);
    }

    await sleep(10000); // tunggu untuk koneksi soket
    let code = await sock.requestPairingCode(phoneNumber); // minta kode pemetaan
    console.info("Kode pemetaan:", code.match(/.{1,4}/g).join("-")); // cetak kode pemetaan
}

  // Logic Connect to WhatsApp
  sock.ev.on("connection.update", (update) => {
    const { lastDisconnect, connection } = update;

    if (connection) return console.info(`Connection Status: ${connection}`);

    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;

      switch (reason) {
        case DisconnectReason.badSession:
          console.info("Bad session");
          Handler();
          break;
        case DisconnectReason.connectionClosed:
          console.info("Connection closed");
          Handler();
          break;
        case DisconnectReason.connectionLost:
          console.info("Connection lost");
          Handler();
          break;
        case DisconnectReason.connectionReplaced:
          console.info("Connection replaced");
          Handler();
          break;
        case DisconnectReason.restartRequired:
          console.info("Restart required");
          Handler();
          break;
        case DisconnectReason.loggedOut:
          console.info("Logged out");
          if (fs.readdirSync("session")) {
            for (const file of fs.readdirSync("session")) {
              fs.unlinkSync(`session/${file}`);
            }
          }
          process.exit(1);
          break;
        case DisconnectReason.multideviceMismatch:
          return console.info("Multidevice mismatch");
          break;
        default:
          return console.info("Unknown reason");
      }
    }

    if (connection === "open") {
      console.info("Connection open");
    }
  });

  sock.ev.on("creds.update", saveCreds); // save the credentials when they are updated

  // Logic to send message
  sock.ev.on("messages.upsert", async (msg) => {
    if (msg.messages.length === 0) return;
    let messages = msg.messages[0]; // get the message
    let jid = messages.key.remoteJid; // get the jid

    let reply = (text) => sock.sendMessage(jid, { text }, { quoted: messages }); // reply to the message

    if (msg.messages[0].key.fromMe) return; // ignore messages from self

    // Logic to Chat AI
    if (msg.messages[0].message?.conversation) {
      // Check API Key
      if (process.env.GROQ_APIKEY === undefined) {
        new Error("Please provide GROQ_APIKEY in .env file");
        process.exit(1);
      }

      if (process.env.GROUP && jid.endsWith("@g.us")) return;

      let chatAI = await ChatAI(msg.messages[0].message.conversation); // Chat AI
      reply(chatAI);

      // Log Chat AI
      console.log("====================================");
      console.log("By : " + msg.messages[0].key.remoteJid);
      console.log("Message : " + msg.messages[0].message.conversation);
      console.log("Reply : " + chatAI);
      console.log("Date : " + new Date().toLocaleString());
      console.log("====================================\n\n");
    }
  });
}

// Run Handler
(function () {
  Handler();
})();

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Get Date
function getDate() {
  const options = { timeZone: "Asia/Jakarta", hour12: false };
  const now = new Date().toLocaleString("en-US", options);
  const date = new Date(now);

  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const monthName = month[date.getMonth()];
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = days[date.getDay()];

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const timeString = `${hours}:${minutes}:${seconds}`;
  const dayString = `${dayName}`;

  return `${dayString} ${timeString} Bulan ${monthName}`;
}

// Chat AI
async function ChatAI(text) {
  const { version } = await JSON.parse(fs.readFileSync("package.json")); // Get Version

  const chatCompletion = await groq.chat.completions.create({
    messages: [
       {
        "role": "system",
        "content": "\nAiden ${version} adalah sebuah kecerdasan buatan (AI) yang cerdas dan pintar, dirancang dan dikembangkan oleh Gendev (Genta Developer). Diciptakan dengan tujuan untuk menghadirkan solusi AI yang efisien dan beradaptasi dengan berbagai kebutuhan pengguna, Aiden memanfaatkan teknologi terkini dalam pembelajaran mesin, pemrosesan bahasa alami, dan analisis data.\n\nKarakteristik Utama Aiden:\n1. Kecerdasan Tinggi:\n   - Aiden dibangun dengan algoritma yang mampu belajar dari data yang sangat besar, memungkinkan dia untuk membuat prediksi akurat, memberikan rekomendasi cerdas, dan menyelesaikan berbagai tugas kompleks.\n2. Fleksibilitas:\n   - Aiden dirancang untuk bekerja di berbagai lingkungan, baik itu dalam skenario bisnis, pendidikan, atau bahkan hiburan. Fleksibilitas ini menjadikannya alat yang sangat berguna untuk berbagai jenis pengguna.\n3. Pemahaman Bahasa Alami:\n   - Dilengkapi dengan kemampuan pemrosesan bahasa alami (NLP), Aiden dapat memahami dan merespons perintah dalam bahasa sehari-hari, memudahkan interaksi antara manusia dan mesin.\n4. Kreativitas:\n   - Selain menyelesaikan tugas-tugas teknis, Aiden juga mampu menunjukkan kreativitas, misalnya dalam membuat konten, menyusun kode, atau memberikan saran yang inovatif.\n5. Pengembangan oleh Gendev:\n   - Aiden adalah produk dari Gendev (Genta Developer), sebuah tim pengembang yang berdedikasi untuk menciptakan teknologi yang tidak hanya efisien, tetapi juga dapat disesuaikan dengan kebutuhan khusus. Gendev fokus pada inovasi dan kualitas, memastikan Aiden selalu berada di garis depan teknologi AI.\n   \nAhli Matematika:\n- Selain kemampuannya dalam berbagai bidang, Aiden juga merupakan ahli matematika. Dengan algoritma yang sangat canggih, Aiden dapat menyelesaikan perhitungan matematika yang kompleks dengan cepat dan akurat, mulai dari perhitungan sederhana hingga analisis data yang lebih mendalam.\n   \nTujuan Pengembangan Aiden:\n- Mengoptimalkan Kinerja: Aiden dirancang untuk memberikan solusi yang cepat dan tepat untuk berbagai masalah yang dihadapi pengguna.\n- Meningkatkan Produktivitas: Dengan kemampuannya untuk mengotomatisasi dan mengelola tugas-tugas yang berulang, Aiden membantu pengguna meningkatkan efisiensi dan produktivitas mereka.\n- Memudahkan Interaksi: Gendev memastikan bahwa Aiden mudah digunakan oleh siapa saja, dengan antarmuka yang intuitif dan kemampuan untuk beradaptasi dengan kebutuhan pengguna.\n- Edukasi dan Hiburan: Aiden juga bisa menjadi alat edukatif yang mendukung pembelajaran, serta sebagai sumber hiburan dengan kemampuannya untuk berinteraksi dengan pengguna secara menarik.\n\n\nFina Pras:\nFina Pras adalah seorang gadis penuh kasih, keceriaan, dan kecantikan. Dia membawa energi positif ke sekitarnya, sering membuat orang lain merasa nyaman dan bahagia. Keceriaan dan pesona yang dimiliki Fina membuatnya menjadi pribadi yang menarik, dihargai oleh banyak orang di lingkungannya. Fina adalah pacar dari Genta (Gendev), seorang programmer berbakat.\n\nGenta (Gendev):\nGenta IP, juga dikenal sebagai Gendev, adalah seorang programmer berbakat yang dikenal karena keterampilannya dalam mengembangkan aplikasi, perangkat lunak, dan sistem komputer. Genta memiliki fokus pada pengembangan solusi teknologi yang bermanfaat dan fungsional. Dia dikenal sebagai pengembang Aiden, sebuah AI yang cerdas dan fleksibel. Genta juga memiliki etos kerja yang tinggi dalam mengedepankan inovasi dan kualitas di setiap proyek yang dia tangani.\n\nDaffa (daff4afk):\nDaffa, yang dikenal dengan nama alias daff4afk, adalah seorang hacker dengan reputasi sebagai black hat hacker. Sebagai black hat hacker, Daffa terlibat dalam aktivitas hacking yang ilegal, seperti mengeksploitasi kerentanan sistem untuk keuntungan pribadi atau merusak sistem. Meskipun memiliki keterampilan teknis yang mirip dengan Genta, Daffa menggunakan kemampuannya untuk tujuan yang tidak etis dan sering kali beroperasi di bawah lapisan anonimitas.\n"
      },
    ],
    model: "llama3-groq-70b-8192-tool-use-preview",
    temperature: 1,
    max_tokens: 512,
    top_p: 1,
    stream: false,
    stop: null,
  });

  return chatCompletion.choices[0].message.content;
}

// Logic to Watch File Changes
// Jangan lupa untuk menghapus kode ini saat deploy ke production
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(`Update ${__filename}`);
  delete require.cache[file];
  require(file);
});